/************************************************************
 * 1. CONFIGURAÇÕES E UTILITÁRIOS | (atualizado em: 16/03/2026 - 13:15)
 ************************************************************/
const CONFIG = {
  ABERTURA: 'abertura_de_chamado', 
  CAMPO: 'relatorio_em_campo',      
  BASE: 'BASE_CONSOLIDADA',
  ESCALA: 'Escala_diaria_2026',
  STATUS_PADRAO: 'Aguardando atendimento',
  VIAS: 'status_de_vias',
  TELEGRAM: { //IDs para o BOT do Telegram
    TOKEN: '8237808044:AAHJf09271f0oPL88_nFXCmoWRqdu6TIxHU',
    CHATS: { //GP = GRUPO
      /*PARTE 1 - NOVOS CHAMADOS | Todos chegam para o Setor de Entrada e são separados por equipe nos outros 2 grupos*/
      ENTRADA: '-1003862323760', // ANTES -> ABERTURA //TODOS OS CHAMADOS NOVOS P/ GP SETOR DE ENTRADA
      NEW_OPERACIONAL: '-5193056344', //GP CAMPO //CHAMADO NOVOS P/ OPERACIONAL
      NEW_TECNICA: '-5256034455', //GP CHAMADO NOVOS P/ TÉCNICA
      /*PARTE 2 - Compilado e grupo para informações rápidas (tipo estatisticas)*/
      COMPILADO: '-1003750376669', //GP COMPILADO DEFESA CIVIL
      INFO_FAST: '-5199963816', //GP iNFORMAÇÕES RÁPIDAS
      /*PARTE 3 - Chamados criados em campo por cada equipe, servirá como controle interno tbm*/
      AVULSO_OP: '-5068971586', //GP CHAMADOS CRIADOS INLOCO OPERACIONAL
      AVULSO_TEC: '-5244563273', //GP CHAMADOS CRIADOS INLOCO TÉCNICA
      /*PARTE 4 - Chamados atendidos em campo*/
      CAMPO: '-1003815316144' //GP CHAMADOS ATENDIDOS EM CAMPO - OPERACIONAL OU TÉCNICA
    }
  }
};

const sh = (nome) => SpreadsheetApp.getActive().getSheetByName(nome);

  // Recebe "13/03/2026 16:17:00" -> Devolve "13/03/2026"
const formatar = {
  data: (v) => {
    if (!v || v == 'Não informado') return 'Não informado';
    // Se for um objeto de data real, formata para texto BR
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
    return String(v).split(' ')[0];
  },
// Recebe "13/03/2026 16:17:00" -> Devolve "16:17"
  hora: (v) => {
    if (!v || v == '00:00') return '---';
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
    let s = String(v);
    let p = s.includes(' ') ? s.split(' ')[1] : s;
    return p.split(':').slice(0,2).join(':'); // Pega só HH:mm
  }
};

  // ID único para a BASE_CONSOLIDADA
 id: (n, d) => {
    if (!n || !d) return null;
    let dataLimpa = '';
    if (d instanceof Date) {
      dataLimpa = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyyMMdd');
      return `${n}_${dataLimpa}`;
    }
    let s = String(d).split(' ')[0].split('/');
    let dataIso = s.length === 3 ? s[2] + s[1] + s[0] : '00000000';
    return `${n}_${dataIso}`;
  }

  /************************************************************
 * 2. ROTEADOR (O que o seu Acionador de Formulário chama)
 ************************************************************/
function rotearFormulario(e) {
  const nomeAba = e.range.getSheet().getName();
  const dados = e.namedValues;
  const get = (campo) => dados[campo] ? dados[campo][0].trim() : '';

  // 1. SINCRONIZAÇÃO MASTER
  consolidarChamados();

  // 2. LÓGICA DE DISTRIBUIÇÃO (Triagem Automática)
  if (nomeAba === CONFIG.ABERTURA) {
    // Todos os novos vão para a ENTRADA
    notificarAbertura(dados, CONFIG.TELEGRAM.CHATS.ENTRADA);

    // Triagem por Tipologia
    const tipo = get('tipologia_inicial');
    if (tipo.includes('Arbóreo') || tipo.includes('Doação')) {
      notificarAbertura(dados, CONFIG.TELEGRAM.CHATS.NEW_OPERACIONAL);
    } else {
      notificarAbertura(dados, CONFIG.TELEGRAM.CHATS.NEW_TECNICA);
    }
  } 
  
  else if (nomeAba === CONFIG.CAMPO) {
    // Chamados finalizados/agendados vão para o grupo geral de CAMPO
    notificarCampo(dados); 
    // Atualiza os painéis de controle
    msg_Consolidar(formatar.data(get('data_do_chamado')));
    msg_InfoFast(); // Gera a estatística rápida
  }

  // NOVA LÓGICA: Monitoramento de Vias
  else if (nomeAba === CONFIG.VIAS) {
    notificarStatusVia(dados);
  }

  else if (nomeAba === 'aba_avulsos') { // Nome do seu 3º formulário
    const setor = get('Setor Responsável'); // Ideal ter esse campo (OP ou TEC)
    const destino = (setor === 'Operacional') ? CONFIG.TELEGRAM.CHATS.AVULSO_OP : CONFIG.TELEGRAM.CHATS.AVULSO_TEC;
    notificarAvulso(dados, destino);
  }
}

/************************************************************
 * 3. MENSAGEM DE ABERTURA (O seu código de design)
 ************************************************************/
