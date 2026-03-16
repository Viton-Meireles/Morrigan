/************************************************************
 * 4. MENSAGEM DE CAMPO (Atendimento encerrado)
 ************************************************************/
function notificarCampo(v) {
  const get = (campo) => v[campo] ? v[campo][0].trim() : '';

  // --- TRATAMENTOS DE DADOS ---
  const numRaw = get('numero_do_endereco_confirmado');
  const numFinal = (numRaw === '00' || numRaw === '') ? 'S/N' : numRaw;
    // Função interna para tratar o erro da data 1969
  const formatarDataHora = (valor) => {
    if (!valor) return 'Não informado';
    // Se a data vier no formato dd/MM/yyyy, o script pode falhar. 
    // Vamos garantir que o formatar.data e hora recebam um valor limpo.
    return `${formatar.data(valor)} às ${formatar.hora(valor)}`;
  };
// Formatar a equipe para ficar "Nome 1 | Nome 2" ao invés de "Nome 1, Nome 2"
  const equipeLista = get('equipe').replace(/, /g, ' | ');
  const status = get('status_atual');
// --- BLOCO 1: STATUS DA VIA (Só aparece se houver interdição/obstrução) ---
  const statusVia = get('status_da_via'); // Ex: 'Interditada Total' ou 'Obstruída Parcial'
  if (statusVia && statusVia !== 'Liberada') {
    msg += `<blockquote>🚧 <b>VIA: ${statusVia.toUpperCase()}</b>\n`;
    if (get('detalhes_via')) msg += `<i>Nota: ${get('detalhes_via')}</i>\n`;
    msg += `</blockquote>\n`;
  }

  // --- BLOCO 2: VÍTIMAS ---
  const temVitimas = get('ha_vitimas') === 'Sim';
  if (temVitimas) {
    msg += `<blockquote>⚠️ <b>VÍTIMAS CONFIRMADAS</b>\n`;
    msg += `• Quantidade: ${get('quantidade_vitimas') || 'Não informada'}\n`;
    msg += `</blockquote>\n`;
  }

  // --- BLOCO 3: DOAÇÕES ---
  if (get('houve_doacao') === 'Sim') {
    msg += `<blockquote>📦 <b>DOAÇÕES REALIZADAS</b>\n`;
    msg += `• Itens: ${get('materiais_doados')}\n`;
    msg += `</blockquote>\n`;
  }

  // --- BLOCO 4: ENCAMINHAMENTOS ---
  const orgaos = get('encaminhamento_orgaos'); // Ex: 'Bombeiros, CEMIG'
  if (orgaos) {
    msg += `<blockquote>🏢 <b>DIRECIONAMENTO:</b>\n`;
    msg += `• Acionado: ${orgaos.replace(/, /g, ' | ')}\n`;
    msg += `</blockquote>\n`;
  }

  let msg = `✅ <b>ATUALIZAÇÃO DE OCORRÊNCIA</b>\n\n`;
  msg += `<b>📄 CHAMADO ${get('numero_do_chamado')}</b>\n`;
  msg += `📅 <b>Data:</b> ${get('data_do_chamado')}\n`;
  msg += `📍 <b>Endereço:</b> ${get('logradouro_confirmado')}, nº ${numFinal} - ${get('bairro_confirmado')}\n`;
  msg += `👷 <b>Equipe:</b> ${equipeLista}\n\n`;

  // --- LÓGICA POR STATUS ---

  if (status.includes('Atendido')) {
    msg += `📝 <b>Status:</b> ✅ Atendido\n`;
    msg += `⏰ <b>Atendido em</b> ${formatarDataHora(get('data_hora_atendimento'))}\n`;
    msg += `🧭 <b>Tipologia confirmada:</b> ${get('tipologia_confirmada')}\n`;
    msg += `↳ 📝 <b>Relato:</b> ${get('resumo_de_campo')}\n\n`;
  } 
  
  else if (status.includes('Cancelado')) {
    msg += `📝 <b>Status:</b> ❌ Cancelado\n`;
    msg += `↳ <b>Motivo:</b> ${get('descreva_o_cancelamento') || 'Não informado'}\n\n`;
  } 
  
  else if (status.includes('Agendado')) {
    msg += `📝 <b>Status:</b> 🕒 Agendado\n`;
    msg += `⏰ <b>Previsão:</b> ${formatarDataHora(get('data_hora_agendamento'))}\n`;
    msg += `🕒 <b>Turno:</b> ${get('Turno_previsto')}\n`;
    msg += `↳ <b>Motivo:</b> ${get('descreva_o_agendamento') || 'Não informado'}\n\n`;
  }

  enviarTelegram(CONFIG.TELEGRAM.CHATS.CAMPO, msg);
}