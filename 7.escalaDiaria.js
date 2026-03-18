/************************************************************
 * 7. GESTÃO DE ESCALA DIÁRIA
 * Lê a planilha de escala e informa a equipe de plantão
 ************************************************************/

function msg_EnviarEscala(origem = "AUTOMÁTICO") {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetEscala = ss.getSheetByName('Escala_diaria_2026');
  if (!sheetEscala) return;

  const dados = sheetEscala.getDataRange().getValues();
  const hojeStr = formatar.data(new Date());
  
  let escalaHoje = null;

  // 7.1 Localiza a linha de HOJE na planilha de escala
  for (let i = 1; i < dados.length; i++) {
    if (formatar.data(dados[i][0]) === hojeStr) {
      escalaHoje = dados[i];
      break;
    }
  }

  if (!escalaHoje) {
    if (origem !== "AUTOMÁTICO") {
      enviarTelegram(CONFIG.TELEGRAM.CHATS.ABERTURA, `⚠️ <b>Atenção:</b> Escala para hoje (${hojeStr}) não encontrada.`);
    }
    return;
  }

  // 7.2 Mapeamento das Colunas (A=0, B=1, C=2...)
  const tecnico1 = escalaHoje[2];
  const tecnico2 = escalaHoje[3];
  const operacional1 = escalaHoje[4];
  const operacional2 = escalaHoje[5];
  const setor1 = escalaHoje[6];
  const setor2 = escalaHoje[7];

  // 7.3 Montagem da Mensagem Dinâmica (Só mostra o que estiver preenchido)
  let msg = `📅 <b>ESCALA DE PLANTÃO - ${hojeStr}</b>\n`;
  msg += `<i>(${origem === "EDIT" ? "🔄 Atualização de Escala" : "📢 Informativo Matinal"})</i>\n`;
  msg += `──────────────────\n\n`;

  msg += `👤 <b>TÉCNICO(S):</b>\n↳ ${tecnico1}${tecnico2 ? ` / ${tecnico2}` : ''}\n\n`;
  
  msg += `👷 <b>OPERACIONAL:</b>\n↳ ${operacional1}${operacional2 ? ` / ${operacional2}` : ''}\n\n`;

  msg += `🏢 <b>SETOR / ENTRADA:</b>\n↳ ${setor1}${setor2 ? ` / ${setor2}` : ''}\n`;
  msg += `──────────────────`;

  enviarTelegram(CONFIG.TELEGRAM.CHATS.ABERTURA, msg);
}

/**
 * GATILHO DE EDIÇÃO (Trigger Instalável)
 * Sempre que alguém mexer na planilha de escala, o bot avisa.
 */
function gatilhoEdicaoEscala(e) {
  const range = e.range;
  const sheetName = range.getSheet().getName();

  // Se a edição foi na aba da escala, dispara a mensagem
  if (sheetName === 'Escala_diaria_2026') {
    msg_EnviarEscala("EDIT");
  }
}