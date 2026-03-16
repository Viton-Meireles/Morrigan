/************************************************************
 * CONFIGURAÇÕES GERAIS - Ajuste os nomes aqui!
 ************************************************************/
const CONFIG = {
  ABERTURA: 'abertura_de_chamado', // Nome da aba que recebe o Form 1
  CAMPO: 'relatorio_em_campo',      // Nome da aba que recebe o Form 2
  BASE: 'BASE_CONSOLIDADA',
  STATUS_PADRAO: 'Aguardando atendimento',
  TELEGRAM: {
    TOKEN: '8237808044:AAHJf09271f0oPL88_nFXCmoWRqdu6TIxHU',
    CHATS: {
      ABERTURA: '-1003862323760',
      CAMPO: '-1003815316144'
    }
  }
};

const sh = (nome) => SpreadsheetApp.getActive().getSheetByName(nome);

const formatar = {
  data: (v) => v ? Utilities.formatDate(new Date(v), Session.getScriptTimeZone(), 'dd/MM/yyyy') : '',
  hora: (v) => v ? Utilities.formatDate(new Date(v), Session.getScriptTimeZone(), 'HH:mm') : '',
  id: (n, d) => `${n}_${Utilities.formatDate(new Date(d), Session.getScriptTimeZone(), 'yyyyMMdd')}`
};

/************************************************************
 * ROTEADOR (O que o Acionador chama)
 ************************************************************/
function rotearFormulario(e) {
  const nomeAba = e.range.getSheet().getName();
  
function consolidarChamados() {
  const sheetBase = sh(CONFIG.BASE);
  
  // 1. Garante o cabeçalho (Coluna S é o Relato de Campo)
  if (!sheetBase.getLastRow()) {
    sheetBase.appendRow(['ID_UNICO','Nº Chamado','Data Abertura','Status Atual','Tipologia','Subtipo','Origem','Logradouro','Nº','Bairro','Solicitante','Telefone','Equipe Atendimento','Data/Hora Atend.','Situação Campo','Agendamento','Obs/Relato','Última Atualização', 'Relato de Campo']);
  }

  const dataBase = sheetBase.getDataRange().getValues();
  const mapaBase = new Map();
  dataBase.forEach((linha, index) => { 
    if(index > 0 && linha[0]) mapaBase.set(String(linha[0]), index + 1); 
  });

  // --- 2. PROCESSAR ABERTURAS (Planilha: abertura_de_chamado) ---
  const dadosAbertura = sh(CONFIG.ABERTURA).getDataRange().getValues();
  const novasLinhas = [];

  for (let i = 1; i < dadosAbertura.length; i++) {
    const r = dadosAbertura[i];
    const id = formatar.id(r[2], r[3]); // ID usando Coluna C e D

    if (id && !mapaBase.has(id)) {
      const subtipo = r.slice(17, 24).find(v => v) || 'Não informado';
      const novaFila = [
        id, r[2], formatar.data(r[3]), r[5], r[15], subtipo,
        r[6], r[7], r[8], r[10], r[12], r[13],
        '', '', '', '', r[16], new Date(), ''
      ];
      novasLinhas.push(novaFila);
      mapaBase.set(id, -1);
    }
  }

  if (novasLinhas.length > 0) {
    sheetBase.getRange(sheetBase.getLastRow() + 1, 1, novasLinhas.length, novasLinhas[0].length).setValues(novasLinhas);
  }

  // --- 3. PROCESSAR RELATÓRIOS (Planilha: relatorio_em_campo) ---
  const dadosCampo = sh(CONFIG.CAMPO).getDataRange().getValues();
  const mapaAtualizado = new Map();
  sheetBase.getDataRange().getValues().forEach((linha, index) => { 
    if(index > 0 && linha[0]) mapaAtualizado.set(String(linha[0]), index + 1); 
  });

  for (let i = 1; i < dadosCampo.length; i++) {
    const c = dadosCampo[i];
    const idCampo = formatar.id(c[2], c[3]); // Agora busca o ID usando a Data da Abertura (Col D)
    const linhaNaBase = mapaAtualizado.get(idCampo);

    if (linhaNaBase && linhaNaBase !== -1) {
      // ATENÇÃO AOS NOVOS ÍNDICES DO CAMPO:
      // Status agora está na Coluna O (índice 14)
      sheetBase.getRange(linhaNaBase, 4).setValue(c[14]);  
      
      // Equipe está na Coluna F (índice 5)
      sheetBase.getRange(linhaNaBase, 13).setValue(c[5]);  
      
      // Data/Hora do Atendimento Real está na Coluna E (índice 4)
      sheetBase.getRange(linhaNaBase, 14).setValue(c[4]);  
      
      // Relato de Campo está na Coluna G (índice 6)
      sheetBase.getRange(linhaNaBase, 19).setValue(c[6]);  
      
      sheetBase.getRange(linhaNaBase, 18).setValue(new Date()); // Última atualização
    }
  }
}
  // 2. Dispara a notificação correta
  if (nomeAba === CONFIG.ABERTURA) {
    notificarAbertura(e.namedValues);
  } else if (nomeAba === CONFIG.CAMPO) {
    notificarCampo(e.namedValues);
  }
}

