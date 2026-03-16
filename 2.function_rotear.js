/************************************************************
 * 2. ROTEADOR (O que o seu Acionador de Formulário chama) 
 ************************************************************/
function rotearFormulario(e) {
  const nomeAba = e.range.getSheet().getName();
  
  // Primeiro, sincroniza os dados na planilha Master
  consolidarChamados();

  // Depois, envia as notificações detalhadas
  if (nomeAba === CONFIG.ABERTURA) {
    notificarAbertura(e.namedValues);
  } else if (nomeAba === CONFIG.CAMPO) {
    notificarCampo(e.namedValues);
  }
}