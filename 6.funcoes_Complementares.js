/************************************************************
 * 6. RELATÓRIOS AUTOMÁTICOS (TIME-DRIVEN)
 ************************************************************/
function enviarCompiladoPeriodico() {
  const dados = sh(CONFIG.BASE).getDataRange().getValues();
  let msg = `📊 <b>RESUMO OCORRÊNCIAS DO DIA</b>\n\n`;
  const recentes = dados.slice(1).reverse().slice(0, 8); 

  recentes.forEach(r => {
    msg += `📄 <b>${r[1]}</b> (${r[2]}) - <code>${r[3]}</code>\n`;
    msg += `🧭 ${r[4]} | 📍 ${r[9]}\n`;
    msg += `──────────────────\n`;
  });
  enviarTelegram(CONFIG.TELEGRAM.CHATS.COMPILADO, msg);
}

// Esta função roda diariamente, às 08:15h, enviando se há chamados agendados do dia ou não.
function relatorioAgendadosHoje() {
  const dados = sh(CONFIG.BASE).getDataRange().getValues();
  const agora = new Date();
  
  // Lista para converter o número do dia no nome em português
  const diasSemana = [
    'domingo', 'segunda-feira', 'terça-feira', 
    'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'
  ];

  const dataNumerica = formatar.data(agora); // Ex: 16/03/2026
  const diaNome = diasSemana[agora.getDay()]; // Pega o nome conforme o dia atual
  const dataCompleta = `${dataNumerica} ('${diaNome}')`;

  let msg = `📅 <b>AGENDADOS PARA HOJE</b>\n📍 ${dataCompleta}\n\n`;
  let encontrou = false;

  dados.slice(1).forEach(r => {
    // Verifica se a data na coluna P (índice 15) é igual a hoje
    if (formatar.data(r[15]) === dataNumerica) {
      encontrou = true;
      msg += `🔔 <b>Chamado ${r[1]}</b>\n🧭 ${r[4]} | 📍 ${r[9]}\n\n`;
    }
  });

  if (!encontrou) {
    msg = `‼️ <b>Não há agendamentos para hoje.</b>\n ↳📅 ${dataCompleta}`;
  }

  enviarTelegram(CONFIG.TELEGRAM.CHATS.ABERTURA, msg);
}

/************************************************************
 * FUNÇÕES DE ESCALA E PLANTÃO | (atualizado em: 16/03/2026 - 13:15)
 ************************************************************/

// 1. Script para o Resumo Diário (Programar para rodar entre 6h e 7h)
function enviarPlantaoDiario() {
  const abaEscala = sh('Escala_diaria_2026');
  if (!abaEscala) return;

  const dados = abaEscala.getDataRange().getValues();
  const hoje = formatar.data(new Date());
  
  // Procura a linha de hoje na escala
  for (let i = 1; i < dados.length; i++) {
    let dataLinha = formatar.data(dados[i][0]);

    if (dataLinha === hoje) {
      const diaSemana = dados[i][1];
      const tecnico = formatarNomes(dados[i][2], dados[i][3]);
      const operacional = formatarNomes(dados[i][4], dados[i][5]);
      const entrada = formatarNomes(dados[i][6], dados[i][7]);

      let msg = `📅 <b>PLANTÃO DO DIA - ${hoje}</b>\n`;
      msg += `<i>${diaSemana}</i>\n\n`;
      
      msg += `<blockquote><b>Equipe Técnica:</b>\n↳ ${tecnico}</blockquote>\n`;
      msg += `<blockquote><b>Equipe Operacional:</b>\n↳ ${operacional}</blockquote>\n`;
      msg += `<blockquote><b>Setor de Entrada:</b>\n↳ ${entrada}</blockquote>\n\n`;
      
      msg += `<i> 📣 Bom trabalho a todos! </i>`;
      
      // Envia para o canal de Abertura ou de Compilado (você escolhe o ID)
      enviarTelegram(CONFIG.TELEGRAM.CHATS.ABERTURA, msg);
      break;
    }
  }
}

// 2. Script para Atualização Automática em caso de edição na planilha
// IMPORTANTE: Para enviar Telegram, este precisa ser um "Acionador Instalável" (Editar -> Acionadores)
function monitorarAlteracaoEscala(e) {
  const aba = e.range.getSheet();
  if (aba.getName() !== 'Escala_diaria_2026') return;

  const row = e.range.getRow();
  const dados = aba.getRange(row, 1, 1, 8).getValues()[0];
  const hoje = formatar.data(new Date());
  const dataEditada = formatar.data(dados[0]);

  // Só avisa se a edição foi na escala de HOJE
  if (dataEditada === hoje) {
    const tecnico = formatarNomes(dados[2], dados[3]);
    const operacional = formatarNomes(dados[4], dados[5]);
    const entrada = formatarNomes(dados[6], dados[7]);

    let msg = `🔄 <b>ESCALA DE HOJE ATUALIZADA</b>\n\n`;
    msg += `<blockquote><b>Técnica:</b> ${tecnico}\n`;
    msg += `<b>Operacional:</b> ${operacional}\n`;
    msg += `<b>Entrada:</b> ${entrada}</blockquote>`;

    enviarTelegram(CONFIG.TELEGRAM.CHATS.ABERTURA, msg);
  }
}

/************************************************************
 * AUXILIARES PADRONIZADOS
 ************************************************************/
function formatarNomes(n1, n2) {
  const nomes = [];
  if (n1) nomes.push(n1);
  if (n2) nomes.push(n2);
  return nomes.length > 0 ? nomes.join(' | ') : "Não definido";
}