function notificarAbertura(v) {
  const get = (campo) => v[campo] ? v[campo][0].trim() : '';

  // Tratamentos que você criou (00, S/N, etc)
  const numEndRaw = get('numero_do_endereco');
  const numeroEndereco = (numEndRaw === '00' || numEndRaw === '') ? 'S/N' : numEndRaw;
  const pontoRef = get('ponto_de_referencia') || 'Não informado';
  const telefone = (get('telefone_de_contato') === '00' || get('telefone_de_contato') === '') ? 'Não informado' : get('telefone_de_contato');
  const cpf = (get('CPF_do_solicitante') === '00' || get('CPF_do_solicitante') === '') ? 'Não informado' : get('CPF_do_solicitante');
  const horaFormatada = formatar.hora(get('hora_do_chamado'));

  // Lógica de Subtipos
  const camposSubtipos = ['subtipo_arboreo', 'subtipo_acidente_viario', 'subtipo_estrutural', 'subtipo_geologico', 'subtipo_hidrologico', 'subtipo_incendio'];
  const subtipoSelecionado = camposSubtipos.map(c => get(c)).find(valor => valor !== '') || 'Não informado';

  let msg = `🚨 <b>NOVO CHAMADO</b> 🚨\n\n`;
  msg += `<b>📄 CHAMADO ${get('numero_do_chamado')}</b>\n`;
  msg += `📅 <b>Data:</b> ${get('data_do_chamado')}\n`;
  msg += `⏰ <b>Abertura:</b> ${horaFormatada}\n\n`;
  msg += `<b>Situação atual:</b> ${get('situacao_atual')}\n`;
  msg += `<b>Origem:</b> ${get('origem_do_chamado') || 'Não informado'}\n`;
  msg += `🧭 <b>Tipologia:</b> ${get('tipologia_inicial')}\n`;
  msg += `↳ <b>Subtipo:</b> ${subtipoSelecionado}\n`;

  if (get('local_da_arvore')) msg += `<b>Local:</b> ${get('local_da_arvore')}\n`;

  msg += `\n👤 <b>Solicitante:</b> ${get('nome_do_solicitante') || 'Não informado'}\n`;
  msg += `📞 <b>Telefone:</b> ${telefone}\n`;
  msg += `🆔 <b>CPF:</b> ${cpf}\n\n`;

  msg += `📍 ${get('logradouro')}, nº ${numeroEndereco}`;
  if (get('complemento')) msg += ` – ${get('complemento')}`;
  msg += ` – ${get('bairro')}\n`;
  msg += `↳ <b>Ref:</b> ${pontoRef}\n\n`;
  
  if (get('descricao_observacoes')) msg += `📝 <b>Obs:</b> ${get('descricao_observacoes')}`;

  enviarTelegram(CONFIG.TELEGRAM.CHATS.ABERTURA, msg);
}

/************************************************************
 * 4. MENSAGEM DE CAMPO (Atendimento encerrado)
 ************************************************************/
function notificarCampo(v) {
  const get = (campo) => v[campo] ? v[campo][0].trim() : '';

  // --- TRATAMENTOS DE DADOS ---
  const numRaw = get('numero_do_endereco_confirmado');
  const numFinal = (numRaw === '00' || numRaw === '') ? 'S/N' : numRaw;
  
  const formatarDataHora = (valor) => {
    if (!valor) return 'Não informado';
    return `${formatar.data(valor)} às ${formatar.hora(valor)}`;
  };

  const equipeLista = get('equipe').replace(/, /g, ' | ');
  const status = get('status_atual');

  // --- INICIALIZAÇÃO DA MENSAGEM (Sempre no topo!) ---
  // Ajuste: Use 'Número do Chamado' exatamente como está no cabeçalho da sua planilha de CAMPO
  let msg = `✅ <b>ATUALIZAÇÃO DE OCORRÊNCIA</b>\n\n`;
  msg += `<b>📄 CHAMADO ${get('Número do Chamado')}</b>\n`; 
  msg += `📅 <b>Data:</b> ${get('data_do_chamado')}\n`;
  msg += `📍 <b>Endereço:</b> ${get('logradouro_confirmado')}, nº ${numFinal} - ${get('bairro_confirmado')}\n`;
  msg += `👷 <b>Equipe:</b> ${equipeLista}\n\n`;

  // --- BLOCO 1: STATUS DA VIA ---
  const statusVia = get('status_da_via');
  if (statusVia && statusVia !== 'Liberada') {
    msg += `<blockquote>🚧 <b>VIA: ${statusVia.toUpperCase()}</b>\n`;
    if (get('detalhes_via')) msg += `<i>Nota: ${get('detalhes_via')}</i>\n`;
    msg += `</blockquote>\n`;
  }

  // --- BLOCO 2: VÍTIMAS ---
  if (get('ha_vitimas') === 'Sim') {
    msg += `<blockquote>⚠️ <b>VÍTIMAS CONFIRMADAS</b>\n`;
    msg += `• Quantidade: ${get('quantidade_vitimas') || 'Não informada'}\n`;
    msg += `</blockquote>\n`;
  }

  // --- BLOCO 3: DOAÇÕES ---
  if (get('houve_doacao') === 'Sim') {
    msg += `<blockquote>📦 <b>DOAÇÕES REALIZADAS</b>\n`;
    msg += `• Itens: ${get('materiais_doados')}\n`;
    msg += `</blockquote>\n`;
  }

  // --- BLOCO 4: ENCAMINHAMENTOS ---
  const orgaos = get('encaminhamento_orgaos');
  if (orgaos) {
    msg += `<blockquote>🏢 <b>DIRECIONAMENTO:</b>\n`;
    msg += `• Acionado: ${orgaos.replace(/, /g, ' | ')}\n`;
    msg += `</blockquote>\n`;
  }

  // --- LÓGICA POR STATUS ---
  if (status.includes('Atendido')) {
    msg += `📝 <b>Status:</b> ✅ Atendido\n`;
    msg += `⏰ <b>Atendido em</b> ${formatarDataHora(get('data_hora_atendimento'))}\n`;
    msg += `🧭 <b>Tipologia confirmada:</b> ${get('tipologia_confirmada')}\n`;
    msg += `↳ 📝 <b>Relato:</b> ${get('resumo_de_campo')}\n\n`;
  } 
  else if (status.includes('Cancelado')) {
    msg += `📝 <b>Status:</b> ❌ Cancelado\n`;
    msg += `↳ <b>Motivo:</b> ${get('descreva_o_cancelamento') || 'Não informado'}\n\n`;
  } 
  else if (status.includes('Agendado')) {
    msg += `📝 <b>Status:</b> 🕒 Agendado\n`;
    msg += `⏰ <b>Previsão:</b> ${formatarDataHora(get('data_hora_agendamento'))}\n`;
    msg += `🕒 <b>Turno:</b> ${get('Turno_previsto')}\n`;
    msg += `↳ <b>Motivo:</b> ${get('descreva_o_agendamento') || 'Não informado'}\n\n`;
  }

  enviarTelegram(CONFIG.TELEGRAM.CHATS.CAMPO, msg);
}

/************************************************************
 * 5. consolidarChamados (VERSÃO REFATORADA)
 ************************************************************/

