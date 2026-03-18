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

  // Recebe "13/03/2026 16:17:00" -> Devolve "13/03/2026"
const formatar = {
  data: (v) => {
    if (!v) return 'Não informado';
    // Se já for uma data do sistema, formata certinho
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
    let s = String(v);
    return s.includes(' ') ? s.split(' ')[0] : s;
  },

  // Recebe "13/03/2026 16:17:00" -> Devolve "16:17"
hora: (v) => {
    if (!v) return '00:00';
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
    let s = String(v);
    let parteHora = s.includes(' ') ? s.split(' ')[1] : s;
    let blocos = parteHora.split(':');
    return blocos.length >= 2 ? `${blocos[0].padStart(2, '0')}:${blocos[1].padStart(2, '0')}` : parteHora;
  },

  // ID único para a BASE_CONSOLIDADA
 id: (n, d) => {
    if (!n || !d) return null;
    let dataLimpa = '';
    if (d instanceof Date) {
      dataLimpa = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyyMMdd');
      return `${n}_${dataLimpa}`;
    }
    let s = String(d).split(' ')[0].split('/');
    let dataIso = s.length === 3 ? s[2] + s[1] + s[0] : '00000000';
    return `${n}_${dataIso}`;
  }
};