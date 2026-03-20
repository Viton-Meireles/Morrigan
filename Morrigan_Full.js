/************************************************************
 * SISTEMA DE GESTÃO - DEFESA CIVIL (C2)
 * Atualizado em: 20/03/2026
 * Comandante/Dev: Mestre Viton
 * * ARQUITETURA DO SISTEMA:
 * - Camada 1: Utilitários e Configurações Globais
 * - Camada 2: Roteador (Ouve os formulários e decide para onde vai)
 * - Camada 3: Formatadores de Mensagens (Visual do Telegram)
 * - Camada 4: Motor de Consolidação (O "Trator" da Base Master)
 * - Camada 5: Relatórios e Compilados (Estatísticas e Fechamentos)
 * - Camada 6: Gestão de Escala (Com sistema anti-spam/debounce)
 * - Camada 7: Bot do Telegram (Webhook e Interação via comandos)
 ************************************************************/

/************************************************************
 * 1. CONFIGURAÇÕES E UTILITÁRIOS GLOBAIS
 * Centraliza todas as chaves e IDs para facilitar a manutenção.
 ************************************************************/
const CONFIG = {
  ABERTURA: 'abertura_de_chamado', 
  CAMPO: 'relatorio_em_campo',      
  BASE: 'BASE_CONSOLIDADA',
  ESCALA: 'Escala_diaria_2026',
  STATUS_PADRAO: 'Aguardando atendimento',
  VIAS: 'status_de_vias',
  TELEGRAM: { 
    TOKEN: '8237808044:AAHJf09271f0oPL88_nFXCmoWRqdu6TIxHU', // Chave de acesso fornecida pelo BotFather
    CHATS: { 
      ENTRADA: '-1003862323760',         // Recebe TUDO (Triagem Inicial)
      NEW_OPERACIONAL: '-5193056344', // Filtro: Arbóreo e Doação
      NEW_TECNICA: '-5256034455',     // Filtro: Estrutural, Geológico, etc
      COMPILADO: '-1003750376669',       // Painel de andamento do dia
      INFO_FAST: '-5199963816',       // Alertas de Vias e Resumos Rápidos
      AVULSO_OP: '-5068971586',       // Demandas In Loco Operacional
      AVULSO_TEC: '-5244563273',      // Demandas In Loco Técnica
      CAMPO: '-1003815316144'            // Informes de baixa/término de ocorrência
    }
  }
};

// Função curta para chamar planilhas rapidamente: sh('Nome_da_Aba')
const sh = (nome) => SpreadsheetApp.getActive().getSheetByName(nome);