function consolidarChamados() {
  const sheetBase = sh(CONFIG.BASE);
  
  // Garante o cabeçalho de 24 colunas (X é a última)
  if (!sheetBase.getLastRow()) {
    sheetBase.appendRow([
      'ID_UNICO', 'Nº Chamado', 'Data Abertura', 'Status Atual', 'Tipologia', 'Subtipo', 
      'Origem', 'Logradouro', 'Nº', 'Bairro', 'Solicitante', 'Telefone', 
      'Equipe', 'Data Atend.', 'Relato de Campo', 'Agendamento', 'Turno', 
      'Motivo Agend/Canc', 'Doação', 'Itens Doados', 'Notificado', 'Órgãos Acionados', 
      'Última Atualização', 'Complemento Confirmado'
    ]);
  }

  const dataBase = sheetBase.getDataRange().getValues();
  const mapaBase = new Map();
  dataBase.forEach((l, i) => { if (i > 0 && l[0]) mapaBase.set(String(l[0]), i + 1); });

  // --- PARTE A: PROCESSAR ABERTURAS ---
  const dAb = sh(CONFIG.ABERTURA).getDataRange().getValues();
  const novas = [];
  for (let i = 1; i < dAb.length; i++) {
    const id = formatar.id(dAb[i][2], dAb[i][3]);
    if (id && !mapaBase.has(id)) {
      const subtipo = dAb[i].slice(17, 25).find(v => v) || 'Não informado';
      
      novas.push([
        id, 
        dAb[i][2], 
        dAb[i][3], // <--- AQUI: Salvamos o valor bruto (Data + Hora) da Coluna D da aba Abertura
        dAb[i][5], 
        dAb[i][15], 
        subtipo,
        dAb[i][6], dAb[i][7], dAb[i][8], dAb[i][10], dAb[i][12], dAb[i][13],
        '', '', '', '', '', '', '', '', '', '', new Date(), '' 
      ]);
      mapaBase.set(id, -1);
    }
  }
  if (novas.length) sheetBase.getRange(sheetBase.getLastRow()+1, 1, novas.length, novas[0].length).setValues(novas);

  // --- PARTE B: ATUALIZAR COM DADOS DE CAMPO ---
  const dCp = sh(CONFIG.CAMPO).getDataRange().getValues();
  const dataBaseAtual = sheetBase.getDataRange().getValues();
  const mapaAtual = new Map();
  dataBaseAtual.forEach((l, i) => { if(i > 0 && l[0]) mapaAtual.set(String(l[0]), i + 1); });
  
  for (let i = 1; i < dCp.length; i++) {
    const id = formatar.id(dCp[i][2], dCp[i][3]); 
    const linha = mapaAtual.get(id);

    if (linha && linha !== -1) {
      sheetBase.getRange(linha, 4).setValue(dCp[i][4]);   // Status
      sheetBase.getRange(linha, 5).setValue(dCp[i][19]);  // Tipologia
      sheetBase.getRange(linha, 13).setValue(dCp[i][5]);  // Equipe
      
      // AQUI: Pegamos o valor bruto da data/hora de atendimento (Coluna G da aba Campo)
      sheetBase.getRange(linha, 14).setValue(dCp[i][6]); 
      
      sheetBase.getRange(linha, 15).setValue(dCp[i][7]);  // Relato
      sheetBase.getRange(linha, 16).setValue(dCp[i][20]); // Agendamento
      sheetBase.getRange(linha, 23).setValue(new Date()); // Update
      sheetBase.getRange(linha, 24).setValue(dCp[i][17]); // Complemento
    }
  }
}

/************************************************************
 * 5. msg_Consolidar (PARTE 2: Enviar Mensagem Consolidada)
 ************************************************************/

function msg_Consolidar(dataEspecifica) {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  if (dados.length <= 1) return;

  const fuso = Session.getScriptTimeZone();
  const hojeSistema = Utilities.formatDate(new Date(), fuso, 'dd/MM/yyyy');
  const agoraStr = `${hojeSistema} às ${Utilities.formatDate(new Date(), fuso, 'HH:mm')}`;

  // --- 5.1 DEFINIÇÃO DA DATA DE REFERÊNCIA ---
  // Se 'dataEspecifica' veio como objeto (bug), forçamos virar string ou null
  let dataAlvo = (typeof dataEspecifica === 'string') ? dataEspecifica : null;

  // Se não temos dataAlvo, buscamos o chamado mais recente atualizado
  if (!dataAlvo) {
    let maxUpdate = 0;
    dados.slice(1).forEach(r => {
      const time = new Date(r[22]).getTime(); // Coluna W (Update)
      if (time > maxUpdate) {
        maxUpdate = time;
        dataAlvo = formatar.data(r[2]); // Data de abertura do chamado editado
      }
    });
  }
  
  if (!dataAlvo || dataAlvo === '[object Object]') dataAlvo = hojeSistema;

  // --- 5.2 FILTRAGEM ---
  const chamadosDoDia = dados.slice(1).filter(r => {
    const dataAbertura = formatar.data(r[2]); // Coluna C
    const dataAgendada = formatar.data(r[15]); // Coluna P
    return (dataAbertura === dataAlvo || dataAgendada === dataAlvo);
  });

  // --- 5.3 ESTATÍSTICAS ---
  const total = chamadosDoDia.length;
  const atendidos = chamadosDoDia.filter(r => String(r[3]).includes('Atendido')).length;
  const cancelados = chamadosDoDia.filter(r => String(r[3]).includes('Cancelado')).length;
  const agendados = chamadosDoDia.filter(r => String(r[3]).includes('Agendado')).length;
  const pendentes = total - atendidos - cancelados - agendados;

  const icones = { 'Arbóreo': '🌳', 'Acidente viário': '🚧', 'Estrutural': '🏚️', 'Geológico': '⛰️', 'Hidrológico': '🌊', 'Incêndio': '🔥', 'Entrega de doação': '🎁' };
  const grupos = {}; 

  chamadosDoDia.forEach(r => {
    const tipologiaBruta = r[4] || 'Outros'; 
    const nomeLimpo = tipologiaBruta.replace(/[^\w\sÀ-ú]/g, '').trim();
    if (!grupos[nomeLimpo]) grupos[nomeLimpo] = [];
    grupos[nomeLimpo].push(r);
  });

  // --- 5.5 CABEÇALHO ---
  let msg = `📊 <b>COMPILADO DE CHAMADOS</b>\n`;
  msg += `📅 <b>Referência:</b> ${dataAlvo}\n`; 
  msg += `<i>Última atualização: ${agoraStr}</i>\n\n`;
  
  msg += `<b>TOTAL DE CHAMADOS:</b> ${total}\n`;
  msg += `✅ Atendidos: ${atendidos}  ⏳ Pendentes: ${pendentes}\n`;
  msg += `📅 Agendados: ${agendados}  ❌ Cancelados: ${cancelados}\n`;
  msg += `──────────────────\n`;

  // --- 5.6 CORPO ---
  for (const categoria in grupos) {
    const emoji = icones[categoria] || '📋';
    msg += `${emoji} | <b>${categoria.toUpperCase()}:</b>\n\n`;
    
    grupos[categoria].forEach(r => {
      const chamadoNum = r[1];
      const statusRaw = String(r[3] || '');
      
      // Limpeza de ícones e termos
      const statusLimpo = statusRaw.replace(/[^\w\sÀ-ú]/g, '').replace('Aguardando atendimento', 'Pendente').trim();

      const logradouro = r[7] || 'Não informado'; 
      const numFinal = (String(r[8]) === '00' || !r[8]) ? 's/n' : r[8];
      const compRaw = String(r[23] || '').trim(); // Complemento na Coluna X
      const complemento = (compRaw && compRaw !== 'undefined') ? ` – <i>${compRaw}</i>` : ''; 
      const bairro = r[9] || 'Não informado'; 
      
      let relatoSeguro = String(r[14] || 'Sem observações.').trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');

      // --- LÓGICA DE TEMPO (Onde resolvemos o 00:00) ---
      let statusEmoji = '⏳';
      let acao = 'Pendente desde'; 
      // Puxa a hora da coluna C (r[2]). Agora que salvamos o bruto, o formatar.hora vai funcionar!
      let tempoRef = `${formatar.data(r[2])} às ${formatar.hora(r[2])}`; 

      if (statusRaw.includes('Atendido')) {
        statusEmoji = '✅';
        acao = 'Atendido em';
        tempoRef = `${formatar.data(r[13])} às ${formatar.hora(r[13])}`;
      } else if (statusRaw.includes('Agendado')) {
        statusEmoji = '📅';
        acao = 'Agendado para';
        tempoRef = formatar.data(r[15]); 
      } else if (statusRaw.includes('Cancelado')) {
        statusEmoji = '❌';
        acao = 'Cancelado';
      }

      msg += `↳ <b>Chamado: ${chamadoNum}</b>\n`;
      msg += `📍 ${logradouro}, ${numFinal}${complemento} - ${bairro}\n`;
      msg += `🧭 Status: ${statusEmoji} ${statusLimpo}\n`;
      msg += `⏰ ${acao} ${tempoRef}\n`;
      msg += `📄 Relato em campo: <i>${relatoSeguro}</i>\n`;
      msg += `──────────────────\n`;
    });
  }

  if (total === 0) {
    msg = `📊 <b>COMPILADO DE CHAMADOS</b>\n📅 <b>Referência:</b> ${dataAlvo}\n\n‼️ <b>Sem demandas para esta data.</b>`;
  }

  enviarTelegram(CONFIG.TELEGRAM.CHATS.COMPILADO, msg);
}

