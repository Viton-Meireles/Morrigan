/************************************************************
 * 8. COMANDOS DO BOT (Interação Direta e Inteligente)
 * Basta enviar o comando no chat de algum dos grupos que ele irá enviar a mensagem correspondente.
 ************************************************************/

function doPost(e) {
  try {
    const dados = JSON.parse(e.postData.contents);
    if (!dados.message || !dados.message.text) return;

    const textoBot = dados.message.text.toLowerCase().trim();
    const partes = textoBot.split(' '); // Divide o comando dos argumentos
    const comando = partes[0];
    const chatId = dados.message.chat.id;

    // 8.1 COMANDO: /busca [nº] [data] (Ex: /busca 05 17/03/2026)
    if (comando === '/busca') {
      const num = partes[1];
      const data = partes[2];
      
      if (!num || !data) {
        enviarTelegram(chatId, "⚠️ <b>Erro de Formato</b>\nUse: <code>/busca [nº] [dd/mm/aaaa]</code>\n\n<i>Ex: /busca 05 17/03/2026</i>");
        return;
      }
      buscarPorId(chatId, num, data);
    }

    // 8.2 COMANDO: /endereco [nome da rua] (Ex: /endereco crista de galo)
    else if (comando === '/endereco') {
      const termo = partes.slice(1).join(' '); // Pega tudo após o comando
      if (!termo) {
        enviarTelegram(chatId, "⚠️ Digite o nome da rua. Ex: <code>/endereco crista de galo</code>");
        return;
      }
      buscarPorEndereco(chatId, termo);
    }

    // 8.3 COMANDO: /status (Chama o compilado na hora)
    else if (comando === '/status') {
      msg_Consolidar();
      enviarTelegram(chatId, "📊 <i>Compilado atualizado enviado ao canal.</i>");
    }

    // 8.4 COMANDO: /escala
    else if (comando === '/escala') {
      msg_EnviarEscala("SOLICITAÇÃO");
    }

    // 8.5 COMANDO: /ajuda
    else if (comando === '/ajuda' || comando === '/start') {
      let ajuda = `🤖 <b>ASSISTENTE OPERACIONAL</b>\n\n`;
      ajuda += `🔎 <code>/busca [nº] [data]</code> - Detalhes precisos\n`;
      ajuda += `📍 <code>/endereco [rua]</code> - Busca por local\n`;
      ajuda += `📊 <code>/status</code> - Painel do dia\n`;
      ajuda += `📅 <code>/escala</code> - Equipe de plantão\n`;
      ajuda += `☎️ <code>/contatos</code> - Números úteis`;
      enviarTelegram(chatId, ajuda);
    }

  } catch (err) {
    console.error("Erro no doPost: " + err.message);
  }
}

/************************************************************
 * 8.6 FUNÇÕES DE PESQUISA NA BASE
 ************************************************************/

// Busca por ID Único (Número + Data)
function buscarPorId(chatId, num, data) {
  const idProcurado = formatar.id(num, data);
  const dados = sh(CONFIG.BASE).getDataRange().getValues();
  
  // r[0] é o ID_UNICO na coluna A
  const r = dados.find(linha => String(linha[0]) === idProcurado);

  if (r) {
    // 1. Pega o relato, garante que é texto e remove "espaços fantasmas"
let relatoSeguro = String(r[14] || '').trim();
// 2. Troca os sinais matemáticos por códigos seguros para o Telegram não surtar
relatoSeguro = relatoSeguro.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let msg = `🔍 <b>CHAMADO LOCALIZADO</b>\n`;
    msg += `📄 <b>Nº ${r[1]}</b> (${formatar.data(r[2])})\n`;
    msg += `──────────────────\n`;
    msg += `🧭 <b>Status:</b> ${r[3]}\n`;
    msg += `🧭 <b>Tipologia:</b> ${r[4]} | ${r[5]}\n`;
    msg += `📍 <b>Local:</b> ${r[7]}, ${r[8]} - ${r[9]}\n`;
    msg += `👤 <b>Solicitante:</b> ${r[10]} (${r[11]})\n\n`;
    // 3. Monta a mensagem final com a trava de segurança
msg += `<blockquote>📝 <b>Relato de Campo:</b>\n<i>${relatoSeguro || 'Aguardando atendimento...'}</i></blockquote>\n`;
    msg += `👷 <b>Equipe:</b> ${r[12] || '---'}\n`;
    msg += `📅 <b>Última Atualização:</b> ${formatar.data(r[22])}`;
    
    enviarTelegram(chatId, msg);
  } else {
    enviarTelegram(chatId, `❌ Nenhum chamado encontrado para o Nº <b>${num}</b> na data <b>${data}</b>.`);
  }
}

// Busca por Endereço (Varrer logradouro)
function buscarPorEndereco(chatId, termo) {
  const dados = sh(CONFIG.BASE).getDataRange().getValues();
  const termoLimpo = termo.toLowerCase();
  
  // Filtra chamados que contenham o nome da rua (Coluna H - Índice 7)
  const resultados = dados.slice(1).filter(r => String(r[7]).toLowerCase().includes(termoLimpo));

  if (resultados.length === 0) {
    enviarTelegram(chatId, `📭 Nenhuma ocorrência encontrada na rua "<b>${termo}</b>".`);
    return;
  }

  let msg = `📍 <b>BUSCA POR ENDEREÇO</b>\n`;
  msg += `<i>Termo: "${termo}" (${resultados.length} encontrado(s))</i>\n\n`;

  // Se achar muitos, faz um resumo. Se achar poucos, detalha mais.
  resultados.forEach(r => {
    const statusEmoji = String(r[3]).includes('Atendido') ? '✅' : '⏳';
    msg += `${statusEmoji} 📄 <b>${r[1]}</b> (${r[2]})\n`;
    msg += `↳ ${r[7]}, nº ${r[8]} - ${r[9]}\n`;
    msg += `↳ Status: <code>${r[3]}</code>\n\n`;
  });

  if (resultados.length > 5) msg += `<i>⚠️ Foram encontrados muitos resultados. Tente ser mais específico.</i>`;

  enviarTelegram(chatId, msg);
}

/************************************************************
 * FUNÇÃO DE ENVIO DE MENSAGEM PARA O TELEGRAM - OBRIGATÓRIA
 ************************************************************/

function enviarTelegram(chatId, mensagem) {
  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM.TOKEN}/sendMessage`;
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: mensagem, parse_mode: 'HTML', disable_web_page_preview: true }),
    muteHttpExceptions: true
  });
}