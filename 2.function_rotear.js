/************************************************************
 * 2. ROTEADOR (O que o seu Acionador de Formulário chama) 
 ************************************************************/
function rotearFormulario(e) {
  const nomeAba = e.range.getSheet().getName();
  
  // 1. Sincroniza a planilha
  consolidarChamados();

  // 2. Envia as notificações individuais (Abertura ou Campo)
  if (nomeAba === CONFIG.ABERTURA) {
    msg_Abertura(e.namedValues);
  } else if (nomeAba === CONFIG.CAMPO) {
    msg_Campo(e.namedValues);
  }

  // 3. NOVO: Atualiza o Compilado Geral sempre que houver movimento
  msg_Consolidar();
}