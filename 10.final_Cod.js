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