// MOTOR DE FORMATAÇÃO: Corrige bugs de fuso horário do Google (ex: erro de 1969)
const formatar = {
  data: (v) => {
    if (!v || v == 'Não informado') return 'Não informado';
    // Se o Google entender como Data nativa, formata. Se vier como texto (do Forms), corta a hora.
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
    return String(v).split(' ')[0];
  },
  hora: (v) => {
    if (!v || v == '00:00') return '---';
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
    let s = String(v);
    let p = s.includes(' ') ? s.split(' ')[1] : s; // Separa a data da hora se vierem juntos
    return p.split(':').slice(0,2).join(':'); // Garante que retorne apenas HH:mm
  },
  id: (n, d) => {
    // Cria uma "Identidade Única" para a Base Master. Ex: "15_20260320" (Nº + Data Invertida)
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
 * 2. ROTEADOR GERAL (O Cérebro de Triagem)
 * É acionado automaticamente toda vez que ALGUÉM envia QUALQUER formulário.
 ************************************************************/
function rotearFormulario(e) {
  const nomeAba = e.range.getSheet().getName(); // Descobre de qual formulário veio
  const dados = e.namedValues; // Captura as respostas usando os títulos das colunas
  const get = (campo) => dados[campo] ? dados[campo][0].trim() : ''; // Função auxiliar para evitar erros de valor vazio

  // 1º Passo Obrigatório: Joga os dados novos para a BASE MASTER
  consolidarChamados();

  // 2º Passo: Decide quem vai ser avisado com base na aba de origem
  if (nomeAba === CONFIG.ABERTURA) {
    // Envia para a coordenação geral sempre
    notificarAbertura(dados, CONFIG.TELEGRAM.CHATS.ENTRADA);
    
    // Filtro Inteligente de Setor: Separa Arbóreo/Doação do Resto
    const tipo = get('tipologia_inicial');
    if (tipo.includes('Arbóreo') || tipo.includes('Doação')) {
      notificarAbertura(dados, CONFIG.TELEGRAM.CHATS.NEW_OPERACIONAL);
    } else {
      notificarAbertura(dados, CONFIG.TELEGRAM.CHATS.NEW_TECNICA);
    }
  } 
  else if (nomeAba === CONFIG.CAMPO) {
    notificarCampo(dados); // Avisa a equipe de Campo da baixa
    
    // Identifica qual o dia afetado pela edição e gera o painel atualizado
    const dataRef = formatar.data(get('data_do_chamado') || get('data_do_atendimento') || new Date());
    msg_Consolidar(dataRef);
    msg_InfoFast(); // Gera o "Dashboard de Bolso"
  }
  else if (nomeAba === CONFIG.VIAS) {
    notificarStatusVia(dados); // Fluxo exclusivo de Alertas de Trânsito
  }
  else if (nomeAba === 'aba_avulsos') { 
    // Fluxo de Chamados Criados na Rua (sem passar pelo atendimento inicial)
    const setor = get('Setor Responsável'); 
    const destino = (setor === 'Operacional') ? CONFIG.TELEGRAM.CHATS.AVULSO_OP : CONFIG.TELEGRAM.CHATS.AVULSO_TEC;
    notificarAvulso(dados, destino);
  }
}

/************************************************************
 * 3. MENSAGENS DE NOTIFICAÇÃO 
 * Funções focadas apenas em montar textos bonitos e com emojis para o Telegram.
 ************************************************************/

// Mensagem gerada pelo formulário de Triagem Inicial
function notificarAbertura(v, destinoId) {
  const get = (campo) => v[campo] ? v[campo][0].trim() : '';

  // Validações para não poluir a tela com '00' ou espaços vazios
  const numEndRaw = get('numero_do_endereco');
  const numeroEndereco = (numEndRaw === '00' || numEndRaw === '') ? 'S/N' : numEndRaw;
  const pontoRef = get('ponto_de_referencia') || 'Não informado';
  const telefone = (get('telefone_de_contato') === '00' || get('telefone_de_contato') === '') ? 'Não informado' : get('telefone_de_contato');
  const cpf = (get('CPF_do_solicitante') === '00' || get('CPF_do_solicitante') === '') ? 'Não informado' : get('CPF_do_solicitante');
  const horaFormatada = formatar.hora(get('hora_do_chamado'));

  // Procura em todas as colunas de subtipo qual delas foi preenchida
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

  enviarTelegram(destinoId, msg);
}

// Mensagem gerada quando a equipe encerra ou agenda um atendimento
function notificarCampo(v) {
  const get = (campo) => v[campo] ? v[campo][0].trim() : '';

  const numRaw = get('numero_do_endereco_confirmado');
  const numFinal = (numRaw === '00' || numRaw === '') ? 'S/N' : numRaw;
  
  const formatarDataHora = (valor) => {
    if (!valor) return 'Não informado';
    return `${formatar.data(valor)} às ${formatar.hora(valor)}`;
  };

  const equipeLista = get('equipe').replace(/, /g, ' | '); // Exibe "João | Maria" ao invés de "João, Maria"
  const status = get('status_atual');

  let msg = `✅ <b>ATUALIZAÇÃO DE OCORRÊNCIA</b>\n\n`;
  msg += `<b>📄 CHAMADO ${get('Número do Chamado')}</b>\n`; 
  msg += `📅 <b>Data:</b> ${get('data_do_chamado')}\n`;
  msg += `📍 <b>Endereço:</b> ${get('logradouro_confirmado')}, nº ${numFinal} - ${get('bairro_confirmado')}\n`;
  msg += `👷 <b>Equipe:</b> ${equipeLista}\n\n`;

  // Blocos condicionais: Só aparecem se houve evento específico
  const statusVia = get('status_da_via');
  if (statusVia && statusVia !== 'Liberada') {
    msg += `<blockquote>🚧 <b>VIA: ${statusVia.toUpperCase()}</b>\n`;
    if (get('detalhes_via')) msg += `<i>Nota: ${get('detalhes_via')}</i>\n`;
    msg += `</blockquote>\n`;
  }

  if (get('ha_vitimas') === 'Sim') {
    msg += `<blockquote>⚠️ <b>VÍTIMAS CONFIRMADAS</b>\n`;
    msg += `• Quantidade: ${get('quantidade_vitimas') || 'Não informada'}\n`;
    msg += `</blockquote>\n`;
  }

  if (get('houve_doacao') === 'Sim') {
    msg += `<blockquote>📦 <b>DOAÇÕES REALIZADAS</b>\n`;
    msg += `• Itens: ${get('materiais_doados')}\n`;
    msg += `</blockquote>\n`;
  }

  const orgaos = get('encaminhamento_orgaos');
  if (orgaos) {
    msg += `<blockquote>🏢 <b>DIRECIONAMENTO:</b>\n`;
    msg += `• Acionado: ${orgaos.replace(/, /g, ' | ')}\n`;
    msg += `</blockquote>\n`;
  }

  // Define os dados de encerramento dependendo do novo Status
  if (status.includes('Atendido')) {
    msg += `📝 <b>Status:</b> ✅ Atendido\n`;
    msg += `⏰ <b>Atendido em</b> ${formatarDataHora(get('data_hora_atendimento'))}\n`;
    msg += `🧭 <b>Tipologia confirmada:</b> ${get('tipologia_confirmada')}\n`;
    msg += `↳ 📝 <b>Relato:</b> ${get('resumo_de_campo')}\n\n`;
  } else if (status.includes('Cancelado')) {
    msg += `📝 <b>Status:</b> ❌ Cancelado\n`;
    msg += `↳ <b>Motivo:</b> ${get('descreva_o_cancelamento') || 'Não informado'}\n\n`;
  } else if (status.includes('Agendado')) {
    msg += `📝 <b>Status:</b> 🕒 Agendado\n`;
    msg += `⏰ <b>Previsão:</b> ${formatarDataHora(get('data_hora_agendamento'))}\n`;
    msg += `🕒 <b>Turno:</b> ${get('Turno_previsto')}\n`;
    msg += `↳ <b>Motivo:</b> ${get('descreva_o_agendamento') || 'Não informado'}\n\n`;
  }

  enviarTelegram(CONFIG.TELEGRAM.CHATS.CAMPO, msg);
}

// Alerta urgente de monitoramento de fluxo da cidade
function notificarStatusVia(v) {
  const get = (campo) => v[campo] ? v[campo][0].trim() : '';
  const status = get('Status da Via');
  const fuso = Session.getScriptTimeZone();
  const hora = Utilities.formatDate(new Date(), fuso, 'HH:mm');

  // Lógica de Semáforo
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

  msg += `\n──────────────────\n🕒 <i>Informado às ${hora}</i>`;

  // Alerta enviado para Gestão e também para quem está na rua (Entrada)
  enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, msg);
  enviarTelegram(CONFIG.TELEGRAM.CHATS.ENTRADA, msg);
}

function notificarAvulso(v, destinoId) {
  const get = (campo) => v[campo] ? v[campo][0].trim() : '';
  let msg = `🕵️ <b>NOVO CHAMADO IN LOCO (AVULSO)</b>\n`;
  msg += `📍 Local: ${get('Logradouro')}, ${get('Bairro')}\n`;
  msg += `👷 Equipe: ${get('Equipe')}\n`;
  msg += `📝 Relato: ${get('Relato')}\n`;
  enviarTelegram(destinoId, msg);
}

/************************************************************
 * 4. CONSOLIDAÇÃO DA BASE MASTER (A Alma do Sistema)
 * Funde duas planilhas soltas numa só Base de Dados confiável.
 ************************************************************/
function consolidarChamados() {
  const sheetBase = sh(CONFIG.BASE);
  
  // 4.1 Cria as 24 colunas caso a planilha seja nova ou tenha sido resetada
  if (!sheetBase.getLastRow()) {
    sheetBase.appendRow([
      'ID_UNICO', 'Nº Chamado', 'Data Abertura', 'Status Atual', 'Tipologia', 'Subtipo', 
      'Origem', 'Logradouro', 'Nº', 'Bairro', 'Solicitante', 'Telefone', 
      'Equipe', 'Data Atend.', 'Relato de Campo', 'Agendamento', 'Turno', 
      'Motivo Agend/Canc', 'Doação', 'Itens Doados', 'Notificado', 'Órgãos Acionados', 
      'Última Atualização', 'Complemento Confirmado'
    ]);
  }

  // 4.2 Criação de Mapa de Memória (Para busca instantânea, evita lentidão com muitos dados)
  const dataBase = sheetBase.getDataRange().getValues();
  const mapaBase = new Map();
  // Guarda: ID ÚNICO -> Número da Linha
  dataBase.forEach((l, i) => { if (i > 0 && l[0]) mapaBase.set(String(l[0]), i + 1); });

  // --- PASSO A: INSERIR NOVAS ABERTURAS ---
  const dAb = sh(CONFIG.ABERTURA).getDataRange().getValues();
  const novas = []; // Array que acumulará as novas inserções (Mecanismo "Lote" é mais rápido)
  
  for (let i = 1; i < dAb.length; i++) {
    const id = formatar.id(dAb[i][2], dAb[i][3]);
    if (id && !mapaBase.has(id)) { // Se o ID existe, mas não tá na Master, é um chamado novo
      const subtipo = dAb[i].slice(17, 25).find(v => v) || 'Não informado';
      novas.push([
        id, dAb[i][2], 
        dAb[i][3], // Valor Bruto (Data + Hora) preservado para leitura correta do Bot
        dAb[i][5], dAb[i][15], subtipo,
        dAb[i][6], dAb[i][7], dAb[i][8], dAb[i][10], dAb[i][12], dAb[i][13],
        '', '', '', '', '', '', '', '', '', '', new Date(), '' 
      ]);
      mapaBase.set(id, -1); // Marca o ID como processado para não duplicar no loop
    }
  }
  // Insere todas as linhas novas de uma vez (Extrema Performance)
  if (novas.length) sheetBase.getRange(sheetBase.getLastRow()+1, 1, novas.length, novas[0].length).setValues(novas);

  // --- PASSO B: ATUALIZAR STATUS DE CAMPO ---
  const dCp = sh(CONFIG.CAMPO).getDataRange().getValues();
  const dataBaseAtual = sheetBase.getDataRange().getValues();
  const mapaAtual = new Map();
  // Recarrega o Mapa pois novas linhas foram adicionadas no Passo A
  dataBaseAtual.forEach((l, i) => { if(i > 0 && l[0]) mapaAtual.set(String(l[0]), i + 1); });
  
  for (let i = 1; i < dCp.length; i++) {
    const id = formatar.id(dCp[i][2], dCp[i][3]); 
    const linha = mapaAtual.get(id); // Descobre instantaneamente em qual linha da Base este chamado está

    if (linha && linha !== -1) {
      // Sobrescreve as colunas específicas daquela linha com os dados trazidos da rua
      sheetBase.getRange(linha, 4).setValue(dCp[i][4]);   
      sheetBase.getRange(linha, 5).setValue(dCp[i][19]);  
      sheetBase.getRange(linha, 13).setValue(dCp[i][5]);  
      sheetBase.getRange(linha, 14).setValue(dCp[i][6]);  // Preserva Data/Hora do Atendimento Real
      sheetBase.getRange(linha, 15).setValue(dCp[i][7]);  
      sheetBase.getRange(linha, 16).setValue(dCp[i][20]); 
      sheetBase.getRange(linha, 23).setValue(new Date()); // Carimbo de tempo da modificação
      sheetBase.getRange(linha, 24).setValue(dCp[i][17]); // Complemento de endereço real
    }
  }
}

/************************************************************
 * 5. COMPILADOS E ESTATÍSTICAS (Painéis de Gestão)
 ************************************************************/

// Gera o Quadro do Dia. Recebe "dataEspecifica" para saber de qual dia exibir o quadro.
function msg_Consolidar(dataEspecifica) {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  if (dados.length <= 1) return;

  const fuso = Session.getScriptTimeZone();
  const hojeSistema = Utilities.formatDate(new Date(), fuso, 'dd/MM/yyyy');
  const agoraStr = `${hojeSistema} às ${Utilities.formatDate(new Date(), fuso, 'HH:mm')}`;

  // Se veio algum lixo tipo [object Object], limpa e deixa null
  let dataAlvo = (typeof dataEspecifica === 'string') ? dataEspecifica : null;

  // Lógica de "Descoberta": Se não mandaram a data, procura a data do último chamado que foi editado (Col W)
  if (!dataAlvo) {
    let maxUpdate = 0;
    dados.slice(1).forEach(r => {
      const time = new Date(r[22]).getTime(); 
      if (time > maxUpdate) {
        maxUpdate = time;
        dataAlvo = formatar.data(r[2]); 
      }
    });
  }
  
  if (!dataAlvo || dataAlvo === '[object Object]') dataAlvo = hojeSistema;

  // Filtra apenas o que foi aberto nesta data OU que foi reagendado para ela
  const chamadosDoDia = dados.slice(1).filter(r => {
    const dataAbertura = formatar.data(r[2]); 
    const dataAgendada = formatar.data(r[15]); 
    return (dataAbertura === dataAlvo || dataAgendada === dataAlvo);
  });

  // Estatísticas matemáticas básicas
  const total = chamadosDoDia.length;
  const atendidos = chamadosDoDia.filter(r => String(r[3]).includes('Atendido')).length;
  const cancelados = chamadosDoDia.filter(r => String(r[3]).includes('Cancelado')).length;
  const agendados = chamadosDoDia.filter(r => String(r[3]).includes('Agendado')).length;
  const pendentes = total - atendidos - cancelados - agendados;

  const icones = { 'Arbóreo': '🌳', 'Acidente viário': '🚧', 'Estrutural': '🏚️', 'Geológico': '⛰️', 'Hidrológico': '🌊', 'Incêndio': '🔥', 'Entrega de doação': '🎁' };
  const grupos = {}; 

  // Agrupamento de listas por Categoria (Tipologia)
  chamadosDoDia.forEach(r => {
    const tipologiaBruta = r[4] || 'Outros'; 
    // Limpeza de caracteres especiais/emojis no nome da Categoria
    const nomeLimpo = tipologiaBruta.replace(/[^\w\sÀ-ú]/g, '').trim();
    if (!grupos[nomeLimpo]) grupos[nomeLimpo] = [];
    grupos[nomeLimpo].push(r);
  });

  let msg = `📊 <b>COMPILADO DE CHAMADOS</b>\n`;
  msg += `📅 <b>Referência:</b> ${dataAlvo}\n`; 
  msg += `<i>Última atualização: ${agoraStr}</i>\n\n`;
  msg += `<b>TOTAL DE CHAMADOS:</b> ${total}\n`;
  msg += `✅ Atendidos: ${atendidos}  ⏳ Pendentes: ${pendentes}\n`;
  msg += `📅 Agendados: ${agendados}  ❌ Cancelados: ${cancelados}\n`;
  msg += `──────────────────\n`;

  // Montagem do Relatório linha a linha
  for (const categoria in grupos) {
    const emoji = icones[categoria] || '📋';
    msg += `${emoji} | <b>${categoria.toUpperCase()}:</b>\n\n`;
    
    grupos[categoria].forEach(r => {
      const chamadoNum = r[1];
      const statusRaw = String(r[3] || '');
      
      // Limpa os Emojis que vem do Forms e troca "Aguardando..." para o termo mais curto "Pendente"
      const statusLimpo = statusRaw.replace(/[^\w\sÀ-ú]/g, '').replace('Aguardando atendimento', 'Pendente').trim();

      const logradouro = r[7] || 'Não informado'; 
      const numFinal = (String(r[8]) === '00' || !r[8]) ? 's/n' : r[8];
      const compRaw = String(r[23] || '').trim(); 
      const complemento = (compRaw && compRaw !== 'undefined') ? ` – <i>${compRaw}</i>` : ''; 
      const bairro = r[9] || 'Não informado'; 
      
      // Trava de segurança: Se vier < ou > no relato (matemática), evita que o Telegram quebre o HTML
      let relatoSeguro = String(r[14] || 'Sem observações.').trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');

      let statusEmoji = '⏳';
      let acao = 'Pendente desde'; 
      let tempoRef = `${formatar.data(r[2])} às ${formatar.hora(r[2])}`; // Hora correta puxada do valor bruto da Coluna C

      // Adaptação do verbo e do horário dependendo do que aconteceu
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

  // Prevenção de mensagem em branco
  if (total === 0) {
    msg = `📊 <b>COMPILADO DE CHAMADOS</b>\n📅 <b>Referência:</b> ${dataAlvo}\n\n‼️ <b>Sem demandas para esta data.</b>`;
  }
  enviarTelegram(CONFIG.TELEGRAM.CHATS.COMPILADO, msg);
}

// DashBoard Rápido: Diz quem tá trabalhando, e onde estão os gargalos pendentes
function msg_InfoFast() {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  if (dados.length <= 1) return;

  const fuso = Session.getScriptTimeZone();
  const hoje = Utilities.formatDate(new Date(), fuso, 'dd/MM/yyyy');
  const chamadosHoje = dados.slice(1).filter(r => formatar.data(r[2]) === hoje);
  
  // Isola apenas o que é problema (não resolvido e não cancelado)
  const pendentes = chamadosHoje.filter(r => {
    const status = String(r[3]).toLowerCase();
    return !status.includes('atendido') && !status.includes('cancelado');
  });

  const total = chamadosHoje.length;
  const qtdPendentes = pendentes.length;
  const atendidos = total - qtdPendentes;

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

// Fechamento da Operação: Identifica Palavras Chave (Habitacional, Demolição) via RegEx Simples
function resumoFimDeTurno() {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  if (dados.length <= 1) return;

  const fuso = Session.getScriptTimeZone();
  const hoje = Utilities.formatDate(new Date(), fuso, 'dd/MM/yyyy');
  const chamadosHoje = dados.slice(1).filter(r => formatar.data(r[2]) === hoje);

  if (chamadosHoje.length === 0) {
    enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, `📴 <b>FIM DE TURNO:</b> Nenhuma atividade registrada hoje (${hoje}).`);
    return;
  }

  // Acumuladores 
  let estatisticas = {
    total: chamadosHoje.length, atendidos: 0, pendentes: 0, tipologias: {},
    auxilioHabitacional: 0, demolicao: 0, doacoesEntregues: 0, avulsosInLoco: 0
  };

  chamadosHoje.forEach(r => {
    const status = String(r[3]).toLowerCase();
    const tipo = r[4] || 'Outros';
    const relato = String(r[14]).toLowerCase(); 
    const orgaos = String(r[21]).toLowerCase(); 
    const doacaoSituacao = String(r[18]).toLowerCase(); 
    const origem = String(r[6]).toLowerCase(); 

    status.includes('atendido') ? estatisticas.atendidos++ : estatisticas.pendentes++;
    estatisticas.tipologias[tipo] = (estatisticas.tipologias[tipo] || 0) + 1;

    // Filtros inteligentes por palavra-chave para extrair dados sem colunas específicas
    if (orgaos.includes('habitacional') || relato.includes('habitacional') || relato.includes('auxílio')) estatisticas.auxilioHabitacional++;
    if (relato.includes('demolição') || relato.includes('demolir') || relato.includes('interdição total')) estatisticas.demolicao++;
    if (doacaoSituacao.includes('sim')) estatisticas.doacoesEntregues++;
    if (origem.includes('loco') || origem.includes('avulso')) estatisticas.avulsosInLoco++;
  });

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
  msg += `<i>Relatório gerado às ${Utilities.formatDate(new Date(), fuso, 'HH:mm')}</i>`;

  enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, msg);
}

/************************************************************
 * 6. RELATÓRIOS MATINAIS E PENDÊNCIAS
 * Envia as listas de missões para as equipes específicas
 ************************************************************/

// A MAIS IMPORTANTE DA MANHÃ: Varre chamados velhos pendentes e junta com os agendados de hoje.
function relatorioAgendadosHoje() {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  if (dados.length <= 1) return;

  const hoje = new Date();
  const hojeFormatado = formatar.data(hoje);
  
  // Regra de Negócio: Precisa ser resolvido HOJE ou está ATRASADO em relação ao dia de hoje?
  const pendenciasAtivas = dados.slice(1).filter(r => {
    const dataAgendada = formatar.data(r[15]); 
    const dataAbertura = formatar.data(r[2]);  
    const status = String(r[3] || '').toLowerCase();
    
    const ehHoje = (dataAgendada === hojeFormatado || dataAbertura === hojeFormatado);
    const estaPendente = !status.includes('atendido') && !status.includes('cancelado');
    
    // Devolve true se é um problema que não foi resolvido e o tempo de ação passou ou é hoje.
    return estaPendente && (ehHoje || dataAgendada < hojeFormatado || dataAbertura < hojeFormatado);
  });

  if (pendenciasAtivas.length === 0) {
    enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, `✅ <b>Tudo em dia!</b> Nenhuma pendência acumulada para hoje.`);
    return;
  }

  // Prepara as caixas postais separadas por Setor
  const setores = {
    'op': { nome: '📦 OPERACIONAL', chat: CONFIG.TELEGRAM.CHATS.NEW_OPERACIONAL, hoje: [], atrasados: [] },
    'tec': { nome: '📐 TÉCNICA', chat: CONFIG.TELEGRAM.CHATS.NEW_TECNICA, hoje: [], atrasados: [] }
  };

  pendenciasAtivas.forEach(r => {
    const equipe = String(r[12]).toLowerCase();
    const dataRef = r[15] ? formatar.data(r[15]) : formatar.data(r[2]); // Usa agendamento se tiver, senão usa abertura
    const ehAtrasado = dataRef < hojeFormatado; // Compara strings DD/MM/AAAA para saber se é do passado

    const item = `🔔 <b>[${r[1]}]</b> ${r[4]}\n` +
                 `📍 ${r[7]}, ${r[8]} - ${r[9]}\n` +
                 `📅 Ref: ${dataRef} | 🕒 Turno: ${r[16] || '---'}\n` +
                 `──────────────────\n`;

    // Define de quem é o problema
    const alvo = (equipe.includes('op') || equipe.includes('operacional')) ? setores.op : setores.tec;
    
    if (ehAtrasado) alvo.atrasados.push(item);
    else alvo.hoje.push(item);
  });

  // Envia as missões para cada Setor
  for (let chave in setores) {
    const s = setores[chave];
    if (s.hoje.length > 0 || s.atrasados.length > 0) {
      let msg = `📋 <b>PAINEL DE TRABALHO: ${s.nome}</b>\n`;
      msg += `📅 Data: ${hojeFormatado}\n\n`;

      if (s.atrasados.length > 0) msg += `⚠️ <b>PENDÊNCIAS ACUMULADAS:</b>\n${s.atrasados.join('')}\n`;
      if (s.hoje.length > 0) msg += `📌 <b>DEMANDAS DE HOJE:</b>\n${s.hoje.join('')}`;

      enviarTelegram(s.chat, msg);
    }
  }
}

// "Visão de Guerra" solicitada via comando /pendentes (Junta OP + TEC num relatório geral)
function enviarPendentesGeral(chatId) {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  const hoje = formatar.data(new Date());

  const pendentes = dados.slice(1).filter(r => {
    const dataChamado = formatar.data(r[2]);
    const status = String(r[3]).toLowerCase();
    return dataChamado === hoje && !status.includes('atendido') && !status.includes('cancelado');
  });

  let msg = `🚨 <b>STATUS GERAL: PENDÊNCIAS HOJE</b>\n`;
  msg += `──────────────────\n\n`;

  const op = pendentes.filter(r => String(r[12]).toLowerCase().includes('op'));
  const tec = pendentes.filter(r => !String(r[12]).toLowerCase().includes('op')); // Tudo que não é OP, é TEC por padrão

  msg += `📐 <b>SETOR TÉCNICO:</b>\n`;
  tec.length ? tec.forEach(r => msg += `• [${r[1]}] ${r[4]} - ${r[7]}\n`) : msg += `<i>Vazio</i>\n`;

  msg += `\n📦 <b>SETOR OPERACIONAL:</b>\n`;
  op.length ? op.forEach(r => msg += `• [${r[1]}] ${r[4]} - ${r[7]}\n`) : msg += `<i>Vazio</i>\n`;

  msg += `\n──────────────────\n📊 Total Pendente: ${pendentes.length}`;
  enviarTelegram(chatId, msg);
}

// Visão de Planejamento (O que temos agendado amanhã e depois de amanhã?)
function enviarListaAgendados(chatId) {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  const hoje = formatar.data(new Date());

  const agendados = dados.slice(1).filter(r => {
    const dataAgend = formatar.data(r[15]); 
    const status = String(r[3]);
    return dataAgend && dataAgend !== hoje && dataAgend !== 'Não informado' && status.includes('Agendado');
  });

  let msg = `📅 <b>PLANEJAMENTO: AGENDADOS FUTUROS</b>\n`;
  msg += `──────────────────\n\n`;

  if (agendados.length === 0) {
    msg += "<i>Não há agendamentos para os próximos dias.</i>";
  } else {
    // .sort reorganiza as linhas de data menor para maior
    agendados.sort((a, b) => new Date(a[15]) - new Date(b[15]));
    agendados.forEach(r => {
      msg += `🗓️ <b>${formatar.data(r[15])}</b>\n• [${r[1]}] ${r[12] || 'Sem Setor'} - ${r[7]}\n\n`;
    });
  }
  enviarTelegram(chatId, msg);
}

// Filtro cirúrgico de pendências para os comandos específicos (/pendentesop e /pendentestec)
function enviarPendentesSetor(chatId, setor) {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  const hoje = formatar.data(new Date());
  const nomeSetor = (setor === 'op') ? '📦 OPERACIONAL' : '📐 TÉCNICA';

  const lista = dados.slice(1).filter(r => {
    const equipe = String(r[12]).toLowerCase();
    const dataChamado = formatar.data(r[2]);
    const status = String(r[3]).toLowerCase();
    
    const ehDoSetor = (setor === 'op') ? (equipe.includes('op') || equipe.includes('operacional')) : (equipe.includes('tec') || equipe.includes('técnica'));
    return ehDoSetor && dataChamado === hoje && !status.includes('atendido');
  });

  let msg = `📋 <b>PENDÊNCIAS: ${nomeSetor}</b>\n`;
  msg += `──────────────────\n\n`;
  lista.length ? lista.forEach(r => msg += `• [${r[1]}] ${r[7]}, ${r[9]}\n`) : msg += `✅ Tudo em dia!`;
  enviarTelegram(chatId, msg);
}

/************************************************************
 * 7. GESTÃO DE ESCALA DIÁRIA
 * Mecanismo de Prevenção de Spam em Edições Simultâneas (Debounce)
 ************************************************************/
function msg_EnviarEscala(origem = "AUTOMÁTICO") {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetEscala = ss.getSheetByName('Escala_diaria_2026');
  if (!sheetEscala) return;

  const dados = sheetEscala.getDataRange().getValues();
  const hojeStr = formatar.data(new Date());
  let escalaHoje = null;

  // Busca qual linha corresponde à data de hoje no calendário anual
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

  enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, msg);
}

// Gatilho que é ativado ao mexer na planilha de escala
function gatilhoEdicaoEscala(e) {
  const sheetName = e.range.getSheet().getName();
  if (sheetName === 'Escala_diaria_2026') {
    // 1. CÓDIGO ANTI-SPAM: Destrói qualquer contagem regressiva anterior 
    const gatilhos = ScriptApp.getProjectTriggers();
    gatilhos.forEach(t => {
      if (t.getHandlerFunction() === 'processarEnvioEscalaAgendado') ScriptApp.deleteTrigger(t);
    });

    // 2. Inicia uma nova contagem de 2 minutos (Tempo de sobra pro RH preencher tudo)
    ScriptApp.newTrigger('processarEnvioEscalaAgendado')
             .timeBased().after(2 * 60 * 1000).create();
  }
}

// A função que é finalmente executada após a contagem de 2 min acabar
function processarEnvioEscalaAgendado() {
  msg_EnviarEscala("EDIT");
  // O gatilho de tempo é efêmero, mas fazemos uma limpeza geral por segurança
  const gatilhos = ScriptApp.getProjectTriggers();
  gatilhos.forEach(t => {
    if (t.getHandlerFunction() === 'processarEnvioEscalaAgendado') ScriptApp.deleteTrigger(t);
  });
}

/************************************************************
 * 8. INTERAÇÃO E COMANDOS DO BOT DO TELEGRAM
 * O Webhook doPost "escuta" a API do Telegram em tempo real.
 ************************************************************/
function doPost(e) {
  try {
    const dados = JSON.parse(e.postData.contents);
    if (!dados.message || !dados.message.text) return;

    // Converte tudo para minúscula e quebra as palavras nos espaços para separar Comando de Argumento
    const textoBot = dados.message.text.toLowerCase().trim();
    const partes = textoBot.split(' '); 
    const comando = partes[0]; // Ex: "/editar"
    const chatId = dados.message.chat.id;

    if (comando === '/busca') {
      const num = partes[1], data = partes[2];
      if (!num || !data) return enviarTelegram(chatId, "⚠️ <b>Erro</b>\nUse: <code>/busca [nº] [dd/mm/aaaa]</code>");
      buscarPorId(chatId, num, data);
    }
    else if (comando === '/endereco') {
      const termo = partes.slice(1).join(' ');
      if (!termo) return enviarTelegram(chatId, "⚠️ Digite o nome da rua.");
      buscarPorEndereco(chatId, termo);
    }
    else if (comando === '/status') {
      // Dispara o quadro geral do dia em que o comando for pedido
      const hojeBot = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
      msg_Consolidar(hojeBot); 
      enviarTelegram(chatId, "📊 <i>Compilado atualizado enviado ao canal.</i>");
    }
    else if (comando === '/escala') {
      msg_EnviarEscala("SOLICITAÇÃO");
    }
    else if (comando === '/contatos') {
      let contatos = `☎️ <b>TELEFONES ÚTEIS</b>\n──────────────────\n`;
      contatos += `🚒 <b>BOMBEIROS:</b> 193\n🚓 <b>PM:</b> 190\n💡 <b>CEMIG:</b> 116\n`;
      contatos += `💧 <b>COPASA:</b> 115\n🌳 <b>PODA:</b> 31 9643-9350\n🏥 <b>SAMU:</b> 192\n`;
      enviarTelegram(chatId, contatos);
    }
    else if (comando === '/transferir') {
      // Recurso Operacional avançado: Muda o dono da ocorrência e o chat do relatório
      const num = partes[1], data = partes[2], destino = partes[3] ? partes[3].toLowerCase() : '';
      if (!num || !data || !['op', 'tec'].includes(destino)) return enviarTelegram(chatId, "⚠️ Use: <code>/transferir [nº] [data] [op ou tec]</code>");
      transferirChamadoSetor(chatId, num, data, destino);
    }
    else if (comando === '/editar') {
      // Modifica campos críticos sem precisar abrir o Forms na rua
      const num = partes[1], data = partes[2], campo = partes[3];
      const novoValor = partes.slice(4).join(' '); // Remonta a frase a partir da palavra 4
      if (!num || !data || !campo || !novoValor) return enviarTelegram(chatId, "⚠️ Use: <code>/editar [nº] [data] [campo] [novo texto]</code>");
      editarChamadoNaBase(chatId, num, data, campo, novoValor);
    }
    else if (comando === '/pendentesop') enviarPendentesSetor(chatId, 'op');
    else if (comando === '/pendentestec') enviarPendentesSetor(chatId, 'tec');
    else if (comando === '/pendentes') enviarPendentesGeral(chatId);
    else if (comando === '/agendados') enviarListaAgendados(chatId);
    else if (comando === '/ajuda' || comando === '/start') {
      let ajuda = `🤖 <b>ASSISTENTE OPERACIONAL</b>\n\n`;
      ajuda += `🔎 <code>/busca [nº] [data]</code>\n📍 <code>/endereco [rua]</code>\n`;
      ajuda += `📊 <code>/status</code> - Compilado\n🚨 <code>/pendentes</code> - Visão Geral\n`;
      ajuda += `📅 <code>/agendados</code> - Futuros\n🔄 <code>/transferir</code> - Mudar setor\n`;
      ajuda += `✏️ <code>/editar</code> - Atualizar relato/status\n☎️ <code>/contatos</code>\n`;
      enviarTelegram(chatId, ajuda);
    }
  } catch (err) {
    console.error("Erro no doPost: " + err.message);
  }
}

/************************************************************
 * 9. FUNÇÕES DE PESQUISA E EDIÇÃO NA BASE DE DADOS
 * Ferramentas de Manutenção Via Telegram
 ************************************************************/

// Busca um chamado cirurgicamente pelo ID
function buscarPorId(chatId, num, data) {
  const idProcurado = formatar.id(num, data);
  const dados = sh(CONFIG.BASE).getDataRange().getValues();
  const r = dados.find(linha => String(linha[0]) === idProcurado);

  if (r) {
    // HTML Escape: Previne que "<" no texto bugue a formatação do Telegram
    let relatoSeguro = String(r[14] || '').trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let msg = `🔍 <b>CHAMADO LOCALIZADO</b>\n📄 <b>Nº ${r[1]}</b> (${formatar.data(r[2])})\n──────────────────\n`;
    msg += `🧭 <b>Status:</b> ${r[3]}\n🧭 <b>Tipologia:</b> ${r[4]} | ${r[5]}\n`;
    msg += `📍 <b>Local:</b> ${r[7]}, ${r[8]} - ${r[9]}\n👤 <b>Solicitante:</b> ${r[10]} (${r[11]})\n\n`;
    msg += `<blockquote>📝 <b>Relato de Campo:</b>\n<i>${relatoSeguro || 'Aguardando atendimento...'}</i></blockquote>\n`;
    msg += `👷 <b>Equipe:</b> ${r[12] || '---'}\n📅 <b>Última Atualização:</b> ${formatar.data(r[22])}`;
    enviarTelegram(chatId, msg);
  } else {
    enviarTelegram(chatId, `❌ Nenhum chamado encontrado para o Nº <b>${num}</b> na data <b>${data}</b>.`);
  }
}

// Varredura de rua: Acha todo chamado numa localidade 
function buscarPorEndereco(chatId, termo) {
  const dados = sh(CONFIG.BASE).getDataRange().getValues();
  const termoLimpo = termo.toLowerCase();
  const resultados = dados.slice(1).filter(r => String(r[7]).toLowerCase().includes(termoLimpo));

  if (resultados.length === 0) return enviarTelegram(chatId, `📭 Nenhuma ocorrência na rua "<b>${termo}</b>".`);

  let msg = `📍 <b>BUSCA POR ENDEREÇO</b>\n<i>Termo: "${termo}" (${resultados.length} encontrado(s))</i>\n\n`;
  resultados.forEach(r => {
    const statusEmoji = String(r[3]).includes('Atendido') ? '✅' : '⏳';
    msg += `${statusEmoji} 📄 <b>${r[1]}</b> (${formatar.data(r[2])})\n↳ ${r[7]}, nº ${r[8]} - ${r[9]}\n↳ Status: <code>${r[3]}</code>\n\n`;
  });
  if (resultados.length > 5) msg += `<i>⚠️ Muitos resultados. Tente ser mais específico.</i>`;
  enviarTelegram(chatId, msg);
}

// Intervenção da Coordenação: Troca a "coluna M (equipe)" sem abrir a planilha
function transferirChamadoSetor(chatId, num, data, destinoSigla) {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  const idProcurado = formatar.id(num, data);
  const chamado = dados.find(r => String(r[0]) === idProcurado);

  if (!chamado) return enviarTelegram(chatId, `❌ Chamado <b>${num}</b> de <b>${data}</b> não encontrado.`);

  const novoChatId = (destinoSigla === 'op') ? CONFIG.TELEGRAM.CHATS.NEW_OPERACIONAL : CONFIG.TELEGRAM.CHATS.NEW_TECNICA;
  const nomeSetor = (destinoSigla === 'op') ? '📦 OPERACIONAL' : '📐 TÉCNICA';

  let msg = `🔄 <b>CHAMADO TRANSFERIDO PARA ESTE SETOR</b>\n──────────────────\n`;
  msg += `🆔 <b>Nº:</b> ${chamado[1]}  |  📅 <b>Data:</b> ${formatar.data(chamado[2])}\n`;
  msg += `🚩 <b>Tipologia:</b> ${chamado[4]}\n📍 <b>Local:</b> ${chamado[7]}, ${chamado[8]} - ${chamado[9]}\n`;
  msg += `📞 <b>Solicitante:</b> ${chamado[10]} (${chamado[11]})\n──────────────────\n⚠️ <i>Motivo: Reclassificado.</i>`;

  enviarTelegram(novoChatId, msg);
  enviarTelegram(chatId, `✅ Chamado <b>${num}</b> transferido para <b>${nomeSetor}</b>.`);
  
  // Atualiza também na Base Master para evitar furos no relatório 
  const index = dados.findIndex(r => String(r[0]) === idProcurado);
  if (index !== -1) sheetBase.getRange(index + 1, 13).setValue(nomeSetor);
}

// Edição Remota: Transforma texto do Bot em uma alteração real em Coluna (Status, Relato, Equipe)
function editarChamadoNaBase(chatId, num, data, campo, novoValor) {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  const idProcurado = formatar.id(num, data);
  
  // Puxa a posição matemática exata no Array
  const index = dados.findIndex(linha => String(linha[0]) === idProcurado);

  if (index !== -1) {
    const linhaReal = index + 1; // +1 Pois o índice do array começa do 0, e a Planilha da linha 1
    let coluna = 0, campoNome = '';
    const campoLimpo = campo.toLowerCase().trim();
    
    // Tradutor: Transforma a palavra do Bot no Índice da Coluna da Planilha
    if (campoLimpo === 'status') { coluna = 4; campoNome = 'Status Atual'; }
    else if (campoLimpo === 'relato') { coluna = 15; campoNome = 'Relato de Campo'; }
    else if (campoLimpo === 'equipe' || campoLimpo === 'equipa') { coluna = 13; campoNome = 'Equipe'; }
    else return enviarTelegram(chatId, `❌ Campo "<b>${campo}</b>" inválido. Use: status, relato, equipe.`);

    sheetBase.getRange(linhaReal, coluna).setValue(novoValor);
    sheetBase.getRange(linhaReal, 23).setValue(new Date());

    enviarTelegram(chatId, `✅ <b>CHAMADO ATUALIZADO!</b>\n📄 <b>Nº:</b> ${num}\n✏️ <b>${campoNome}:</b> <i>${novoValor}</i>`);
    
    // Alarme Automático: Se na rua botarem como Atendido, o Bot solta foguetes no chat Operacional
    if (campoLimpo === 'status' && novoValor.toLowerCase().includes('atendido')) {
       enviarTelegram(CONFIG.TELEGRAM.CHATS.CAMPO, `✅ <b>CHAMADO FINALIZADO!</b>\n📄 Nº ${num} de ${data} acaba de ser baixado pela equipe via sistema.`);
    }

    // Fecha o ciclo regerando o compilado da data específica modificada
    msg_Consolidar(data);
  } else {
    enviarTelegram(chatId, `❌ Chamado <b>${num}</b> de <b>${data}</b> não encontrado.`);
  }
}

/************************************************************
 * 10. FUNÇÃO CENTRAL DE ENVIO PARA O TELEGRAM
 * O coração do tráfego. Todas as funções morrem aqui enviando dados à API.
 ************************************************************/
function enviarTelegram(chatId, mensagem) {
  if (!chatId || chatId === '-ocultar') return; // Trava de segurança para não explodir erro 400 se faltar ID
  
  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM.TOKEN}/sendMessage`;
  
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ 
      chat_id: chatId, 
      text: mensagem, 
      parse_mode: 'HTML', 
      disable_web_page_preview: true 
    }),
    muteHttpExceptions: true
  });
}