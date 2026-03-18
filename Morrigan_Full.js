/************************************************************
 * 1. CONFIGURAÇÕES E UTILITÁRIOS | (atualizado em: 16/03/2026 - 13:15)
 ************************************************************/
const CONFIG = {
  ABERTURA: 'abertura_de_chamado', 
  CAMPO: 'relatorio_em_campo',      
  BASE: 'BASE_CONSOLIDADA',
  ESCALA: 'Escala_diaria_2026',
  STATUS_PADRAO: 'Aguardando atendimento',
  TELEGRAM: {
    TOKEN: '8237808044:AAHJf09271f0oPL88_nFXCmoWRqdu6TIxHU',
    CHATS: {
      ABERTURA: '-1003862323760',
      CAMPO: '-1003815316144',
      COMPILADO: '-1003750376669'
    }
  }
};

const sh = (nome) => SpreadsheetApp.getActive().getSheetByName(nome);

  // Recebe "13/03/2026 16:17:00" -> Devolve "13/03/2026"
const formatar = {
  data: (v) => {
    if (!v) return 'Não informado';
    // Se já for uma data do sistema, formata certinho
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
    let s = String(v);
    return s.includes(' ') ? s.split(' ')[0] : s;
  },

  // Recebe "13/03/2026 16:17:00" -> Devolve "16:17"
hora: (v) => {
    if (!v) return '00:00';
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
    let s = String(v);
    let parteHora = s.includes(' ') ? s.split(' ')[1] : s;
    let blocos = parteHora.split(':');
    return blocos.length >= 2 ? `${blocos[0].padStart(2, '0')}:${blocos[1].padStart(2, '0')}` : parteHora;
  },

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
};

/************************************************************
 * 2. ROTEADOR (O que o seu Acionador de Formulário chama)
 ************************************************************/
