/************************************************************
 * 5. msg_Consolidar
 * Lógica da BASE MASTER e Mensagem de Painel Diário
 ************************************************************/

function msg_Consolidar() {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  if (dados.length <= 1) return;

  const hoje = formatar.data(new Date());
  const agora = `${hoje} às ${formatar.hora(new Date())}`;

  // 1. CÁLCULO DE ESTATÍSTICAS (Baseado no dia de hoje)
  const chamadosHoje = dados.slice(1).filter(r => r[2] === hoje);
  
  const total = chamadosHoje.length;
  const atendidos = chamadosHoje.filter(r => r[3].includes('Atendido')).length;
  const pendentes = total - atendidos;
  const agendados = chamadosHoje.filter(r => r[3].includes('Agendado')).length;
  const cancelados = chamadosHoje.filter(r => r[3].includes('Cancelado')).length;

  // 2. AGRUPAMENTO POR TIPOLOGIA
  // Definimos os ícones para cada categoria
  const icones = {
    'Arbóreo': '🌳',
    'Acidente viário': '🚧',
    'Estrutural': '🏚️',
    'Geológico': '⛰️',
    'Hidrológico': '🌊',
    'Incêndio': '🔥',
    'Entrega de doação': '🎁'
  };

  // Criamos um objeto para guardar os chamados de cada categoria
  const grupos = {};

  chamadosHoje.forEach(r => {
    const tipologiaBruta = r[4] || 'Outros';
    // Limpa o emoji do nome da tipologia se ele vier do Forms (ex: "🌳 Arbóreo" -> "Arbóreo")
    const nomeLimpo = tipologiaBruta.replace(/[^\w\sÀ-ú]/g, '').trim();
    
    if (!grupos[nomeLimpo]) grupos[nomeLimpo] = [];
    grupos[nomeLimpo].push(r);
  });

  // 3. MONTAGEM DO CABEÇALHO
  let msg = `📊 <b>COMPILADO DE CHAMADOS</b>\n\n`;
  msg += `<b>Última atualização:</b> ${agora}\n`;
  msg += `<b>Total de chamados:</b> ${total}\n`;
  msg += `✅<b>Atendidos:</b> ${atendidos}\n`;
  msg += `⏳<b>Pendentes:</b> ${pendentes}\n`;
  msg += `📅<b>Agendados:</b> ${agendados}\n`;
  msg += `❌<b>Cancelados:</b> ${cancelados}\n`;
  msg += `──────────────────\n\n`;

  // 4. MONTAGEM DO CORPO (Agrupado por Tipologia)
  for (const categoria in grupos) {
    const emoji = icones[categoria] || '📋';
    msg += `${emoji} <b>| ${categoria.toUpperCase()}</b>\n`;
    
    grupos[categoria].forEach(chamado => {
      // r[1] = Numero, r[3] = Status
      const statusEmoji = chamado[3].includes('Atendido') ? '✅' : '⏳';
      msg += `↳ ${statusEmoji} 📄 <b>${chamado[1]}</b> - <code>${chamado[3]}</code>\n`;
    });
    msg += `\n`;
  }

  if (total === 0) {
    msg += `📭 <i>Nenhuma ocorrência registrada hoje até o momento.</i>`;
  }

  // Envia para o canal de compilado
  enviarTelegram(CONFIG.TELEGRAM.CHATS.COMPILADO, msg);
}