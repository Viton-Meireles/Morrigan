/************************************************************
 * 2. ROTEADOR (O que o seu Acionador de Formulário chama)
 ************************************************************/
function rotearFormulario(e) {
  const nomeAba = e.range.getSheet().getName();
  const dados = e.namedValues;
  const get = (campo) => dados[campo] ? dados[campo][0].trim() : '';

  // 1. SINCRONIZAÇÃO MASTER
  consolidarChamados();

  // 2. LÓGICA DE DISTRIBUIÇÃO (Triagem Automática)
  if (nomeAba === CONFIG.ABERTURA) {
    // Todos os novos vão para a ENTRADA
    notificarAbertura(dados, CONFIG.TELEGRAM.CHATS.ENTRADA);

    // Triagem por Tipologia
    const tipo = get('tipologia_inicial');
    if (tipo.includes('Arbóreo') || tipo.includes('Doação')) {
      notificarAbertura(dados, CONFIG.TELEGRAM.CHATS.NEW_OPERACIONAL);
    } else {
      notificarAbertura(dados, CONFIG.TELEGRAM.CHATS.NEW_TECNICA);
    }
  } 
  
  else if (nomeAba === CONFIG.CAMPO) {
    // Chamados finalizados/agendados vão para o grupo geral de CAMPO
    notificarCampo(dados); 
    // Atualiza os painéis de controle
    msg_Consolidar(formatar.data(get('data_do_chamado')));
    msg_InfoFast(); // Gera a estatística rápida
  }

  // NOVA LÓGICA: Monitoramento de Vias
  else if (nomeAba === CONFIG.VIAS) {
    notificarStatusVia(dados);
  }

  else if (nomeAba === 'aba_avulsos') { // Nome do seu 3º formulário
    const setor = get('Setor Responsável'); // Ideal ter esse campo (OP ou TEC)
    const destino = (setor === 'Operacional') ? CONFIG.TELEGRAM.CHATS.AVULSO_OP : CONFIG.TELEGRAM.CHATS.AVULSO_TEC;
    notificarAvulso(dados, destino);
  }
}