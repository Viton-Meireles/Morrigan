/************************************************************
 * 6. RESUMO ESTATÍSTICO: FIM DE TURNO
 * Ideal para ser disparado via Gatilho de Tempo (ex: 17h)
 ************************************************************/

function resumoFimDeTurno() {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  if (dados.length <= 1) return;

  const fuso = Session.getScriptTimeZone();
  const hoje = Utilities.formatDate(new Date(), fuso, 'dd/MM/yyyy');
  
  // 1. FILTRAGEM: Apenas chamados que foram abertos ou atendidos HOJE
  const chamadosHoje = dados.slice(1).filter(r => formatar.data(r[2]) === hoje);

  if (chamadosHoje.length === 0) {
    enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, `📴 <b>FIM DE TURNO:</b> Nenhuma atividade registrada hoje (${hoje}).`);
    return;
  }

  // 6.1 VARIÁVEIS DE CONTAGEM
  let estatisticas = {
    total: chamadosHoje.length,
    atendidos: 0,
    pendentes: 0,
    tipologias: {},
    auxilioHabitacional: 0,
    demolicao: 0,
    doacoesEntregues: 0,
    avulsosInLoco: 0
  };

  // 6.2 PROCESSAMENTO DOS DADOS
  chamadosHoje.forEach(r => {
    const status = String(r[3]).toLowerCase();
    const tipo = r[4] || 'Outros';
    const relato = String(r[14]).toLowerCase(); // Coluna O
    const orgaos = String(r[21]).toLowerCase(); // Coluna V (Órgãos Acionados)
    const doacaoSituacao = String(r[18]).toLowerCase(); // Coluna S (Doação Sim/Não)
    const origem = String(r[6]).toLowerCase(); // Coluna G (Origem do Chamado)

    // Contagem de Status
    status.includes('atendido') ? estatisticas.atendidos++ : estatisticas.pendentes++;

    // Contagem por Tipologia
    estatisticas.tipologias[tipo] = (estatisticas.tipologias[tipo] || 0) + 1;

    // Busca por Auxílio Habitacional (na coluna de órgãos ou relato)
    if (orgaos.includes('habitacional') || relato.includes('habitacional') || relato.includes('auxílio')) {
      estatisticas.auxilioHabitacional++;
    }

    // Busca por Demolição (no relato)
    if (relato.includes('demolição') || relato.includes('demolir') || relato.includes('interdição total')) {
      estatisticas.demolicao++;
    }

    // Contagem de Doações Realizadas
    if (doacaoSituacao.includes('sim')) {
      estatisticas.doacoesEntregues++;
    }

    // Contagem de Avulsos (In Loco)
    if (origem.includes('loco') || origem.includes('avulso')) {
      estatisticas.avulsosInLoco++;
    }
  });

  // 6.3 MONTAGEM DA MENSAGEM VISUAL
  let msg = `🏁 <b>RESUMO FINAL DE TURNO</b>\n`;
  msg += `📅 Data: ${hoje}\n`;
  msg += `──────────────────\n\n`;

  msg += `📈 <b>PRODUTIVIDADE:</b>\n`;
  msg += `• Total de Demandas: ${estatisticas.total}\n`;
  msg += `• ✅ Atendidos: ${estatisticas.atendidos}\n`;
  msg += `• ⏳ Pendentes: ${estatisticas.pendentes}\n`;
  msg += `• 🕵️ Chamados "In Loco": ${estatisticas.avulsosInLoco}\n\n`;

  msg += `📂 <b>POR TIPOLOGIA:</b>\n`;
  for (const t in estatisticas.tipologias) {
    msg += `• ${t}: ${estatisticas.tipologias[t]}\n`;
  }

  msg += `\n🆘 <b>AÇÕES SOCIAIS / CRÍTICAS:</b>\n`;
  msg += `• 🏠 Auxílio Habitacional: ${estatisticas.auxilioHabitacional}\n`;
  msg += `• 🏚️ Necessidade Demolição: ${estatisticas.demolicao}\n`;
  msg += `• 🎁 Ajuda Humanitária: ${estatisticas.doacoesEntregues}\n`;

  msg += `\n──────────────────\n`;
  msg += `<i>Relatório gerado automaticamente às ${Utilities.formatDate(new Date(), fuso, 'HH:mm')}</i>`;

  // Envia para o grupo de Gestão (INFO_FAST)
  enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, msg);
}

/**
 * 6.4 Gera o relatório matinal de compromissos agendados por setor.
 * Disparo ideal: Todo dia às 07:30 ou 08:00 via Gatilho.
 */