/************************************************************
 * 6. RESUMO ESTATÍSTICO: FIM DE TURNO
 * Ideal para ser disparado via Gatilho de Tempo (ex: 17h)
 ************************************************************/

function resumoFimDeTurno() {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  if (dados.length <= 1) return;

  const fuso = Session.getScriptTimeZone();
  const hoje = Utilities.formatDate(new Date(), fuso, 'dd/MM/yyyy');
  
  // 1. FILTRAGEM: Apenas chamados que foram abertos ou atendidos HOJE
  const chamadosHoje = dados.slice(1).filter(r => formatar.data(r[2]) === hoje);

  if (chamadosHoje.length === 0) {
    enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, `📴 <b>FIM DE TURNO:</b> Nenhuma atividade registrada hoje (${hoje}).`);
    return;
  }

  // 6.1 VARIÁVEIS DE CONTAGEM
  let estatisticas = {
    total: chamadosHoje.length,
    atendidos: 0,
    pendentes: 0,
    tipologias: {},
    auxilioHabitacional: 0,
    demolicao: 0,
    doacoesEntregues: 0,
    avulsosInLoco: 0
  };

  // 6.2 PROCESSAMENTO DOS DADOS
  chamadosHoje.forEach(r => {
    const status = String(r[3]).toLowerCase();
    const tipo = r[4] || 'Outros';
    const relato = String(r[14]).toLowerCase(); // Coluna O
    const orgaos = String(r[21]).toLowerCase(); // Coluna V (Órgãos Acionados)
    const doacaoSituacao = String(r[18]).toLowerCase(); // Coluna S (Doação Sim/Não)
    const origem = String(r[6]).toLowerCase(); // Coluna G (Origem do Chamado)

    // Contagem de Status
    status.includes('atendido') ? estatisticas.atendidos++ : estatisticas.pendentes++;

    // Contagem por Tipologia
    estatisticas.tipologias[tipo] = (estatisticas.tipologias[tipo] || 0) + 1;

    // Busca por Auxílio Habitacional (na coluna de órgãos ou relato)
    if (orgaos.includes('habitacional') || relato.includes('habitacional') || relato.includes('auxílio')) {
      estatisticas.auxilioHabitacional++;
    }

    // Busca por Demolição (no relato)
    if (relato.includes('demolição') || relato.includes('demolir') || relato.includes('interdição total')) {
      estatisticas.demolicao++;
    }

    // Contagem de Doações Realizadas
    if (doacaoSituacao.includes('sim')) {
      estatisticas.doacoesEntregues++;
    }

    // Contagem de Avulsos (In Loco)
    if (origem.includes('loco') || origem.includes('avulso')) {
      estatisticas.avulsosInLoco++;
    }
  });

  // 6.3 MONTAGEM DA MENSAGEM VISUAL
  let msg = `🏁 <b>RESUMO FINAL DE TURNO</b>\n`;
  msg += `📅 Data: ${hoje}\n`;
  msg += `──────────────────\n\n`;

  msg += `📈 <b>PRODUTIVIDADE:</b>\n`;
  msg += `• Total de Demandas: ${estatisticas.total}\n`;
  msg += `• ✅ Atendidos: ${estatisticas.atendidos}\n`;
  msg += `• ⏳ Pendentes: ${estatisticas.pendentes}\n`;
  msg += `• 🕵️ Chamados "In Loco": ${estatisticas.avulsosInLoco}\n\n`;

  msg += `📂 <b>POR TIPOLOGIA:</b>\n`;
  for (const t in estatisticas.tipologias) {
    msg += `• ${t}: ${estatisticas.tipologias[t]}\n`;
  }

  msg += `\n🆘 <b>AÇÕES SOCIAIS / CRÍTICAS:</b>\n`;
  msg += `• 🏠 Auxílio Habitacional: ${estatisticas.auxilioHabitacional}\n`;
  msg += `• 🏚️ Necessidade Demolição: ${estatisticas.demolicao}\n`;
  msg += `• 🎁 Ajuda Humanitária: ${estatisticas.doacoesEntregues}\n`;

  msg += `\n──────────────────\n`;
  msg += `<i>Relatório gerado automaticamente às ${Utilities.formatDate(new Date(), fuso, 'HH:mm')}</i>`;

  // Envia para o grupo de Gestão (INFO_FAST)
  enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, msg);
}

