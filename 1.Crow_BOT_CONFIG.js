/************************************************************
 * 1. CONFIGURAÇÕES E UTILITÁRIOS | (atualizado em: 16/03/2026 - 13:15)
 ************************************************************/
const CONFIG = {
  ABERTURA: 'abertura_de_chamado', 
  CAMPO: 'relatorio_em_campo',      
  BASE: 'BASE_CONSOLIDADA',
  ESCALA: 'Escala_diaria_2026',
  STATUS_PADRAO: 'Aguardando atendimento',
  TELEGRAM: {
    TOKEN: '8237808044:AAHJf09271f0oPL88_nFXCmoWRqdu6TIxHU',
    CHATS: {
      ABERTURA: '-1003862323760',
      CAMPO: '-1003815316144',
      COMPILADO: '-1003750376669'
    }
  }
};

const sh = (nome) => SpreadsheetApp.getActive().getSheetByName(nome);

const formatar = {
  // Recebe "13/03/2026 16:17:00" -> Devolve "13/03/2026"
  data: (v) => {
    if (!v) return 'Não informado';
    let s = String(v);
    // Se tem espaço, a data é o que vem antes do espaço
    return s.includes(' ') ? s.split(' ')[0] : s;
  },

  // Recebe "13/03/2026 16:17:00" -> Devolve "16:17"
  hora: (v) => {
    if (!v) return '00:00';
    let s = String(v);
    // Pega a parte após o espaço (16:17:00)
    let parteHora = s.includes(' ') ? s.split(' ')[1] : s;
    // Corta os segundos (pega só os dois primeiros blocos)
    let blocos = parteHora.split(':');
    return blocos.length >= 2 ? `${blocos[0].padStart(2, '0')}:${blocos[1].padStart(2, '0')}` : parteHora;
  },

  // ID único para a BASE_CONSOLIDADA
  id: (n, d) => {
    // Garante que a data esteja no formato YYYYMMDD para o ID
    let dataLimpa = String(d).split(' ')[0].split('/'); // Pega [13, 03, 2026]
    let dataIso = dataLimpa.length === 3 ? dataLimpa[2] + dataLimpa[1] + dataLimpa[0] : '00000000';
    return `${n}_${dataIso}`;
  }
};

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
