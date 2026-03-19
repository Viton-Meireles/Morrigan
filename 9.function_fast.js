function msg_InfoFast() {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  if (dados.length <= 1) return;

  const fuso = Session.getScriptTimeZone();
  const hoje = Utilities.formatDate(new Date(), fuso, 'dd/MM/yyyy');
  
  // 1. Filtrar chamados do dia
  const chamadosHoje = dados.slice(1).filter(r => formatar.data(r[2]) === hoje);
  
  // 2. Separar os Pendentes (Status que NÃO contém "Atendido" ou "Cancelado")
  const pendentes = chamadosHoje.filter(r => {
    const status = String(r[3]).toLowerCase();
    return !status.includes('atendido') && !status.includes('cancelado');
  });

  // 3. Contadores rápidos
  const total = chamadosHoje.length;
  const qtdPendentes = pendentes.length;
  const atendidos = total - qtdPendentes;

  // 4. Montar a lista detalhada de pendentes
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

  // 5. Montar a Mensagem Final
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