function rotearFormulario(e) {
  const nomeAba = e.range.getSheet().getName();
  
  // Primeiro, sincroniza os dados na planilha Master
  consolidarChamados();

  // Depois, envia as notificações detalhadas
  if (nomeAba === CONFIG.ABERTURA) {
    notificarAbertura(e.namedValues);
  } else if (nomeAba === CONFIG.CAMPO) {
    notificarCampo(e.namedValues);
  }
  // 3. NOVO: Atualiza o Compilado Geral sempre que houver movimento
    msg_Consolidar();
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
 * 5. consolidarChamados (PARTE 1: Gravar na BASE MASTER)
 ************************************************************/

function consolidarChamados() {
  const sheetBase = sh(CONFIG.BASE);
  
  // 1. Criar Cabeçalho se estiver vazio (Agora com 24 colunas - A até X)
  if (!sheetBase.getLastRow()) {
    sheetBase.appendRow([
      'ID_UNICO', 'Nº Chamado', 'Data Abertura', 'Status Atual', 'Tipologia', 'Subtipo', 
      'Origem', 'Logradouro', 'Nº', 'Bairro', 'Solicitante', 'Telefone', 
      'Equipe', 'Data Atend.', 'Relato de Campo', 'Agendamento', 'Turno', 
      'Motivo Agend/Canc', 'Doação', 'Itens Doados', 'Notificado', 'Órgãos Acionados', 
      'Última Atualização', 'Complemento Confirmado' // <- Adicionado aqui no final (Col X)
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
      
      // Adicionado mais um espaço vazio '' no final para bater com as 24 colunas
      novas.push([
        id, dAb[i][2], formatar.data(dAb[i][3]), dAb[i][5], dAb[i][15], subtipo,
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
      sheetBase.getRange(linha, 4).setValue(dCp[i][4]);   // D: Status Atual
      sheetBase.getRange(linha, 5).setValue(dCp[i][19]);  // E: Tipologia Confirmada
      sheetBase.getRange(linha, 8).setValue(dCp[i][15]);  // H: Logradouro Confirmado
      sheetBase.getRange(linha, 9).setValue(dCp[i][16]);  // I: Nº Confirmado
      sheetBase.getRange(linha, 10).setValue(dCp[i][18]); // J: Bairro Confirmado
      sheetBase.getRange(linha, 13).setValue(dCp[i][5]);  // M: Equipe
      sheetBase.getRange(linha, 14).setValue(dCp[i][6]);  // N: Data Atend Real
      sheetBase.getRange(linha, 15).setValue(dCp[i][7]);  // O: Relato de Campo
      sheetBase.getRange(linha, 16).setValue(dCp[i][20]); // P: Agendamento
      sheetBase.getRange(linha, 17).setValue(dCp[i][21]); // Q: Turno
      
      const motivo = dCp[i][22] || dCp[i][23] || '';
      sheetBase.getRange(linha, 18).setValue(motivo);    // R: Motivo Agend/Canc
      
      sheetBase.getRange(linha, 19).setValue(dCp[i][14]); // S: Situação Doação (Col O)
      sheetBase.getRange(linha, 20).setValue(dCp[i][13]); // T: Tipo Doação (Col N)
      sheetBase.getRange(linha, 21).setValue(dCp[i][11]); // U: Nome Notificado (Col L)
      sheetBase.getRange(linha, 22).setValue(dCp[i][9]);  // V: Órgão que acionou (Col J)
      sheetBase.getRange(linha, 23).setValue(new Date()); // W: Última Atualização
      
      // NOVA LINHA: Gravando o Complemento na Coluna 24 (X)
      // dCp[i][17] assume que o complemento está na Coluna R da planilha 'relatorio_em_campo'
      sheetBase.getRange(linha, 24).setValue(dCp[i][17]); 
    }
  }
}

/************************************************************
 * 5. msg_Consolidar (PARTE 2: Enviar Mensagem Consolidada)
 * Painel de Controle Vivo e Inteligente
 ************************************************************/

function msg_Consolidar(dataEspecifica) {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  if (dados.length <= 1) return;

  // --- OBJETOS DE TEMPO ---
  // O objeto 'Date()' captura o momento exato da execução.
  // 'Utilities.formatDate' evita o bug de datas em inglês (Tue Mar...) transformando em texto BR.
  const agoraObj = new Date();
  const fuso = Session.getScriptTimeZone();
  const dataHojeSistema = Utilities.formatDate(agoraObj, fuso, 'dd/MM/yyyy');
  const agoraStr = `${dataHojeSistema} às ${Utilities.formatDate(agoraObj, fuso, 'HH:mm')}`;

  // --- 5.1 DEFINIÇÃO DA DATA ALVO ---
  // Se a função recebeu uma data (do formulário), ela usa essa. 
  // Se não (disparo manual), ela busca o último chamado editado na Coluna W (índice 22).
  let dataAlvo = dataEspecifica;

  if (!dataAlvo) {
    let maxUpdate = 0;
    dados.slice(1).forEach(r => {
      const timeUpdate = new Date(r[22]).getTime(); 
      if (timeUpdate > maxUpdate) {
        maxUpdate = timeUpdate;
        dataAlvo = formatar.data(r[2]); // Pega a data de abertura do chamado mais recente
      }
    });
  }
  
  if (!dataAlvo) dataAlvo = dataHojeSistema;

  // --- 5.2 FILTRAGEM (O método .filter cria uma lista apenas com o que interessa) ---
  const chamadosDoDia = dados.slice(1).filter(r => {
    const dataAbertura = formatar.data(r[2]); // Coluna C
    const dataAgendada = formatar.data(r[15]); // Coluna P
    // Retorna 'true' se o chamado nasceu no dia alvo OU foi agendado para ele
    return (dataAbertura === dataAlvo || dataAgendada === dataAlvo);
  });

  // --- 5.3 ESTATÍSTICAS ---
  const total = chamadosDoDia.length;
  const atendidos = chamadosDoDia.filter(r => String(r[3]).includes('Atendido')).length;
  const cancelados = chamadosDoDia.filter(r => String(r[3]).includes('Cancelado')).length;
  const agendados = chamadosDoDia.filter(r => String(r[3]).includes('Agendado')).length;
  const pendentes = total - atendidos - cancelados - agendados;

  // --- 5.4 MAPA DE ÍCONES ---
  const icones = { 'Arbóreo': '🌳', 'Acidente viário': '🚧', 'Estrutural': '🏚️', 'Geológico': '⛰️', 'Hidrológico': '🌊', 'Incêndio': '🔥', 'Entrega de doação': '🎁' };
  const grupos = {}; 

  chamadosDoDia.forEach(r => {
    const tipologiaBruta = r[4] || 'Outros'; 
    // A Regex abaixo remove emojis do nome da categoria para não dar erro no agrupamento
    const nomeLimpo = tipologiaBruta.replace(/[^\w\sÀ-ú]/g, '').trim();
    if (!grupos[nomeLimpo]) grupos[nomeLimpo] = [];
    grupos[nomeLimpo].push(r);
  });

  // --- 5.5 CABEÇALHO DA MENSAGEM ---
  let msg = `📊 <b>COMPILADO DE CHAMADOS</b>\n`;
  msg += `📅 <b>Referência:</b> ${dataAlvo}\n`; 
  msg += `<i>Última atualização: ${agoraStr}</i>\n\n`;
  
  msg += `<b>TOTAL DE CHAMADOS:</b> ${total}\n`;
  msg += `✅ Atendidos: ${atendidos}  ⏳ Pendentes: ${pendentes}\n`;
  msg += `📅 Agendados: ${agendados}  ❌ Cancelados: ${cancelados}\n`;
  msg += `──────────────────\n`;

  // --- 5.6 CORPO POR CATEGORIA ---
  for (const categoria in grupos) {
    const emoji = icones[categoria] || '📋';
    msg += `${emoji} | <b>${categoria.toUpperCase()}:</b>\n\n`;
    
    grupos[categoria].forEach(r => {
      const chamadoNum = r[1]; // Coluna B
      const statusRaw = String(r[3] || ''); // Coluna D (pode vir com emoji do Forms)
      
      // LIMPEZA DE STATUS: Remove emojis e troca o texto longo por 'Pendente'
      const statusLimpo = statusRaw.replace(/[^\w\sÀ-ú]/g, '').replace('Aguardando atendimento', 'Pendente').trim();

// ... (dentro de grupos[categoria].forEach)
      const logradouro = r[7] || 'Não informado'; 
      const numRaw = String(r[8]);
      const numFinal = (numRaw === '00' || numRaw === '' || numRaw === 'undefined') ? 's/n' : numRaw;
      
      // PUXANDO O COMPLEMENTO DA COLUNA X (Índice 23)
      const compRaw = String(r[23] || '').trim();
      const complemento = (compRaw && compRaw !== 'undefined') ? ` – <i>${compRaw}</i>` : ''; 
      
      const bairro = r[9] || 'Não informado'; 
      // ... (restante do código)
      
      // HTML ESCAPE: Impede que caracteres como '<' quebrem a mensagem do Telegram
      let relatoSeguro = String(r[14] || 'Sem observações.').trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');

      // LÓGICA DINÂMICA DE STATUS E TEMPO
      let statusEmoji = '⏳';
      let acao = 'Pendente desde'; 
      let tempoRef = `${formatar.data(r[2])} às ${formatar.hora(r[2])}`; // Horário de Abertura (Coluna C)

      if (statusRaw.includes('Atendido')) {
        statusEmoji = '✅';
        acao = 'Atendido em';
        tempoRef = `${formatar.data(r[13])} às ${formatar.hora(r[13])}`; // Horário de Atendimento (Coluna N)
      } else if (statusRaw.includes('Agendado')) {
        statusEmoji = '📅';
        acao = 'Agendado para';
        tempoRef = formatar.data(r[15]); // Data do Agendamento (Coluna P)
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

  // --- 5.7 TRATAMENTO PARA DATA VAZIA ---
  if (total === 0) {
    msg = `📊 <b>COMPILADO DE CHAMADOS</b>\n📅 <b>Referência:</b> ${dataAlvo}\n\n‼️ <b>Sem demandas para esta data.</b>`;
  }

  enviarTelegram(CONFIG.TELEGRAM.CHATS.COMPILADO, msg);
}

/************************************************************
 * 6. RELATÓRIOS AUTOMÁTICOS (TIME-DRIVEN)
 ************************************************************/

// Programe para rodar no fim do expediente (17:00h)
function resumoFimDeTurno() {
  const dados = sh(CONFIG.BASE).getDataRange().getValues();
  if (dados.length <= 1) return;

  const hoje = formatar.data(new Date());
  
  // Filtra apenas o que aconteceu HOJE (Aberto hoje OU Atualizado hoje)
  const movimentacoesHoje = dados.slice(1).filter(r => {
    const dataAbertura = formatar.data(r[2]);
    const dataAtualizacao = formatar.data(r[22]); // Coluna W (Última Atualização)
    
    return (dataAbertura === hoje || dataAtualizacao === hoje);
  });

  if (movimentacoesHoje.length === 0) {
    enviarTelegram(CONFIG.TELEGRAM.CHATS.COMPILADO, `📊 <b>RESUMO: FIM DE TURNO</b>\nNenhuma ocorrência movimentada hoje (${hoje}).`);
    return;
  }

  let msg = `📊 <b>RESUMO: FIM DE TURNO (${hoje})</b>\n`;
  msg += `<i>Total de chamados movimentados: ${movimentacoesHoje.length}</i>\n\n`;

  // Lista todos os chamados que tiveram ação no dia
  movimentacoesHoje.forEach(r => {
    // r[1]=Nº, r[3]=Status, r[4]=Tipologia, r[9]=Bairro
    msg += `📄 <b>${r[1]}</b> - <code>${r[3]}</code>\n`;
    msg += `🧭 ${r[4]} | 📍 ${r[9]}\n`;
    msg += `──────────────────\n`;
  });
  
  enviarTelegram(CONFIG.TELEGRAM.CHATS.COMPILADO, msg);
}

/**
 * Gera o relatório matinal de compromissos agendados.
 * Filtra apenas o que é para HOJE e que ainda NÃO foi resolvido. */

function relatorioAgendadosHoje() {
  const dados = sh(CONFIG.BASE).getDataRange().getValues();
  const agora = new Date();
  
  // 6.1 Configuração de data e dia da semana em PT-BR
  const diasSemana = [
    'domingo', 'segunda-feira', 'terça-feira', 
    'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'
  ];

  const dataHojeStr = formatar.data(agora); // Ex: 17/03/2026
  const diaNome = diasSemana[agora.getDay()]; 
  const dataCompleta = `${dataHojeStr} ('${diaNome}')`;

  let msg = `📅 <b>AGENDADOS PARA HOJE</b>\n📍 ${dataCompleta}\n`;
  msg += `──────────────────\n\n`;
  
  let encontrou = false;

  // 6.2 Varredura da Base Master (Pula o cabeçalho com slice(1))
dados.slice(1).forEach(r => {
    const dataAgendada = formatar.data(r[15]); // Coluna P
    const statusAtual = String(r[3] || ''); // Coluna D - Evita erro se o status estiver vazio
    // Filtro: Data de hoje e chamado não finalizado
    if (dataAgendada === dataHojeStr && !statusAtual.includes('Atendido') && !statusAtual.includes('Cancelado')) {
      encontrou = true;
      
      // --- TRATAMENTO DO ENDEREÇO (Colunas H, I e J) ---
      const logradouro = r[7] || 'Logradouro não informado'; // Coluna H
      const numRaw = String(r[8]); // Coluna I
      const numFinal = (numRaw === '00' || numRaw === '' || numRaw === 'undefined') ? 'S/N' : numRaw;
      const bairro = r[9] || 'Bairro não informado'; // Coluna J
      
      const turno = String(r[16] || 'Não definido').toUpperCase(); // Coluna Q

      msg += `🔔 <b>Chamado: ${r[1]}</b>\n`;
      msg += `🧭 Tipologia: ${r[4]}\n`;
      msg += `📍 <b>Endereço:</b> ${logradouro}, nº ${numFinal} - ${bairro}\n`;
      msg += `🕒 Turno: <b>${turno}</b>\n`;
      msg += `──────────────────\n\n`;
    }
  });

  if (!encontrou) {
    msg = `✅ <b>Não há agendamentos pendentes para hoje.</b>\n` +
          `↳ 📅 <i>${dataCompleta}</i>`;
  }

  enviarTelegram(CONFIG.TELEGRAM.CHATS.ABERTURA, msg);
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

  // 7.1 Localiza a linha de HOJE na planilha de escala
  for (let i = 1; i < dados.length; i++) {
    if (formatar.data(dados[i][0]) === hojeStr) {
      escalaHoje = dados[i];
      break;
    }
  }

  if (!escalaHoje) {
    if (origem !== "AUTOMÁTICO") {
      enviarTelegram(CONFIG.TELEGRAM.CHATS.ABERTURA, `⚠️ <b>Atenção:</b> Escala para hoje (${hojeStr}) não encontrada.`);
    }
    return;
  }

  // 7.2 Mapeamento das Colunas (A=0, B=1, C=2...)
  const tecnico1 = escalaHoje[2];
  const tecnico2 = escalaHoje[3];
  const operacional1 = escalaHoje[4];
  const operacional2 = escalaHoje[5];
  const setor1 = escalaHoje[6];
  const setor2 = escalaHoje[7];

  // 7.3 Montagem da Mensagem Dinâmica (Só mostra o que estiver preenchido)
  let msg = `📅 <b>ESCALA DE PLANTÃO - ${hojeStr}</b>\n`;
  msg += `<i>(${origem === "EDIT" ? "🔄 Atualização de Escala" : "📢 Informativo Matinal"})</i>\n`;
  msg += `──────────────────\n\n`;

  msg += `👤 <b>TÉCNICO(S):</b>\n↳ ${tecnico1}${tecnico2 ? ` / ${tecnico2}` : ''}\n\n`;
  
  msg += `👷 <b>OPERACIONAL:</b>\n↳ ${operacional1}${operacional2 ? ` / ${operacional2}` : ''}\n\n`;

  msg += `🏢 <b>SETOR / ENTRADA:</b>\n↳ ${setor1}${setor2 ? ` / ${setor2}` : ''}\n`;
  msg += `──────────────────`;

  enviarTelegram(CONFIG.TELEGRAM.CHATS.ABERTURA, msg);
}

/**
 * GATILHO DE EDIÇÃO (Trigger Instalável)
 * Sempre que alguém mexer na planilha de escala, o bot avisa.
 */
function gatilhoEdicaoEscala(e) {
  const range = e.range;
  const sheetName = range.getSheet().getName();

  // Se a edição foi na aba da escala, dispara a mensagem
  if (sheetName === 'Escala_diaria_2026') {
    msg_EnviarEscala("EDIT");
  }
}

/************************************************************
 * 8. COMANDOS DO BOT (Interação Direta e Inteligente)
 * Basta enviar o comando no chat de algum dos grupos que ele irá enviar a mensagem correspondente.
 ************************************************************/

function doPost(e) {
  try {
    const dados = JSON.parse(e.postData.contents);
    if (!dados.message || !dados.message.text) return;

    const textoBot = dados.message.text.toLowerCase().trim();
    const partes = textoBot.split(' '); // Divide o comando dos argumentos
    const comando = partes[0];
    const chatId = dados.message.chat.id;

    // 8.1 COMANDO: /busca [nº] [data] (Ex: /busca 05 17/03/2026)
    if (comando === '/busca') {
      const num = partes[1];
      const data = partes[2];
      
      if (!num || !data) {
        enviarTelegram(chatId, "⚠️ <b>Erro de Formato</b>\nUse: <code>/busca [nº] [dd/mm/aaaa]</code>\n\n<i>Ex: /busca 05 17/03/2026</i>");
        return;
      }
      buscarPorId(chatId, num, data);
    }

    // 8.2 COMANDO: /endereco [nome da rua] (Ex: /endereco crista de galo)
    else if (comando === '/endereco') {
      const termo = partes.slice(1).join(' '); // Pega tudo após o comando
      if (!termo) {
        enviarTelegram(chatId, "⚠️ Digite o nome da rua. Ex: <code>/endereco crista de galo</code>");
        return;
      }
      buscarPorEndereco(chatId, termo);
    }

// 8.3 COMANDO: /status (Chama o compilado na hora)
else if (comando === '/status') {
  const fuso = Session.getScriptTimeZone();
  const hojeBot = Utilities.formatDate(new Date(), fuso, 'dd/MM/yyyy');
  msg_Consolidar(hojeBot); // Passa a data de hoje como referência
  enviarTelegram(chatId, "📊 <i>Compilado atualizado enviado ao canal.</i>");
}

    // 8.4 COMANDO: /escala
    else if (comando === '/escala') {
      msg_EnviarEscala("SOLICITAÇÃO");
    }

// 8.5 NOVO COMANDO: /contatos
    else if (comando === '/contatos') {
      let contatos = `☎️ <b>TELEFONES ÚTEIS - DEFESA CIVIL</b>\n`;
      contatos += `──────────────────\n\n`;
      contatos += `🚒 <b>BOMBEIROS:</b> 193\n`;
      contatos += `🚓 <b>POLÍCIA MILITAR:</b> 190\n`;
      contatos += `💡 <b>CEMIG:</b> 116\n`;
      contatos += `💧 <b>COPASA:</b> 115\n`;
      contatos += `🌳 <b>MEIO AMBIENTE (Poda):</b> 31 9643-9350\n`; // Coloque o número da sua cidade
      contatos += `🏥 <b>SAMU:</b> 192\n\n`;
      contatos += `<i>💡 Clique no número para ligar direto.</i>`;
      
      enviarTelegram(chatId, contatos);
    }

    // 8.6 COMANDO: /ajuda
    else if (comando === '/ajuda' || comando === '/start') {
      let ajuda = `🤖 <b>ASSISTENTE OPERACIONAL</b>\n\n`;
      ajuda += `🔎 <code>/busca [nº] [data]</code> - Detalhes precisos\n`;
      ajuda += `📍 <code>/endereco [rua]</code> - Busca por local\n`;
      ajuda += `📊 <code>/status</code> - Painel do dia\n`;
      ajuda += `📅 <code>/escala</code> - Equipe de plantão\n`;
      ajuda += `☎️ <code>/contatos</code> - Números úteis`;
      enviarTelegram(chatId, ajuda);
    }

  } catch (err) {
    console.error("Erro no doPost: " + err.message);
  }
}

/************************************************************
 * 8.7 FUNÇÕES DE PESQUISA NA BASE
 ************************************************************/

// Busca por ID Único (Número + Data)
function buscarPorId(chatId, num, data) {
  const idProcurado = formatar.id(num, data);
  const dados = sh(CONFIG.BASE).getDataRange().getValues();
  
  // r[0] é o ID_UNICO na coluna A
  const r = dados.find(linha => String(linha[0]) === idProcurado);

  if (r) {
    // 1. Pega o relato, garante que é texto e remove "espaços fantasmas"
let relatoSeguro = String(r[14] || '').trim();
// 2. Troca os sinais matemáticos por códigos seguros para o Telegram não surtar
relatoSeguro = relatoSeguro.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let msg = `🔍 <b>CHAMADO LOCALIZADO</b>\n`;
    msg += `📄 <b>Nº ${r[1]}</b> (${formatar.data(r[2])})\n`;
    msg += `──────────────────\n`;
    msg += `🧭 <b>Status:</b> ${r[3]}\n`;
    msg += `🧭 <b>Tipologia:</b> ${r[4]} | ${r[5]}\n`;
    msg += `📍 <b>Local:</b> ${r[7]}, ${r[8]} - ${r[9]}\n`;
    msg += `👤 <b>Solicitante:</b> ${r[10]} (${r[11]})\n\n`;
    // 3. Monta a mensagem final com a trava de segurança
msg += `<blockquote>📝 <b>Relato de Campo:</b>\n<i>${relatoSeguro || 'Aguardando atendimento...'}</i></blockquote>\n`;
    msg += `👷 <b>Equipe:</b> ${r[12] || '---'}\n`;
    msg += `📅 <b>Última Atualização:</b> ${formatar.data(r[22])}`;
    
    enviarTelegram(chatId, msg);
  } else {
    enviarTelegram(chatId, `❌ Nenhum chamado encontrado para o Nº <b>${num}</b> na data <b>${data}</b>.`);
  }
}

// Busca por Endereço (Varrer logradouro)
function buscarPorEndereco(chatId, termo) {
  const dados = sh(CONFIG.BASE).getDataRange().getValues();
  const termoLimpo = termo.toLowerCase();
  
  // Filtra chamados que contenham o nome da rua (Coluna H - Índice 7)
  const resultados = dados.slice(1).filter(r => String(r[7]).toLowerCase().includes(termoLimpo));

  if (resultados.length === 0) {
    enviarTelegram(chatId, `📭 Nenhuma ocorrência encontrada na rua "<b>${termo}</b>".`);
    return;
  }

  let msg = `📍 <b>BUSCA POR ENDEREÇO</b>\n`;
  msg += `<i>Termo: "${termo}" (${resultados.length} encontrado(s))</i>\n\n`;

  // Se achar muitos, faz um resumo. Se achar poucos, detalha mais.
  resultados.forEach(r => {
    const statusEmoji = String(r[3]).includes('Atendido') ? '✅' : '⏳';
    msg += `${statusEmoji} 📄 <b>${r[1]}</b> (${r[2]})\n`;
    msg += `↳ ${r[7]}, nº ${r[8]} - ${r[9]}\n`;
    msg += `↳ Status: <code>${r[3]}</code>\n\n`;
  });

  if (resultados.length > 5) msg += `<i>⚠️ Foram encontrados muitos resultados. Tente ser mais específico.</i>`;

  enviarTelegram(chatId, msg);
}

/************************************************************
 * FUNÇÃO DE ENVIO DE MENSAGEM PARA O TELEGRAM - OBRIGATÓRIA
 ************************************************************/

function enviarTelegram(chatId, mensagem) {
  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM.TOKEN}/sendMessage`;
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: mensagem, parse_mode: 'HTML', disable_web_page_preview: true }),
    muteHttpExceptions: true
  });
}
/************************************************************
 * FUNÇÃO DE ENVIO DE MENSAGEM PARA O TELEGRAM - OBRIGATÓRIA
 ************************************************************/

function enviarTelegram(chatId, mensagem) {
  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM.TOKEN}/sendMessage`;
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: mensagem, parse_mode: 'HTML', disable_web_page_preview: true }),
    muteHttpExceptions: true
  });
}