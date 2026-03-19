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