/**
 * 6.4 Gera o relatório matinal de compromissos agendados por setor.
 * Disparo ideal: Todo dia às 07:30 ou 08:00 via Gatilho.
 */
function relatorioAgendadosHoje() {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  if (dados.length <= 1) return;

  const agora = new Date();
  const dataHojeStr = formatar.data(agora);
  const diasSemana = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const diaNome = diasSemana[agora.getDay()];

  // 6.41. FILTRAGEM: Apenas o que é para HOJE e NÃO está finalizado
  const agendadosHoje = dados.slice(1).filter(r => {
    const dataAgendada = formatar.data(r[15]); // Coluna P
    const status = String(r[3] || '').toLowerCase(); // Coluna D
    return dataAgendada === dataHojeStr && !status.includes('atendido') && !status.includes('cancelado');
  });

  if (agendadosHoje.length === 0) {
    const msgVazio = `✅ <b>Sem agendamentos pendentes para hoje:</b>\n📅 <i>${dataHojeStr} (${diaNome})</i>`;
    enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, msgVazio);
    return;
  }

  // 6.4.2. SEPARAÇÃO POR SETOR PARA ENVIO DIRECIONADO
  const setores = {
    'op': { nome: '📦 OPERACIONAL', chat: CONFIG.TELEGRAM.CHATS.NEW_OPERACIONAL, lista: [] },
    'tec': { nome: '📐 TÉCNICA', chat: CONFIG.TELEGRAM.CHATS.NEW_TECNICA, lista: [] }
  };

  agendadosHoje.forEach(r => {
    const equipe = String(r[12]).toLowerCase(); // Coluna M
    const info = {
      id: r[1],
      tipo: r[4],
      logradouro: r[7] || 'Não inf.',
      num: (String(r[8]) === '00' || !r[8]) ? 'S/N' : r[8],
      bairro: r[9] || 'Não inf.',
      turno: String(r[16] || 'NÃO DEFINIDO').toUpperCase()
    };

    const itemMsg = `🔔 <b>Chamado: ${info.id}</b>\n` +
                    `🧭 ${info.tipo}\n` +
                    `📍 ${info.logradouro}, ${info.num} - ${info.bairro}\n` +
                    `🕒 Turno: <b>${info.turno}</b>\n` +
                    `──────────────────\n\n`;

    if (equipe.includes('operacional') || equipe.includes('op')) {
      setores.op.lista.push(itemMsg);
    } else {
      setores.tec.lista.push(itemMsg);
    }
  });

  // 6.4.3. ENVIO DAS MENSAGENS PERSONALIZADAS
  for (let chave in setores) {
    const s = setores[chave];
    if (s.lista.length > 0) {
      let cabecalho = `📅 <b>AGENDADOS: ${s.nome}</b>\n`;
      cabecalho += `📍 ${dataHojeStr} (${diaNome.toUpperCase()})\n`;
      cabecalho += `──────────────────\n\n`;
      
      enviarTelegram(s.chat, cabecalho + s.lista.join(''));
    }
  }

  // 6.4.4. AVISO NO INFO_FAST (Para o Gestor saber que as equipes foram avisadas)
  const resumoGestor = `📢 <b>RELATÓRIO MATINAL ENVIADO</b>\n` +
                       `• Técnica: ${setores.tec.lista.length} agendados\n` +
                       `• Operacional: ${setores.op.lista.length} agendados`;
  enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, resumoGestor);
}

/************************************************************
 * 6.5 FUNÇÃO: TRANSFERIR CHAMADOS ENTRE SETORES (OP <-> TEC)
 ************************************************************/
function transferirChamadoSetor(chatId, num, data, destinoSigla) {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  const idProcurado = formatar.id(num, data);

  // 6.5.1. Localizar o chamado
  const chamado = dados.find(r => String(r[0]) === idProcurado);

  if (!chamado) {
    enviarTelegram(chatId, `❌ Chamado <b>${num}</b> do dia <b>${data}</b> não encontrado.`);
    return;
  }

  // 6.5.2. Definir o novo chat de destino e o nome do setor
  const novoChatId = (destinoSigla === 'op') ? CONFIG.TELEGRAM.CHATS.NEW_OPERACIONAL : CONFIG.TELEGRAM.CHATS.NEW_TECNICA;
  const nomeSetor = (destinoSigla === 'op') ? '📦 OPERACIONAL' : '📐 TÉCNICA';

  // 3. Montar a ficha de transferência para o novo grupo
  let msg = `🔄 <b>CHAMADO TRANSFERIDO PARA ESTE SETOR</b>\n`;
  msg += `──────────────────\n`;
  msg += `🆔 <b>Nº:</b> ${chamado[1]}  |  📅 <b>Data:</b> ${formatar.data(chamado[2])}\n`;
  msg += `🚩 <b>Tipologia:</b> ${chamado[4]}\n`;
  msg += `📍 <b>Local:</b> ${chamado[7]}, ${chamado[8]} - ${chamado[9]}\n`;
  msg += `📞 <b>Solicitante:</b> ${chamado[10]} (${chamado[11]})\n`;
  msg += `──────────────────\n`;
  msg += `⚠️ <i>Motivo: Reclassificado via sistema por um gestor.</i>`;

  // 6.5.4. Enviar para o novo grupo
  enviarTelegram(novoChatId, msg);

  // 6.5.5. Confirmar para quem solicitou a transferência
  enviarTelegram(chatId, `✅ Chamado <b>${num}</b> transferido com sucesso para <b>${nomeSetor}</b>.`);
  
  // 6.5.6 Opcional: Atualizar a coluna "Equipe" na Planilha para o novo setor
  const index = dados.findIndex(r => String(r[0]) === idProcurado);
  if (index !== -1) {
    sheetBase.getRange(index + 1, 13).setValue(nomeSetor); // Coluna M (Equipe)
  }
}

/**
 * 6.6 FUNÇÃO: RELATÓRIO DE PENDÊNCIAS ATIVAS (AGENDADOS HOJE + ATRASADOS)
 * Este relatório varre a base em busca de tudo que a equipe precisa resolver hoje,
 * incluindo o que ficou pendente de dias anteriores.
 */