/************************************************************
 * NOTIFICAÇÃO DE ABERTURA (Seu código otimizado)
 ************************************************************/
function notificarAbertura(v) {
  const get = (campo) => v[campo] ? v[campo][0].trim() : '';

  // Regras de negócio que você criou
  const numEndRaw = get('numero_do_endereco');
  const numeroEndereco = (numEndRaw === '00' || numEndRaw === '') ? 'S/N' : numEndRaw;
  const pontoRef = get('ponto_de_referencia') || 'Não informado';
  const telefone = (get('telefone_de_contato') === '00' || get('telefone_de_contato') === '') ? 'Não informado' : get('telefone_de_contato');
  const cpf = (get('CPF_do_solicitante') === '00' || get('CPF_do_solicitante') === '') ? 'Não informado' : get('CPF_do_solicitante');
  const complemento = get('complemento');

  // Subtipos
  const camposSubtipos = ['subtipo_arboreo', 'subtipo_acidente_viario', 'subtipo_estrutural', 'subtipo_geologico', 'subtipo_hidrologico', 'subtipo_incendio'];
  const subtipoSelecionado = camposSubtipos.map(c => get(c)).find(valor => valor !== '') || 'Não informado';

  let msg = `🚨 <b>NOVO CHAMADO</b> 🚨\n\n`;
  msg += `<b>📄 CHAMADO ${get('numero_do_chamado')}</b>\n`;
  msg += `📅 <b>Data:</b> ${get('data_do_chamado')}\n`;
  msg += `⏰ <b>Abertura:</b> ${get('hora_do_chamado')}\n\n`;
  msg += `<b>Situação atual:</b> ${get('situacao_atual')}\n`;
  msg += `<b>Origem:</b> ${get('origem_do_chamado') || 'Não informado'}\n`;
  msg += `🧭 <b>Tipologia:</b> ${get('tipologia_inicial')}\n`;
  msg += `↳ <b>Subtipo:</b> ${subtipoSelecionado}\n`;

  if (get('local_da_arvore')) msg += `<b>Local:</b> ${get('local_da_arvore')}\n`;

  msg += `\n👤 <b>Solicitante:</b> ${get('nome_do_solicitante') || 'Não informado'}\n`;
  msg += `📞 <b>Telefone:</b> ${telefone}\n`;
  msg += `🆔 <b>CPF:</b> ${cpf}\n\n`;

  msg += `📍 ${get('logradouro')}, nº ${numeroEndereco}`;
  if (complemento) msg += ` – ${complemento}`;
  msg += ` – ${get('bairro')}\n`;
  msg += `↳ <b>Ref:</b> ${pontoRef}\n\n`;
  
  if (get('descricao_observacoes')) msg += `📝 <b>Obs:</b> ${get('descricao_observacoes')}`;

  enviarTelegram(CONFIG.TELEGRAM.CHATS.ABERTURA, msg);
}

/************************************************************
 * NOTIFICAÇÃO DE CAMPO
 ************************************************************/
function notificarCampo(v) {
  const get = (campo) => v[campo] ? v[campo][0].trim() : '';

// 1. Pegamos o valor bruto e já fazemos a troca para S/N se for '00' ou vazio
const numRaw = get('numero_do_endereco_confirmado');
const numFinal = (numRaw === '00' || numRaw === '') ? 'S/N' : numRaw;

// Pega o valor bruto do formulário (Ex: 2026-03-09 15:30:00)
const dataHoraBruto = get('data_hora_atendimento');
// Formata a data (DD/MM/YYYY) e a hora (HH:mm) separadamente
const dataFormatada = formatar.data(dataHoraBruto);
const horaFormatada = formatar.hora(dataHoraBruto);
// Pegamos o valor da equipe e trocamos a vírgula pelo "pipe"
const equipeFormatada = get('equipe').replace(/, /g, ' | ');

// Mensagem formatada para o Telegram
  let msg = `✅ <b>OCORRÊNCIA ATENDIDA</b>\n\n`;

  msg += `<b>📄 Chamado ${get('Número do Chamado')}</b>\n`;
  msg += `📅 <b>Data:</b> ${get('data_do_chamado')}\n`;
  msg += `⏰ <b>Atendimento:</b> ${dataFormatada} às ${horaFormatada}\n`;
  msg += `👷 <b>Equipe:</b> ${equipeFormatada}\n\n`;
    
  msg += `📍 ${get('logradouro_confirmado')}, nº ${numFinal} - ${get('bairro_confirmado')}\n`;
  msg += `🧭 <b>Tipologia confirmada:</b> ${get('tipologia_confirmada')}\n`;
  msg += `📝 <b>Relato:</b> ${get('resumo_de_campo')}\n\n`;

  enviarTelegram(CONFIG.TELEGRAM.CHATS.CAMPO, msg);
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

// Nota: A função consolidarChamados() deve permanecer como estava, 
// apenas verifique se os índices r[index] batem com as novas colunas.