function relatorioAgendadosHoje() {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  if (dados.length <= 1) return;

  const agora = new Date();
  const dataHojeStr = formatar.data(agora);
  const diasSemana = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const diaNome = diasSemana[agora.getDay()];

  // 6.41. FILTRAGEM: Apenas o que é para HOJE e NÃO está finalizado
  const agendadosHoje = dados.slice(1).filter(r => {
    const dataAgendada = formatar.data(r[15]); // Coluna P
    const status = String(r[3] || '').toLowerCase(); // Coluna D
    return dataAgendada === dataHojeStr && !status.includes('atendido') && !status.includes('cancelado');
  });

  if (agendadosHoje.length === 0) {
    const msgVazio = `✅ <b>Sem agendamentos pendentes para hoje:</b>\n📅 <i>${dataHojeStr} (${diaNome})</i>`;
    enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, msgVazio);
    return;
  }

  // 6.4.2. SEPARAÇÃO POR SETOR PARA ENVIO DIRECIONADO
  const setores = {
    'op': { nome: '📦 OPERACIONAL', chat: CONFIG.TELEGRAM.CHATS.NEW_OPERACIONAL, lista: [] },
    'tec': { nome: '📐 TÉCNICA', chat: CONFIG.TELEGRAM.CHATS.NEW_TECNICA, lista: [] }
  };

  agendadosHoje.forEach(r => {
    const equipe = String(r[12]).toLowerCase(); // Coluna M
    const info = {
      id: r[1],
      tipo: r[4],
      logradouro: r[7] || 'Não inf.',
      num: (String(r[8]) === '00' || !r[8]) ? 'S/N' : r[8],
      bairro: r[9] || 'Não inf.',
      turno: String(r[16] || 'NÃO DEFINIDO').toUpperCase()
    };

    const itemMsg = `🔔 <b>Chamado: ${info.id}</b>\n` +
                    `🧭 ${info.tipo}\n` +
                    `📍 ${info.logradouro}, ${info.num} - ${info.bairro}\n` +
                    `🕒 Turno: <b>${info.turno}</b>\n` +
                    `──────────────────\n\n`;

    if (equipe.includes('operacional') || equipe.includes('op')) {
      setores.op.lista.push(itemMsg);
    } else {
      setores.tec.lista.push(itemMsg);
    }
  });

  // 6.4.3. ENVIO DAS MENSAGENS PERSONALIZADAS
  for (let chave in setores) {
    const s = setores[chave];
    if (s.lista.length > 0) {
      let cabecalho = `📅 <b>AGENDADOS: ${s.nome}</b>\n`;
      cabecalho += `📍 ${dataHojeStr} (${diaNome.toUpperCase()})\n`;
      cabecalho += `──────────────────\n\n`;
      
      enviarTelegram(s.chat, cabecalho + s.lista.join(''));
    }
  }

  // 6.4.4. AVISO NO INFO_FAST (Para o Gestor saber que as equipes foram avisadas)
  const resumoGestor = `📢 <b>RELATÓRIO MATINAL ENVIADO</b>\n` +
                       `• Técnica: ${setores.tec.lista.length} agendados\n` +
                       `• Operacional: ${setores.op.lista.length} agendados`;
  enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, resumoGestor);
}

/************************************************************
 * 6.5 FUNÇÃO: TRANSFERIR CHAMADOS ENTRE SETORES (OP <-> TEC)
 ************************************************************/
function transferirChamadoSetor(chatId, num, data, destinoSigla) {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  const idProcurado = formatar.id(num, data);

  // 6.5.1. Localizar o chamado
  const chamado = dados.find(r => String(r[0]) === idProcurado);

  if (!chamado) {
    enviarTelegram(chatId, `❌ Chamado <b>${num}</b> do dia <b>${data}</b> não encontrado.`);
    return;
  }

  // 6.5.2. Definir o novo chat de destino e o nome do setor
  const novoChatId = (destinoSigla === 'op') ? CONFIG.TELEGRAM.CHATS.NEW_OPERACIONAL : CONFIG.TELEGRAM.CHATS.NEW_TECNICA;
  const nomeSetor = (destinoSigla === 'op') ? '📦 OPERACIONAL' : '📐 TÉCNICA';

  // 3. Montar a ficha de transferência para o novo grupo
  let msg = `🔄 <b>CHAMADO TRANSFERIDO PARA ESTE SETOR</b>\n`;
  msg += `──────────────────\n`;
  msg += `🆔 <b>Nº:</b> ${chamado[1]}  |  📅 <b>Data:</b> ${formatar.data(chamado[2])}\n`;
  msg += `🚩 <b>Tipologia:</b> ${chamado[4]}\n`;
  msg += `📍 <b>Local:</b> ${chamado[7]}, ${chamado[8]} - ${chamado[9]}\n`;
  msg += `📞 <b>Solicitante:</b> ${chamado[10]} (${chamado[11]})\n`;
  msg += `──────────────────\n`;
  msg += `⚠️ <i>Motivo: Reclassificado via sistema por um gestor.</i>`;

  // 6.5.4. Enviar para o novo grupo
  enviarTelegram(novoChatId, msg);

  // 6.5.5. Confirmar para quem solicitou a transferência
  enviarTelegram(chatId, `✅ Chamado <b>${num}</b> transferido com sucesso para <b>${nomeSetor}</b>.`);
  
  // 6.5.6 Opcional: Atualizar a coluna "Equipe" na Planilha para o novo setor
  const index = dados.findIndex(r => String(r[0]) === idProcurado);
  if (index !== -1) {
    sheetBase.getRange(index + 1, 13).setValue(nomeSetor); // Coluna M (Equipe)
  }
}

