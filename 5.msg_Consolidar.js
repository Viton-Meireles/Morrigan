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

  // Usa o Utilities direto para não ter risco de erro na data/hora atual
  const agoraObj = new Date();
  const fuso = Session.getScriptTimeZone();
  const hoje = Utilities.formatDate(agoraObj, fuso, 'dd/MM/yyyy');
  const agora = `${hoje} às ${Utilities.formatDate(agoraObj, fuso, 'HH:mm')}`;

  // 5.2 FILTRAGEM: Ocorrências de Hoje OU Agendadas para Hoje
  const chamadosDoDia = dados.slice(1).filter(r => {
    const dataAbertura = formatar.data(r[2]); // Coluna C
    const dataAgendada = formatar.data(r[15]); // Coluna P
    return (dataAbertura === hoje || dataAgendada === hoje);
  });

  // 5.3 ESTATÍSTICAS
  const total = chamadosDoDia.length;
  const atendidos = chamadosDoDia.filter(r => String(r[3]).includes('Atendido')).length;
  const cancelados = chamadosDoDia.filter(r => String(r[3]).includes('Cancelado')).length;
  const agendados = chamadosDoDia.filter(r => String(r[3]).includes('Agendado')).length;
  const pendentes = total - atendidos - cancelados - agendados;

  // 5.4 MAPA DE ÍCONES E AGRUPAMENTO
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
    const tipologiaBruta = r[4] || 'Outros'; 
    const nomeLimpo = tipologiaBruta.replace(/[^\w\sÀ-ú]/g, '').trim();
    if (!grupos[nomeLimpo]) grupos[nomeLimpo] = [];
    grupos[nomeLimpo].push(r);
  });

  // 5.5 CABEÇALHO DA MENSAGEM
  let msg = `📊 <b>COMPILADO DE CHAMADOS</b>\n`;
  msg += `Última atualização: ${agora}\n\n`;
  
  msg += `<b>TOTAL DE CHAMADOS:</b> ${total}\n`;
  msg += `✅ Atendidos: ${atendidos}\n`;
  msg += `⏳ Pendentes: ${pendentes}\n`;
  msg += `📅 Agendados: ${agendados}\n`;
  msg += `❌ Cancelados: ${cancelados}\n`;
  msg += `──────────────────\n`;

  // 5.6 CORPO POR CATEGORIA E DETALHES DO CHAMADO
  for (const categoria in grupos) {
    const emoji = icones[categoria] || '📋';
    msg += `${emoji} | <b>${categoria.toUpperCase()}:</b>\n\n`;
    
    grupos[categoria].forEach(r => {
      // Mapeamento das colunas da BASE_CONSOLIDADA
      const chamadoNum = r[1]; // Coluna B
      const statusTxt = String(r[3]); // Coluna D
      const logradouro = r[7] || 'Logradouro não informado'; // Coluna H
      const numRaw = String(r[8]); // Coluna I
      const numFinal = (numRaw === '00' || numRaw === '' || numRaw === 'undefined') ? 's/n' : numRaw;
      const bairro = r[9] || 'Bairro não informado'; // Coluna J
      
      // Tratamento seguro do relato (Contra o erro do HTML no Telegram)
      let relatoSeguro = String(r[14] || 'Sem observações.').trim(); // Coluna O
      relatoSeguro = relatoSeguro.replace(/</g, '&lt;').replace(/>/g, '&gt;');

      // Lógica Dinâmica de Status, Tempo e Ação
      let statusEmoji = '⏳';
      let acao = 'Aguardando atendimento em';
      let dataOcorrencia = `${formatar.data(r[2])} às ${formatar.hora(r[2])}`; // Padrão: Abertura

      if (statusTxt.includes('Atendido')) {
        statusEmoji = '✅';
        acao = 'Atendido em';
        if (r[13]) dataOcorrencia = `${formatar.data(r[13])} às ${formatar.hora(r[13])}`; // Usa Data Atend (N)
      } 
      else if (statusTxt.includes('Agendado')) {
        statusEmoji = '📅';
        acao = 'Agendado para';
        if (r[15]) dataOcorrencia = formatar.data(r[15]); // Usa Data Agendamento (P)
      }
      else if (statusTxt.includes('Cancelado')) {
        statusEmoji = '❌';
        acao = 'Cancelado';
      }

      // Montagem do bloco idêntico ao planejado
      msg += `↳ <b>Chamado: ${chamadoNum}</b>\n`;
      msg += `📍 ${logradouro}, ${numFinal} - ${bairro}\n`;
      msg += `🧭 Status: ${statusEmoji} ${statusTxt}\n`;
      msg += `⏰ ${acao} ${dataOcorrencia}\n`;
      msg += `📄 Relato em campo: <i>${relatoSeguro}</i>\n`;
      msg += `──────────────────\n`;
    });
  }

  // 5.7 TRATAMENTO CASO NÃO HAJA MOVIMENTO NO DIA
  if (total === 0) {
    msg = `📊 <b>COMPILADO DE CHAMADOS</b>\n\n` +
          `‼️ <b>Não há demandas registradas ou agendadas para hoje.</b>\n` +
          `📅 <i>${hoje}</i>`;
  }

  enviarTelegram(CONFIG.TELEGRAM.CHATS.COMPILADO, msg);
}