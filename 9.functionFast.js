/************************************************************
 * 9. FAST_INFO - MENSAGEM RÁPIDA PARA TELEGRAM
 * manda um alerta visualmente "gritante" para que todos saibam que a fluidez da cidade mudou;
 ************************************************************/

function notificarStatusVia(v) {
  const get = (campo) => v[campo] ? v[campo][0].trim() : '';
  
  const status = get('Status da Via');
  const fuso = Session.getScriptTimeZone();
  const hora = Utilities.formatDate(new Date(), fuso, 'HH:mm');

  // Define o emoji de cabeçalho baseado no status
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

  msg += `\n──────────────────\n`;
  msg += `🕒 <i>Informado às ${hora}</i>`;

  // Envia para o INFO_FAST (Gestão) e ENTRADA (Operacional)
  enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, msg);
  enviarTelegram(CONFIG.TELEGRAM.CHATS.ENTRADA, msg);
}

/************************************************************
 * 9.1. FAST_INFO - MENSAGEM RÁPIDA PARA TELEGRAM
 * manda um alerta visualmente "gritante" para que todos saibam que a fluidez da cidade mudou;
 ************************************************************/
function msg_InfoFast() {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  if (dados.length <= 1) return;

  const fuso = Session.getScriptTimeZone();
  const hoje = Utilities.formatDate(new Date(), fuso, 'dd/MM/yyyy');
  
  // 9.1.A Filtrar chamados do dia
  const chamadosHoje = dados.slice(1).filter(r => formatar.data(r[2]) === hoje);
  
  // 9.2.B Separar os Pendentes (Status que NÃO contém "Atendido" ou "Cancelado")
  const pendentes = chamadosHoje.filter(r => {
    const status = String(r[3]).toLowerCase();
    return !status.includes('atendido') && !status.includes('cancelado');
  });

  // 9.3.C Contadores rápidos
  const total = chamadosHoje.length;
  const qtdPendentes = pendentes.length;
  const atendidos = total - qtdPendentes;

  // 9.4.D Montar a lista detalhada de pendentes
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

  // 9.5.E Montar a Mensagem Final
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