function relatorioAgendadosHoje() {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  if (dados.length <= 1) return;

  const hoje = new Date();
  const hojeFormatado = formatar.data(hoje);
  
  // 6.1.A FILTRAGEM INTELIGENTE
  const pendenciasAtivas = dados.slice(1).filter(r => {
    const dataAgendada = formatar.data(r[15]); // Coluna P (Agendamento)
    const dataAbertura = formatar.data(r[2]);  // Coluna C (Abertura)
    const status = String(r[3] || '').toLowerCase();
    
    // Regra: Está agendado para hoje OU (É de data passada E não está finalizado)
    const ehHoje = (dataAgendada === hojeFormatado || dataAbertura === hojeFormatado);
    const estaPendente = !status.includes('atendido') && !status.includes('cancelado');
    
    // Captura tudo que é "Hoje" ou "Atrasado mas Pendente"
    return estaPendente && (ehHoje || dataAgendada < hojeFormatado || dataAbertura < hoyeFormatado);
  });

  if (pendenciasAtivas.length === 0) {
    enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, `✅ <b>Tudo em dia!</b> Nenhuma pendência acumulada para hoje.`);
    return;
  }

  // 6.2.B ORGANIZAÇÃO POR SETOR
  const setores = {
    'op': { nome: '📦 OPERACIONAL', chat: CONFIG.TELEGRAM.CHATS.NEW_OPERACIONAL, hoje: [], atrasados: [] },
    'tec': { nome: '📐 TÉCNICA', chat: CONFIG.TELEGRAM.CHATS.NEW_TECNICA, hoje: [], atrasados: [] }
  };

  pendenciasAtivas.forEach(r => {
    const equipe = String(r[12]).toLowerCase();
    const dataRef = r[15] ? formatar.data(r[15]) : formatar.data(r[2]);
    const ehAtrasado = dataRef < hojeFormatado;

    const item = `🔔 <b>[${r[1]}]</b> ${r[4]}\n` +
                 `📍 ${r[7]}, ${r[8]} - ${r[9]}\n` +
                 `📅 Ref: ${dataRef} | 🕒 Turno: ${r[16] || '---'}\n` +
                 `──────────────────\n`;

    const alvo = (equipe.includes('op')) ? setores.op : setores.tec;
    
    if (ehAtrasado) {
      alvo.atrasados.push(item);
    } else {
      alvo.hoje.push(item);
    }
  });

  // 6.3.C MONTAGEM E ENVIO DAS MENSAGENS
  for (let chave in setores) {
    const s = setores[chave];
    if (s.hoje.length > 0 || s.atrasados.length > 0) {
      let msg = `📋 <b>PAINEL DE TRABALHO: ${s.nome}</b>\n`;
      msg += `📅 Data: ${hojeFormatado}\n\n`;

      if (s.atrasados.length > 0) {
        msg += `⚠️ <b>PENDÊNCIAS ACUMULADAS:</b>\n${s.atrasados.join('')}\n`;
      }

      if (s.hoje.length > 0) {
        msg += `📌 <b>DEMANDAS DE HOJE:</b>\n${s.hoje.join('')}`;
      }

      enviarTelegram(s.chat, msg);
    }
  }
}

/************************************************************
 * 7. GESTÃO DE ESCALA DIÁRIA
 * Lê a planilha de escala e informa a equipe de plantão
 ************************************************************/

function msg_EnviarEscala(origem = "AUTOMÁTICO") {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetEscala = ss.getSheetByName('Escala_diaria_2026');
  if (!sheetEscala) return;

  const dados = sheetEscala.getDataRange().getValues();
  const hojeStr = formatar.data(new Date());
  
  let escalaHoje = null;

  // Localiza a linha de HOJE
  for (let i = 1; i < dados.length; i++) {
    if (formatar.data(dados[i][0]) === hojeStr) {
      escalaHoje = dados[i];
      break;
    }
  }

  if (!escalaHoje) return;

  const tecnico1 = escalaHoje[2];
  const tecnico2 = escalaHoje[3];
  const operacional1 = escalaHoje[4];
  const operacional2 = escalaHoje[5];
  const setor1 = escalaHoje[6];
  const setor2 = escalaHoje[7];

  let msg = `📅 <b>ESCALA DE PLANTÃO - ${hojeStr}</b>\n`;
  msg += `<i>(${origem === "EDIT" ? "🔄 Atualização de Escala" : "📢 Informativo Matinal"})</i>\n`;
  msg += `──────────────────\n\n`;

  msg += `👤 <b>TÉCNICO(S):</b>\n↳ ${tecnico1}${tecnico2 ? ` / ${tecnico2}` : ''}\n\n`;
  msg += `👷 <b>OPERACIONAL:</b>\n↳ ${operacional1}${operacional2 ? ` / ${operacional2}` : ''}\n\n`;
  msg += `🏢 <b>SETOR / ENTRADA:</b>\n↳ ${setor1}${setor2 ? ` / ${setor2}` : ''}\n`;
  msg += `──────────────────`;

  // Mestre Viton, aqui você escolhe: ENTRADA, INFO_FAST ou COMPILADO.
  // Vou colocar no INFO_FAST para o pessoal da gestão ver primeiro.
  enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, msg);
}

/**
 * 7.1 GATILHO DE EDIÇÃO (Trigger Instalável)
 * Em vez de enviar na hora, ele agenda o envio para daqui a 2 minutos.
 */
function gatilhoEdicaoEscala(e) {
  const range = e.range;
  const sheetName = range.getSheet().getName();

  if (sheetName === 'Escala_diaria_2026') {
    // 7.1.1 Apaga qualquer agendamento de escala que já esteja "na fila"
    const gatilhos = ScriptApp.getProjectTriggers();
    gatilhos.forEach(t => {
      if (t.getHandlerFunction() === 'processarEnvioEscalaAgendado') {
        ScriptApp.deleteTrigger(t);
      }
    });

    // 7.1.2 Cria um novo agendamento para daqui a 2 minutos (120.000 milissegundos)
    ScriptApp.newTrigger('processarEnvioEscalaAgendado')
             .timeBased()
             .after(2 * 60 * 1000) 
             .create();
             
    console.log("⏱️ Edição detectada. Envio da escala agendado para daqui a 2 min.");
  }
}

/**
 * 7.2 Função auxiliar que o cronômetro vai chamar de fato.
 */
