/************************************************************
 * 6. RELATÓRIOS AUTOMÁTICOS (TIME-DRIVEN)
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