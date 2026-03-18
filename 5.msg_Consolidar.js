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