function processarEnvioEscalaAgendado() {
  msg_EnviarEscala("EDIT");
  
  // Limpeza de segurança: apaga o próprio gatilho após rodar para não acumular
  const gatilhos = ScriptApp.getProjectTriggers();
  gatilhos.forEach(t => {
    if (t.getHandlerFunction() === 'processarEnvioEscalaAgendado') {
      ScriptApp.deleteTrigger(t);
    }
  });
}

/************************************************************
 * 8. COMANDOS DO BOT (Interação Direta e Inteligente)
 ************************************************************/

function doPost(e) {
  try {
    const dados = JSON.parse(e.postData.contents);
    if (!dados.message || !dados.message.text) return;

    const textoBot = dados.message.text.toLowerCase().trim();
    const partes = textoBot.split(' '); 
    const comando = partes[0];
    const chatId = dados.message.chat.id;

    // 8.1 COMANDO: /busca [nº] [data]
    if (comando === '/busca') {
      const num = partes[1];
      const data = partes[2];
      if (!num || !data) {
        enviarTelegram(chatId, "⚠️ <b>Erro de Formato</b>\nUse: <code>/busca [nº] [dd/mm/aaaa]</code>");
        return;
      }
      buscarPorId(chatId, num, data);
    }

    // 8.2 COMANDO: /endereco [nome da rua]
    else if (comando === '/endereco') {
      const termo = partes.slice(1).join(' ');
      if (!termo) {
        enviarTelegram(chatId, "⚠️ Digite o nome da rua.");
        return;
      }
      buscarPorEndereco(chatId, termo);
    }

    // 8.3 COMANDO: /status (Compilado Geral do Dia)
    else if (comando === '/status') {
      const fuso = Session.getScriptTimeZone();
      const hojeBot = Utilities.formatDate(new Date(), fuso, 'dd/MM/yyyy');
      msg_Consolidar(hojeBot); // Garante que envia o de hoje como string
      enviarTelegram(chatId, "📊 <i>Compilado atualizado enviado ao canal.</i>");
    }

    // 8.4 COMANDO: /escala
    else if (comando === '/escala') {
      msg_EnviarEscala("SOLICITAÇÃO");
    }

    // 8.5 COMANDO: /contatos
    else if (comando === '/contatos') {
      let contatos = `☎️ <b>TELEFONES ÚTEIS - DEFESA CIVIL</b>\n`;
      contatos += `──────────────────\n\n`;
      contatos += `🚒 <b>BOMBEIROS:</b> 193\n`;
      contatos += `🚓 <b>POLÍCIA MILITAR:</b> 190\n`;
      contatos += `💡 <b>CEMIG:</b> 116\n`;
      contatos += `💧 <b>COPASA:</b> 115\n`;
      contatos += `🌳 <b>MEIO AMBIENTE:</b> 31 9643-9350\n`;
      contatos += `🏥 <b>SAMU:</b> 192\n\n`;
      enviarTelegram(chatId, contatos);
    }

    // 8.6 COMANDO: /transferir [nº] [data] [destino]
    else if (comando === '/transferir') {
      const num = partes[1];
      const data = partes[2];
      const destino = partes[3] ? partes[3].toLowerCase() : '';
      if (!num || !data || !['op', 'tec'].includes(destino)) {
        enviarTelegram(chatId, "⚠️ Use: <code>/transferir [nº] [data] [op ou tec]</code>");
        return;
      }
      transferirChamadoSetor(chatId, num, data, destino);
    }

    // 8.7 COMANDOS DE PENDÊNCIAS (Setorizados)
    else if (comando === '/pendentesop') {
      enviarPendentesPorSetor(chatId, 'op');
    }
    else if (comando === '/pendentestec') {
      enviarPendentesPorSetor(chatId, 'tec');
    }

    // 8.8 LISTA GERAL DE PENDENTES
    else if (comando === '/pendentes') {
      // Aqui você pode chamar a função que lista TUDO (OP + TEC)
      enviarPendentesGeral(chatId); 
    }

    // 8.9 PLANEJAMENTO DE AGENDADOS
    else if (comando === '/agendados') {
      enviarListaAgendados(chatId);
    }

    // 8.10 COMANDO: /ajuda ou /start
    else if (comando === '/ajuda' || comando === '/start') {
      let ajuda = `🤖 <b>ASSISTENTE OPERACIONAL</b>\n\n`;
      ajuda += `🔎 <code>/busca [nº] [data]</code>\n`;
      ajuda += `📍 <code>/endereco [rua]</code>\n`;
      ajuda += `📊 <code>/status</code> - Compilado\n`;
      ajuda += `🚨 <code>/pendentes</code> - Lista Geral\n`;
      ajuda += `📅 <code>/agendados</code> - Futuros\n`;
      ajuda += `🔄 <code>/transferir</code> - Mudar setor\n`;
      ajuda += `☎️ <code>/contatos</code>\n`;
      enviarTelegram(chatId, ajuda);
    }

  } catch (err) {
    // Se der erro, o log do Google nos avisa o que foi
    console.error("Erro no doPost: " + err.message);
  }
}

/************************************************************
 * 9. FAST_INFO - MENSAGEM RÁPIDA PARA TELEGRAM
 * manda um alerta visualmente "gritante" para que todos saibam que a fluidez da cidade mudou;
 ************************************************************/

function notificarStatusVia(v) {
  const get = (campo) => v[campo] ? v[campo][0].trim() : '';
  
  const status = get('Status da Via');
  const fuso = Session.getScriptTimeZone();
  const hora = Utilities.formatDate(new Date(), fuso, 'HH:mm');

  // Define o emoji de cabeçalho baseado no status
  let alertaEmoji = "🚧";
  if (status.includes("🔴")) alertaEmoji = "🚫";
  if (status.includes("🟢")) alertaEmoji = "✅";

  let msg = `${alertaEmoji} <b>ALERTA DE TRÂNSITO / VIA</b>\n`;
  msg += `──────────────────\n\n`;
  
  msg += `📍 <b>Local:</b> ${get('Logradouro')}\n`;
  msg += `🏘️ <b>Bairro:</b> ${get('Bairro')}\n`;
  msg += `🚩 <b>Incidente:</b> ${get('Tipo de Incidente')}\n\n`;
  
  msg += `🚦 <b>STATUS:</b> ${status.toUpperCase()}\n\n`;
    
  if (get('Observações/Detalhes')) {
    msg += `📝 <b>Detalhes:</b> <i>${get('Observações/Detalhes')}</i>\n`;
  }

  msg += `\n──────────────────\n`;
  msg += `🕒 <i>Informado às ${hora}</i>`;

  // Envia para o INFO_FAST (Gestão) e ENTRADA (Operacional)
  enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, msg);
  enviarTelegram(CONFIG.TELEGRAM.CHATS.ENTRADA, msg);
}

