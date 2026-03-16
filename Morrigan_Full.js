/************************************************************
 * 1. CONFIGURAÇÕES E UTILITÁRIOS (atualizado em: 16/03/2026 - 10:10)
 ************************************************************/
const CONFIG = {
  ABERTURA: 'abertura_de_chamado', 
  CAMPO: 'relatorio_em_campo',      
  BASE: 'BASE_CONSOLIDADA',
  STATUS_PADRAO: 'Aguardando atendimento',
  TELEGRAM: {
    TOKEN: '8237808044:AAHJf09271f0oPL88_nFXCmoWRqdu6TIxHU',
    CHATS: {
      ABERTURA: '-1003862323760',
      CAMPO: '-1003815316144',
      COMPILADO: '-1003797472370'
    }
  }
};

const sh = (nome) => SpreadsheetApp.getActive().getSheetByName(nome);

const formatar = {
  // Recebe "13/03/2026 16:17:00" -> Devolve "13/03/2026"
  data: (v) => {
    if (!v) return 'Não informado';
    let s = String(v);
    // Se tem espaço, a data é o que vem antes do espaço
    return s.includes(' ') ? s.split(' ')[0] : s;
  },

  // Recebe "13/03/2026 16:17:00" -> Devolve "16:17"
  hora: (v) => {
    if (!v) return '00:00';
    let s = String(v);
    // Pega a parte após o espaço (16:17:00)
    let parteHora = s.includes(' ') ? s.split(' ')[1] : s;
    // Corta os segundos (pega só os dois primeiros blocos)
    let blocos = parteHora.split(':');
    return blocos.length >= 2 ? `${blocos[0].padStart(2, '0')}:${blocos[1].padStart(2, '0')}` : parteHora;
  },

  // ID único para a BASE_CONSOLIDADA
  id: (n, d) => {
    // Garante que a data esteja no formato YYYYMMDD para o ID
    let dataLimpa = String(d).split(' ')[0].split('/'); // Pega [13, 03, 2026]
    let dataIso = dataLimpa.length === 3 ? dataLimpa[2] + dataLimpa[1] + dataLimpa[0] : '00000000';
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
}

/************************************************************
 * 3. MENSAGEM DE ABERTURA (O seu código de design) | (atualizado em: 16/03/2026 - 10:10)
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
 * 4. MENSAGEM DE CAMPO (Atendimento encerrado) | (atualizado em: 16/03/2026 - 10:10)
 ************************************************************/
function notificarCampo(v) {
  const get = (campo) => v[campo] ? v[campo][0].trim() : '';

  // --- TRATAMENTOS DE DADOS ---
  const numRaw = get('numero_do_endereco_confirmado');
  const numFinal = (numRaw === '00' || numRaw === '') ? 'S/N' : numRaw;
    // Função interna para tratar o erro da data 1969
  const formatarDataHora = (valor) => {
    if (!valor) return 'Não informado';
    // Se a data vier no formato dd/MM/yyyy, o script pode falhar. 
    // Vamos garantir que o formatar.data e hora recebam um valor limpo.
    return `${formatar.data(valor)} às ${formatar.hora(valor)}`;
  };
// Formatar a equipe para ficar "Nome 1 | Nome 2" ao invés de "Nome 1, Nome 2"
  const equipeLista = get('equipe').replace(/, /g, ' | ');
  const status = get('status_atual');
// --- BLOCO 1: STATUS DA VIA (Só aparece se houver interdição/obstrução) ---
  const statusVia = get('status_da_via'); // Ex: 'Interditada Total' ou 'Obstruída Parcial'
  if (statusVia && statusVia !== 'Liberada') {
    msg += `<blockquote>🚧 <b>VIA: ${statusVia.toUpperCase()}</b>\n`;
    if (get('detalhes_via')) msg += `<i>Nota: ${get('detalhes_via')}</i>\n`;
    msg += `</blockquote>\n`;
  }

  // --- BLOCO 2: VÍTIMAS ---
  const temVitimas = get('ha_vitimas') === 'Sim';
  if (temVitimas) {
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
  const orgaos = get('encaminhamento_orgaos'); // Ex: 'Bombeiros, CEMIG'
  if (orgaos) {
    msg += `<blockquote>🏢 <b>DIRECIONAMENTO:</b>\n`;
    msg += `• Acionado: ${orgaos.replace(/, /g, ' | ')}\n`;
    msg += `</blockquote>\n`;
  }

  let msg = `✅ <b>ATUALIZAÇÃO DE OCORRÊNCIA</b>\n\n`;
  msg += `<b>📄 CHAMADO ${get('numero_do_chamado')}</b>\n`;
  msg += `📅 <b>Data:</b> ${get('data_do_chamado')}\n`;
  msg += `📍 <b>Endereço:</b> ${get('logradouro_confirmado')}, nº ${numFinal} - ${get('bairro_confirmado')}\n`;
  msg += `👷 <b>Equipe:</b> ${equipeLista}\n\n`;

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
 * 5. CONSOLIDAÇÃO (Gravar na Planilha BASE_CONSOLIDADA) | (atualizado em: 16/03/2026 - 10:10)
 ************************************************************/
function consolidarChamados() {
  const sheetBase = sh(CONFIG.BASE);
  if (!sheetBase.getLastRow()) {
    sheetBase.appendRow(['ID_UNICO','Nº Chamado','Data Abertura','Status Atual','Tipologia','Subtipo','Origem','Logradouro','Nº','Bairro','Solicitante','Telefone','Equipe Atendimento','Data/Hora Atend.','Situação Campo','Agendamento','Obs/Relato','Última Atualização', 'Relato de Campo']);
  }

  const dataBase = sheetBase.getDataRange().getValues();
  const mapaBase = new Map();
  dataBase.forEach((linha, index) => { if(index > 0 && linha[0]) mapaBase.set(String(linha[0]), index + 1); });

  // Abertura
  const dadosAb = sh(CONFIG.ABERTURA).getDataRange().getValues();
  const novas = [];
  for (let i = 1; i < dadosAb.length; i++) {
    const id = formatar.id(dadosAb[i][2], dadosAb[i][3]);
    if (id && !mapaBase.has(id)) {
      const subtipo = dadosAb[i].slice(17, 24).find(v => v) || 'Não informado';
      novas.push([id, dadosAb[i][2], formatar.data(dadosAb[i][3]), CONFIG.STATUS_PADRAO, dadosAb[i][15], subtipo, dadosAb[i][6], dadosAb[i][7], dadosAb[i][8], dadosAb[i][10], dadosAb[i][12], dadosAb[i][13], '', '', '', '', dadosAb[i][16], new Date(), '']);
      mapaBase.set(id, -1);
    }
  }
  if (novas.length) sheetBase.getRange(sheetBase.getLastRow() + 1, 1, novas.length, novas[0].length).setValues(novas);

  // Campo (Usa a Data da Abertura que está na Coluna D do Form de Campo)
  const dadosCp = sh(CONFIG.CAMPO).getDataRange().getValues();
  sheetBase.getDataRange().getValues().forEach((l, i) => { if(i>0) mapaBase.set(String(l[0]), i+1); });
  for (let i = 1; i < dadosCp.length; i++) {
    const id = formatar.id(dadosCp[i][2], dadosCp[i][3]);
    const linha = mapaBase.get(id);
    if (linha && linha !== -1) {
      sheetBase.getRange(linha, 4).setValue(dadosCp[i][14]);  // Status
      sheetBase.getRange(linha, 13).setValue(dadosCp[i][5]);  // Equipe
      sheetBase.getRange(linha, 14).setValue(dadosCp[i][4]);  // Data Atend Real
      sheetBase.getRange(linha, 19).setValue(dadosCp[i][6]);  // Relato de Campo
      sheetBase.getRange(linha, 18).setValue(new Date());
    }
  }
}

/************************************************************
 * 6. FUNÇÕES COMPLEMENTARES (TIME-DRIVEN) | (atualizado em: 16/03/2026 - 10:10)
 ************************************************************/
function enviarCompiladoPeriodico() {
  const dados = sh(CONFIG.BASE).getDataRange().getValues();
  let msg = `📊 <b>RESUMO OCORRÊNCIAS DO DIA</b>\n\n`;
  const recentes = dados.slice(1).reverse().slice(0, 8); 

  recentes.forEach(r => {
    msg += `📄 <b>${r[1]}</b> (${r[2]}) - <code>${r[3]}</code>\n`;
    msg += `🧭 ${r[4]} | 📍 ${r[9]}\n`;
    msg += `──────────────────\n`;
  });
  enviarTelegram(CONFIG.TELEGRAM.CHATS.COMPILADO, msg);
}

function relatorioAgendadosHoje() {
  const dados = sh(CONFIG.BASE).getDataRange().getValues();
  const hoje = formatar.data(new Date());
  let msg = `📅 <b>AGENDADOS PARA HOJE (${hoje})</b>\n\n`;
  let encontrou = false;

  dados.slice(1).forEach(r => {
    if (formatar.data(r[15]) === hoje) { // Coluna P
      encontrou = true;
      msg += `🔔 <b>Chamado ${r[1]}</b>\n🧭 ${r[4]} | 📍 ${r[9]}\n\n`;
    }
  });
  if (!encontrou) msg = `✅ <b>Não há agendados para hoje, ${hoje}.</b>`;
  enviarTelegram(CONFIG.TELEGRAM.CHATS.ABERTURA, msg);
}

function enviarTelegram(chatId, mensagem) {
  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM.TOKEN}/sendMessage`;
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: mensagem, parse_mode: 'HTML' }),
    muteHttpExceptions: true
  });
}