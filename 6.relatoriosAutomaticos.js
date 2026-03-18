/************************************************************
 * 6. RELATÓRIOS AUTOMÁTICOS (TIME-DRIVEN)
 ************************************************************/

// Programe para rodar no fim do expediente (17:00h)
function resumoFimDeTurno() {
  const dados = sh(CONFIG.BASE).getDataRange().getValues();
  if (dados.length <= 1) return;

  const hoje = formatar.data(new Date());
  
  // Filtra apenas o que aconteceu HOJE (Aberto hoje OU Atualizado hoje)
  const movimentacoesHoje = dados.slice(1).filter(r => {
    const dataAbertura = formatar.data(r[2]);
    const dataAtualizacao = formatar.data(r[22]); // Coluna W (Última Atualização)
    
    return (dataAbertura === hoje || dataAtualizacao === hoje);
  });

  if (movimentacoesHoje.length === 0) {
    enviarTelegram(CONFIG.TELEGRAM.CHATS.COMPILADO, `📊 <b>RESUMO: FIM DE TURNO</b>\nNenhuma ocorrência movimentada hoje (${hoje}).`);
    return;
  }

  let msg = `📊 <b>RESUMO: FIM DE TURNO (${hoje})</b>\n`;
  msg += `<i>Total de chamados movimentados: ${movimentacoesHoje.length}</i>\n\n`;

  // Lista todos os chamados que tiveram ação no dia
  movimentacoesHoje.forEach(r => {
    // r[1]=Nº, r[3]=Status, r[4]=Tipologia, r[9]=Bairro
    msg += `📄 <b>${r[1]}</b> - <code>${r[3]}</code>\n`;
    msg += `🧭 ${r[4]} | 📍 ${r[9]}\n`;
    msg += `──────────────────\n`;
  });
  
  enviarTelegram(CONFIG.TELEGRAM.CHATS.COMPILADO, msg);
}

/**
 * Gera o relatório matinal de compromissos agendados.
 * Filtra apenas o que é para HOJE e que ainda NÃO foi resolvido. */

function relatorioAgendadosHoje() {
  const dados = sh(CONFIG.BASE).getDataRange().getValues();
  const agora = new Date();
  
  // 6.1 Configuração de data e dia da semana em PT-BR
  const diasSemana = [
    'domingo', 'segunda-feira', 'terça-feira', 
    'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'
  ];

  const dataHojeStr = formatar.data(agora); // Ex: 17/03/2026
  const diaNome = diasSemana[agora.getDay()]; 
  const dataCompleta = `${dataHojeStr} ('${diaNome}')`;

  let msg = `📅 <b>AGENDADOS PARA HOJE</b>\n📍 ${dataCompleta}\n`;
  msg += `──────────────────\n\n`;
  
  let encontrou = false;

  // 6.2 Varredura da Base Master (Pula o cabeçalho com slice(1))
dados.slice(1).forEach(r => {
    const dataAgendada = formatar.data(r[15]); // Coluna P
    const statusAtual = String(r[3] || ''); // Coluna D - Evita erro se o status estiver vazio
    // Filtro: Data de hoje e chamado não finalizado
    if (dataAgendada === dataHojeStr && !statusAtual.includes('Atendido') && !statusAtual.includes('Cancelado')) {
      encontrou = true;
      
      // --- TRATAMENTO DO ENDEREÇO (Colunas H, I e J) ---
      const logradouro = r[7] || 'Logradouro não informado'; // Coluna H
      const numRaw = String(r[8]); // Coluna I
      const numFinal = (numRaw === '00' || numRaw === '' || numRaw === 'undefined') ? 'S/N' : numRaw;
      const bairro = r[9] || 'Bairro não informado'; // Coluna J
      
      const turno = String(r[16] || 'Não definido').toUpperCase(); // Coluna Q

      msg += `🔔 <b>Chamado: ${r[1]}</b>\n`;
      msg += `🧭 Tipologia: ${r[4]}\n`;
      msg += `📍 <b>Endereço:</b> ${logradouro}, nº ${numFinal} - ${bairro}\n`;
      msg += `🕒 Turno: <b>${turno}</b>\n`;
      msg += `──────────────────\n\n`;
    }
  });

  if (!encontrou) {
    msg = `✅ <b>Não há agendamentos pendentes para hoje.</b>\n` +
          `↳ 📅 <i>${dataCompleta}</i>`;
  }

  enviarTelegram(CONFIG.TELEGRAM.CHATS.ABERTURA, msg);
}