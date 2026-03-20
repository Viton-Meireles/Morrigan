/************************************************************
 * 8. COMANDOS DO BOT (Interação Direta e Inteligente)
 ************************************************************/

function doPost(e) {
  try {
    const dados = JSON.parse(e.postData.contents);
    if (!dados.message || !dados.message.text) return;

    const textoBot = dados.message.text.toLowerCase().trim();
    const partes = textoBot.split(' '); 
    const comando = partes[0];
    const chatId = dados.message.chat.id;

    // 8.1 COMANDO: /busca [nº] [data]
    if (comando === '/busca') {
      const num = partes[1];
      const data = partes[2];
      if (!num || !data) {
        enviarTelegram(chatId, "⚠️ <b>Erro de Formato</b>\nUse: <code>/busca [nº] [dd/mm/aaaa]</code>");
        return;
      }
      buscarPorId(chatId, num, data);
    }

    // 8.2 COMANDO: /endereco [nome da rua]
    else if (comando === '/endereco') {
      const termo = partes.slice(1).join(' ');
      if (!termo) {
        enviarTelegram(chatId, "⚠️ Digite o nome da rua.");
        return;
      }
      buscarPorEndereco(chatId, termo);
    }

    // 8.3 COMANDO: /status (Compilado Geral do Dia)
    else if (comando === '/status') {
      const fuso = Session.getScriptTimeZone();
      const hojeBot = Utilities.formatDate(new Date(), fuso, 'dd/MM/yyyy');
      msg_Consolidar(hojeBot); // Garante que envia o de hoje como string
      enviarTelegram(chatId, "📊 <i>Compilado atualizado enviado ao canal.</i>");
    }

    // 8.4 COMANDO: /escala
    else if (comando === '/escala') {
      msg_EnviarEscala("SOLICITAÇÃO");
    }

    // 8.5 COMANDO: /contatos
    else if (comando === '/contatos') {
      let contatos = `☎️ <b>TELEFONES ÚTEIS - DEFESA CIVIL</b>\n`;
      contatos += `──────────────────\n\n`;
      contatos += `🚒 <b>BOMBEIROS:</b> 193\n`;
      contatos += `🚓 <b>POLÍCIA MILITAR:</b> 190\n`;
      contatos += `💡 <b>CEMIG:</b> 116\n`;
      contatos += `💧 <b>COPASA:</b> 115\n`;
      contatos += `🌳 <b>MEIO AMBIENTE:</b> 31 9643-9350\n`;
      contatos += `🏥 <b>SAMU:</b> 192\n\n`;
      enviarTelegram(chatId, contatos);
    }

    // 8.6 COMANDO: /transferir [nº] [data] [destino]
    else if (comando === '/transferir') {
      const num = partes[1];
      const data = partes[2];
      const destino = partes[3] ? partes[3].toLowerCase() : '';
      if (!num || !data || !['op', 'tec'].includes(destino)) {
        enviarTelegram(chatId, "⚠️ Use: <code>/transferir [nº] [data] [op ou tec]</code>");
        return;
      }
      transferirChamadoSetor(chatId, num, data, destino);
    }

    // 8.7 COMANDOS DE PENDÊNCIAS (Setorizados)
    else if (comando === '/pendentesop') {
      enviarPendentesPorSetor(chatId, 'op');
    }
    else if (comando === '/pendentestec') {
      enviarPendentesPorSetor(chatId, 'tec');
    }

    // 8.8 LISTA GERAL DE PENDENTES
    else if (comando === '/pendentes') {
      // Aqui você pode chamar a função que lista TUDO (OP + TEC)
      enviarPendentesGeral(chatId); 
    }

    // 8.9 PLANEJAMENTO DE AGENDADOS
    else if (comando === '/agendados') {
      enviarListaAgendados(chatId);
    }

    // 8.10 COMANDO: /ajuda ou /start
    else if (comando === '/ajuda' || comando === '/start') {
      let ajuda = `🤖 <b>ASSISTENTE OPERACIONAL</b>\n\n`;
      ajuda += `🔎 <code>/busca [nº] [data]</code>\n`;
      ajuda += `📍 <code>/endereco [rua]</code>\n`;
      ajuda += `📊 <code>/status</code> - Compilado\n`;
      ajuda += `🚨 <code>/pendentes</code> - Lista Geral\n`;
      ajuda += `📅 <code>/agendados</code> - Futuros\n`;
      ajuda += `🔄 <code>/transferir</code> - Mudar setor\n`;
      ajuda += `☎️ <code>/contatos</code>\n`;
      enviarTelegram(chatId, ajuda);
    }

  } catch (err) {
    // Se der erro, o log do Google nos avisa o que foi
    console.error("Erro no doPost: " + err.message);
  }
}