/************************************************************
 * 9.1. FAST_INFO - MENSAGEM RÁPIDA PARA TELEGRAM
 * manda um alerta visualmente "gritante" para que todos saibam que a fluidez da cidade mudou;
 ************************************************************/
function msg_InfoFast() {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  if (dados.length <= 1) return;

  const fuso = Session.getScriptTimeZone();
  const hoje = Utilities.formatDate(new Date(), fuso, 'dd/MM/yyyy');
  
  // 9.1.A Filtrar chamados do dia
  const chamadosHoje = dados.slice(1).filter(r => formatar.data(r[2]) === hoje);
  
  // 9.2.B Separar os Pendentes (Status que NÃO contém "Atendido" ou "Cancelado")
  const pendentes = chamadosHoje.filter(r => {
    const status = String(r[3]).toLowerCase();
    return !status.includes('atendido') && !status.includes('cancelado');
  });

  // 9.3.C Contadores rápidos
  const total = chamadosHoje.length;
  const qtdPendentes = pendentes.length;
  const atendidos = total - qtdPendentes;

  // 9.4.D Montar a lista detalhada de pendentes
  let listaPendentes = "";
  if (pendentes.length > 0) {
    listaPendentes = "⚠️ <b>DETALHE DOS PENDENTES:</b>\n";
    pendentes.forEach(p => {
      const numChamado = p[1];
      const logradouro = p[7] || 'Endereço não informado';
      const bairro = p[9] || 'Bairro s/n';
      const tipo = p[4] || 'Outros';
      
      listaPendentes += `• <b>[${numChamado}]</b> ${tipo} - ${logradouro}, ${bairro}\n`;
    });
  } else {
    listaPendentes = "✅ <b>Nenhuma pendência para hoje!</b>\n";
  }

  // 9.5.E Montar a Mensagem Final
  let msg = `⚡ <b>INFO FAST - DASHBOARD</b>\n`;
  msg += `📅 Data: ${hoje}\n`;
  msg += `──────────────────\n\n`;
  
  msg += `📊 <b>RESUMO:</b>\n`;
  msg += `Total: ${total} | ✅ Atendidos: ${atendidos}\n`;
  msg += `⏳ <b>Pendentes: ${qtdPendentes}</b>\n\n`;
  
  msg += `${listaPendentes}\n`;
  
  msg += `──────────────────\n`;
  msg += `<i>Atualizado em: ${Utilities.formatDate(new Date(), fuso, 'HH:mm')}</i>`;

  enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, msg);
}

/************************************************************
 * 10. FUNÇÕES DE LISTAGEM OPERACIONAL (PENDENTES E AGENDADOS)
 ************************************************************/

// FUNÇÃO 10.1: Lista Geral (Visão de Guerra)
function enviarPendentesGeral(chatId) {
  const sheetBase = sh(CONFIG.BASE); // Acessa a base master
  const dados = sheetBase.getDataRange().getValues(); // Puxa os dados para memória
  const hoje = formatar.data(new Date()); // Pega a data de hoje formatada

  // Filtra apenas chamados de HOJE que não foram finalizados
  const pendentes = dados.slice(1).filter(r => {
    const dataChamado = formatar.data(r[2]);
    const status = String(r[3]).toLowerCase();
    return dataChamado === hoje && !status.includes('atendido') && !status.includes('cancelado');
  });

  let msg = `🚨 <b>STATUS GERAL: PENDÊNCIAS HOJE</b>\n`;
  msg += `──────────────────\n\n`;

  // Separação visual por setor usando filtros rápidos
  const op = pendentes.filter(r => String(r[12]).toLowerCase().includes('op'));
  const tec = pendentes.filter(r => String(r[12]).toLowerCase().includes('tec'));

  msg += `📐 <b>SETOR TÉCNICO:</b>\n`;
  tec.length ? tec.forEach(r => msg += `• [${r[1]}] ${r[4]} - ${r[7]}\n`) : msg += `<i>Vazio</i>\n`;

  msg += `\n📦 <b>SETOR OPERACIONAL:</b>\n`;
  op.length ? op.forEach(r => msg += `• [${r[1]}] ${r[4]} - ${r[7]}\n`) : msg += `<i>Vazio</i>\n`;

  msg += `\n──────────────────\n📊 Total Pendente: ${pendentes.length}`;
  enviarTelegram(chatId, msg);
}

// FUNÇÃO 10.2: Lista de Agendados (Planejamento Futuro)
function enviarListaAgendados(chatId) {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  const hoje = formatar.data(new Date());

  // Filtra chamados que possuem data na Coluna P (Agendamento) diferente de hoje
  const agendados = dados.slice(1).filter(r => {
    const dataAgend = formatar.data(r[15]); // Coluna P
    const status = String(r[3]);
    return dataAgend && dataAgend !== hoje && dataAgend !== 'Não informado' && status.includes('Agendado');
  });

  let msg = `📅 <b>PLANEJAMENTO: AGENDADOS</b>\n`;
  msg += `──────────────────\n\n`;

  if (agendados.length === 0) {
    msg += "<i>Não há agendamentos para os próximos dias.</i>";
  } else {
    // Ordena por data de agendamento (mais próximo primeiro)
    agendados.sort((a, b) => new Date(a[15]) - new Date(b[15]));
    agendados.forEach(r => {
      msg += `🗓️ <b>${formatar.data(r[15])}</b>\n• [${r[1]}] ${r[12]} - ${r[7]}\n\n`;
    });
  }

  enviarTelegram(chatId, msg);
}

// FUNÇÃO 10.3: Pendentes por Setor (Chamada pelos comandos OP e TEC)
function enviarPendentesSetor(chatId, setor) {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  const hoje = formatar.data(new Date());
  const nomeSetor = (setor === 'op') ? '📦 OPERACIONAL' : '📐 TÉCNICA';

  const lista = dados.slice(1).filter(r => {
    const equipe = String(r[12]).toLowerCase();
    const dataChamado = formatar.data(r[2]);
    const status = String(r[3]).toLowerCase();
    return equipe.includes(setor) && dataChamado === hoje && !status.includes('atendido');
  });

  let msg = `📋 <b>PENDÊNCIAS: ${nomeSetor}</b>\n`;
  msg += `──────────────────\n\n`;
  
  lista.length ? lista.forEach(r => msg += `• [${r[1]}] ${r[7]}, ${r[9]}\n`) : msg += `✅ Tudo em dia!`;

  enviarTelegram(chatId, msg);
}