/**
 * 6.6 FUNÇÃO: RELATÓRIO DE PENDÊNCIAS ATIVAS (AGENDADOS HOJE + ATRASADOS)
 * Este relatório varre a base em busca de tudo que a equipe precisa resolver hoje,
 * incluindo o que ficou pendente de dias anteriores.
 */
function relatorioAgendadosHoje() {
  const sheetBase = sh(CONFIG.BASE);
  const dados = sheetBase.getDataRange().getValues();
  if (dados.length <= 1) return;

  const hoje = new Date();
  const hojeFormatado = formatar.data(hoje);
  
  // 6.1.A FILTRAGEM INTELIGENTE
  const pendenciasAtivas = dados.slice(1).filter(r => {
    const dataAgendada = formatar.data(r[15]); // Coluna P (Agendamento)
    const dataAbertura = formatar.data(r[2]);  // Coluna C (Abertura)
    const status = String(r[3] || '').toLowerCase();
    
    // Regra: Está agendado para hoje OU (É de data passada E não está finalizado)
    const ehHoje = (dataAgendada === hojeFormatado || dataAbertura === hojeFormatado);
    const estaPendente = !status.includes('atendido') && !status.includes('cancelado');
    
    // Captura tudo que é "Hoje" ou "Atrasado mas Pendente"
    return estaPendente && (ehHoje || dataAgendada < hojeFormatado || dataAbertura < hoyeFormatado);
  });

  if (pendenciasAtivas.length === 0) {
    enviarTelegram(CONFIG.TELEGRAM.CHATS.INFO_FAST, `✅ <b>Tudo em dia!</b> Nenhuma pendência acumulada para hoje.`);
    return;
  }

  // 6.2.B ORGANIZAÇÃO POR SETOR
  const setores = {
    'op': { nome: '📦 OPERACIONAL', chat: CONFIG.TELEGRAM.CHATS.NEW_OPERACIONAL, hoje: [], atrasados: [] },
    'tec': { nome: '📐 TÉCNICA', chat: CONFIG.TELEGRAM.CHATS.NEW_TECNICA, hoje: [], atrasados: [] }
  };

  pendenciasAtivas.forEach(r => {
    const equipe = String(r[12]).toLowerCase();
    const dataRef = r[15] ? formatar.data(r[15]) : formatar.data(r[2]);
    const ehAtrasado = dataRef < hojeFormatado;

    const item = `🔔 <b>[${r[1]}]</b> ${r[4]}\n` +
                 `📍 ${r[7]}, ${r[8]} - ${r[9]}\n` +
                 `📅 Ref: ${dataRef} | 🕒 Turno: ${r[16] || '---'}\n` +
                 `──────────────────\n`;

    const alvo = (equipe.includes('op')) ? setores.op : setores.tec;
    
    if (ehAtrasado) {
      alvo.atrasados.push(item);
    } else {
      alvo.hoje.push(item);
    }
  });

  // 6.3.C MONTAGEM E ENVIO DAS MENSAGENS
  for (let chave in setores) {
    const s = setores[chave];
    if (s.hoje.length > 0 || s.atrasados.length > 0) {
      let msg = `📋 <b>PAINEL DE TRABALHO: ${s.nome}</b>\n`;
      msg += `📅 Data: ${hojeFormatado}\n\n`;

      if (s.atrasados.length > 0) {
        msg += `⚠️ <b>PENDÊNCIAS ACUMULADAS:</b>\n${s.atrasados.join('')}\n`;
      }

      if (s.hoje.length > 0) {
        msg += `📌 <b>DEMANDAS DE HOJE:</b>\n${s.hoje.join('')}`;
      }

      enviarTelegram(s.chat, msg);
    }
  }
}