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

  // Localiza a linha de HOJE
  for (let i = 1; i < dados.length; i++) {
    if (formatar.data(dados[i][0]) === hojeStr) {
      escalaHoje = dados[i];
      break;
    }
  }

  if (!escalaHoje) return;

  const tecnico1 = escalaHoje[2];
  const tecnico2 = escalaHoje[3];
  const operacional1 = escalaHoje[4];
  const operacional2 = escalaHoje[5];
  const setor1 = escalaHoje[6];
  const setor2 = escalaHoje[7];

  let msg = `📅 <b>ESCALA DE PLANTÃO - ${hojeStr}</b>\n`;
  msg += `<i>(${origem === "EDIT" ? "🔄 Atualização de Escala" : "📢 Informativo Matinal"})</i>\n`;
  msg += `──────────────────\n\n`;

  msg += `👤 <b>TÉCNICO(S):</b>\n↳ ${tecnico1}${tecnico2 ? ` / ${tecnico2}` : ''}\n\n`;
  msg += `👷 <b>OPERACIONAL:</b>\n↳ ${operacional1}${operacional2 ? ` / ${operacional2}` : ''}\n\n`;
  msg += `🏢 <b>SETOR / ENTRADA:</b>\n↳ ${setor1}${setor2 ? ` / ${setor2}` : ''}\n`;
  msg += `──────────────────`;

  // Mestre Viton, aqui você escolhe: ENTRADA, INFO_FAST ou COMPILADO.
  // Vou colocar no INFO_FAST para o pessoal da gestão ver primeiro.
  enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, msg);
}

/**
 * 7.1 GATILHO DE EDIÇÃO (Trigger Instalável)
 * Em vez de enviar na hora, ele agenda o envio para daqui a 2 minutos.
 */
function gatilhoEdicaoEscala(e) {
  const range = e.range;
  const sheetName = range.getSheet().getName();

  if (sheetName === 'Escala_diaria_2026') {
    // 7.1.1 Apaga qualquer agendamento de escala que já esteja "na fila"
    const gatilhos = ScriptApp.getProjectTriggers();
    gatilhos.forEach(t => {
      if (t.getHandlerFunction() === 'processarEnvioEscalaAgendado') {
        ScriptApp.deleteTrigger(t);
      }
    });

    // 7.1.2 Cria um novo agendamento para daqui a 2 minutos (120.000 milissegundos)
    ScriptApp.newTrigger('processarEnvioEscalaAgendado')
             .timeBased()
             .after(2 * 60 * 1000) 
             .create();
             
    console.log("⏱️ Edição detectada. Envio da escala agendado para daqui a 2 min.");
  }
}

/**
 * 7.2 Função auxiliar que o cronômetro vai chamar de fato.
 */
function processarEnvioEscalaAgendado() {
  msg_EnviarEscala("EDIT");
  
  // Limpeza de segurança: apaga o próprio gatilho após rodar para não acumular
  const gatilhos = ScriptApp.getProjectTriggers();
  gatilhos.forEach(t => {
    if (t.getHandlerFunction() === 'processarEnvioEscalaAgendado') {
      ScriptApp.deleteTrigger(t);
    }
  });
}