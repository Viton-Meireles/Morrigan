/************************************************************
 * 1. CONFIGURAÇÕES E UTILITÁRIOS | (atualizado em: 16/03/2026 - 13:15)
 ************************************************************/
const CONFIG = {
  ABERTURA: 'abertura_de_chamado', 
  CAMPO: 'relatorio_em_campo',      
  BASE: 'BASE_CONSOLIDADA',
  ESCALA: 'Escala_diaria_2026',
  STATUS_PADRAO: 'Aguardando atendimento',
  VIAS: 'status_de_vias',
  TELEGRAM: { //IDs para o BOT do Telegram
    TOKEN: '8237808044:AAHJf09271f0oPL88_nFXCmoWRqdu6TIxHU',
    CHATS: { //GP = GRUPO
      /*PARTE 1 - NOVOS CHAMADOS | Todos chegam para o Setor de Entrada e são separados por equipe nos outros 2 grupos*/
      ENTRADA: '-1003862323760', // ANTES -> ABERTURA //TODOS OS CHAMADOS NOVOS P/ GP SETOR DE ENTRADA
      NEW_OPERACIONAL: '-5193056344', //GP CAMPO //CHAMADO NOVOS P/ OPERACIONAL
      NEW_TECNICA: '-5256034455', //GP CHAMADO NOVOS P/ TÉCNICA
      /*PARTE 2 - Compilado e grupo para informações rápidas (tipo estatisticas)*/
      COMPILADO: '-1003750376669', //GP COMPILADO DEFESA CIVIL
      INFO_FAST: '-5199963816', //GP iNFORMAÇÕES RÁPIDAS
      /*PARTE 3 - Chamados criados em campo por cada equipe, servirá como controle interno tbm*/
      AVULSO_OP: '-5068971586', //GP CHAMADOS CRIADOS INLOCO OPERACIONAL
      AVULSO_TEC: '-5244563273', //GP CHAMADOS CRIADOS INLOCO TÉCNICA
      /*PARTE 4 - Chamados atendidos em campo*/
      CAMPO: '-1003815316144' //GP CHAMADOS ATENDIDOS EM CAMPO - OPERACIONAL OU TÉCNICA
    }
  }
};

const sh = (nome) => SpreadsheetApp.getActive().getSheetByName(nome);

  // Recebe "13/03/2026 16:17:00" -> Devolve "13/03/2026"
const formatar = {
  data: (v) => {
    if (!v || v == 'Não informado') return 'Não informado';
    // Se for um objeto de data real, formata para texto BR
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
    return String(v).split(' ')[0];
  },
// Recebe "13/03/2026 16:17:00" -> Devolve "16:17"
  hora: (v) => {
    if (!v || v == '00:00') return '---';
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
    let s = String(v);
    let p = s.includes(' ') ? s.split(' ')[1] : s;
    return p.split(':').slice(0,2).join(':'); // Pega só HH:mm
  }
};

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
