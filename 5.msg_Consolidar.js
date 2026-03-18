/************************************************************
 * 5. consolidarChamados (PARTE 1: Gravar na BASE MASTER)
 ************************************************************/

function consolidarChamados() {
  const sheetBase = sh(CONFIG.BASE);
  
  // 1. Criar Cabeçalho se estiver vazio (23 colunas - A até W)
  if (!sheetBase.getLastRow()) {
    sheetBase.appendRow([
      'ID_UNICO', 'Nº Chamado', 'Data Abertura', 'Status Atual', 'Tipologia', 'Subtipo', 
      'Origem', 'Logradouro', 'Nº', 'Bairro', 'Solicitante', 'Telefone', 
      'Equipe', 'Data Atend.', 'Relato de Campo', 'Agendamento', 'Turno', 
      'Motivo Agend/Canc', 'Doação', 'Itens Doados', 'Notificado', 'Órgãos Acionados', 'Última Atualização'
    ]);
  }

  const dataBase = sheetBase.getDataRange().getValues();
  const mapaBase = new Map();
  dataBase.forEach((l, i) => { if (i > 0 && l[0]) mapaBase.set(String(l[0]), i + 1); });

  // --- PARTE A: PROCESSAR ABERTURAS (Planilha Abertura A-Y) ---
  const dAb = sh(CONFIG.ABERTURA).getDataRange().getValues();
  const novas = [];
  for (let i = 1; i < dAb.length; i++) {
    const id = formatar.id(dAb[i][2], dAb[i][3]);
    if (id && !mapaBase.has(id)) {
      // Subtipos estão entre as colunas R(17) e Y(24)
      const subtipo = dAb[i].slice(17, 25).find(v => v) || 'Não informado';
      
      // Linha inicial da abertura (23 colunas para bater com o cabeçalho)
      novas.push([
        id, dAb[i][2], formatar.data(dAb[i][3]), dAb[i][5], dAb[i][15], subtipo,
        dAb[i][6], dAb[i][7], dAb[i][8], dAb[i][10], dAb[i][12], dAb[i][13],
        '', '', '', '', '', '', '', '', '', '', new Date()
      ]);
      mapaBase.set(id, -1);
    }
  }
  if (novas.length) sheetBase.getRange(sheetBase.getLastRow()+1, 1, novas.length, novas[0].length).setValues(novas);

  // --- PARTE B: ATUALIZAR COM DADOS DE CAMPO (Mapeamento Campo A-AA) ---
  const dCp = sh(CONFIG.CAMPO).getDataRange().getValues();
  // Recarregar o mapa para incluir os novos registros da Parte A
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
    }
  }
}

/************************************************************
 * 5.1. msg_Consolidar (PARTE 2: Enviar Mensagem Consolidada)
 * Painel de Controle Vivo (Novos + Agendados + Alertas)
 ************************************************************/

function msg_Consolidar() {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  if (dados.length <= 1) return;

  const hoje = formatar.data(new Date());
  const agora = `${hoje} às ${formatar.hora(new Date())}`;

  // 5.1. FILTRAGEM: Ocorrências de Hoje OU Agendadas para Hoje
  const chamadosDoDia = dados.slice(1).filter(r => {
    const dataAbertura = r[2]; // Coluna C (Índice 2)
    const dataAgendada = formatar.data(r[15]); // Coluna P (Índice 15)
    return (dataAbertura === hoje || dataAgendada === hoje);
  });

  // 5.2. ESTATÍSTICAS
  const total = chamadosDoDia.length;
  const atendidos = chamadosDoDia.filter(r => String(r[3]).includes('Atendido')).length;
  const cancelados = chamadosDoDia.filter(r => String(r[3]).includes('Cancelado')).length;
  const agendados = chamadosDoDia.filter(r => String(r[3]).includes('Agendado')).length;
  const pendentes = total - atendidos - cancelados - agendados;

  // 5.3 MAPA DE ÍCONES E AGRUPAMENTO
  const icones = {
    'Arbóreo': '🌳',
    'Acidente viário': '🚧',
    'Estrutural': '🏚️',
    'Geológico': '⛰️',
    'Hidrológico': '🌊',
    'Incêndio': '🔥',
    'Entrega de doação': '🎁'
  };

  const grupos = {};
  chamadosDoDia.forEach(r => {
    const tipologiaBruta = r[4] || 'Outros'; // Coluna E (Tipologia)
    const nomeLimpo = tipologiaBruta.replace(/[^\w\sÀ-ú]/g, '').trim();
    if (!grupos[nomeLimpo]) grupos[nomeLimpo] = [];
    grupos[nomeLimpo].push(r);
  });

  // 5.4 CABEÇALHO DA MENSAGEM
  let msg = `📊 <b>COMPILADO DE CHAMADOS</b>\n`;
  msg += `<i>Atualizado em: ${agora}</i>\n\n`;
  
  msg += `<b>Demandas de Hoje:</b> ${total}\n`;
  msg += `✅ Atendidos: ${atendidos}\n`;
  msg += `⏳ Pendentes: ${pendentes}\n`;
  if (agendados > 0) msg += `🕒 Agendados: ${agendados}\n`;
  if (cancelados > 0) msg += `❌ Cancelados: ${cancelados}\n`;
  msg += `──────────────────\n\n`;

  // 5.5 CORPO POR CATEGORIA
  for (const categoria in grupos) {
    const emoji = icones[categoria] || '📋';
    msg += `${emoji} <b>| ${categoria.toUpperCase()}</b>\n`;
    
    grupos[categoria].forEach(r => {
      // Define emoji de status
      let statusEmoji = '⏳';
      const statusTxt = String(r[3]);
      if (statusTxt.includes('Atendido')) statusEmoji = '✅';
      if (statusTxt.includes('Cancelado')) statusEmoji = '❌';
      if (statusTxt.includes('Agendado')) statusEmoji = '🕒';

      // Informações base (Nº do Chamado e Bairro)
      const chamadoNum = r[1]; // Coluna B
      const bairro = r[9] || 'S/N'; // Coluna J (Bairro Confirmado/Inicial)
      const infoData = r[2] !== hoje ? ` <i>(Agendado)</i>` : '';

      msg += `↳ ${statusEmoji} 📄 <b>${chamadoNum}</b> - ${bairro}${infoData}\n`;
      
      // ALERTAS DINÂMICOS: Lê as colunas S (18), U (20) e V (21)
      let alertas = [];
      if (String(r[18]).toLowerCase().includes('sim')) alertas.push('📦 Doação');
      if (r[20] && String(r[20]).trim() !== '') alertas.push('📝 Notificado');
      if (r[21] && String(r[21]).trim() !== '') alertas.push('🏢 Órgão Acionado');
      
      // Só cria a linha de alerta se algo foi registrado
      if (alertas.length > 0) {
        msg += `   <i>↳ ${alertas.join(' | ')}</i>\n`;
      }
    });
    msg += `\n`;
  }

  // 5.6 TRATAMENTO CASO NÃO HAJA MOVIMENTO NO DIA
  if (total === 0) {
    msg = `📊 <b>COMPILADO DE CHAMADOS</b>\n\n` +
          `‼️ <b>Não há demandas registradas ou agendadas para hoje.</b>\n` +
          `📅 <i>${hoje}</i>`;
  }

  enviarTelegram(CONFIG.TELEGRAM.CHATS.COMPILADO, msg);
}