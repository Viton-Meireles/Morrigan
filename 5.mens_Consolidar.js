/************************************************************
 * 5. CONSOLIDAÇÃO (Gravar na Planilha BASE_CONSOLIDADA)
 ************************************************************/
function consolidarChamados() {
  const sheetBase = sh(CONFIG.BASE);
  if (!sheetBase.getLastRow()) {
    sheetBase.appendRow(['ID_UNICO','Nº Chamado','Data Abertura','Status Atual','Tipologia','Subtipo','Origem','Logradouro','Nº','Bairro','Solicitante','Telefone','Equipe Atendimento','Data/Hora Atend.','Situação Campo','Agendamento','Obs/Relato','Última Atualização', 'Relato de Campo']);
  }

  const dataBase = sheetBase.getDataRange().getValues();
  const mapaBase = new Map();
  dataBase.forEach((linha, index) => { if(index > 0 && linha[0]) mapaBase.set(String(linha[0]), index + 1); });

  // Abertura
  const dadosAb = sh(CONFIG.ABERTURA).getDataRange().getValues();
  const novas = [];
  for (let i = 1; i < dadosAb.length; i++) {
    const id = formatar.id(dadosAb[i][2], dadosAb[i][3]);
    if (id && !mapaBase.has(id)) {
      const subtipo = dadosAb[i].slice(17, 24).find(v => v) || 'Não informado';
      novas.push([id, dadosAb[i][2], formatar.data(dadosAb[i][3]), CONFIG.STATUS_PADRAO, dadosAb[i][15], subtipo, dadosAb[i][6], dadosAb[i][7], dadosAb[i][8], dadosAb[i][10], dadosAb[i][12], dadosAb[i][13], '', '', '', '', dadosAb[i][16], new Date(), '']);
      mapaBase.set(id, -1);
    }
  }
  if (novas.length) sheetBase.getRange(sheetBase.getLastRow() + 1, 1, novas.length, novas[0].length).setValues(novas);

  // Campo (Usa a Data da Abertura que está na Coluna D do Form de Campo)
  const dadosCp = sh(CONFIG.CAMPO).getDataRange().getValues();
  sheetBase.getDataRange().getValues().forEach((l, i) => { if(i>0) mapaBase.set(String(l[0]), i+1); });
  for (let i = 1; i < dadosCp.length; i++) {
    const id = formatar.id(dadosCp[i][2], dadosCp[i][3]);
    const linha = mapaBase.get(id);
    if (linha && linha !== -1) {
      sheetBase.getRange(linha, 4).setValue(dadosCp[i][14]);  // Status
      sheetBase.getRange(linha, 13).setValue(dadosCp[i][5]);  // Equipe
      sheetBase.getRange(linha, 14).setValue(dadosCp[i][4]);  // Data Atend Real
      sheetBase.getRange(linha, 19).setValue(dadosCp[i][6]);  // Relato de Campo
      sheetBase.getRange(linha, 18).setValue(new Date());
    }
  }
}