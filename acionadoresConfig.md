1. Mapa de Acionadores (O que você precisa criar no Painel)
Acesse o painel do Google Apps Script, clique no ícone do Relógio (Acionadores) no menu esquerdo e crie exatamente estes 4 acionadores manuais:

*O Maestro dos Formulários (Obrigatório)*
Função: rotearFormulario
Origem do evento: Da planilha
Tipo de evento: Ao enviar o formulário

O que faz: Ouve todos os seus formulários (Abertura, Campo, Vias e In Loco) e distribui as mensagens.

*O Despertador Matinal das Equipes*
Função: relatorioAgendadosHoje
Origem do evento: Baseado no tempo
Tipo de acionador: Contador de dias
Hora do dia: 07:00 às 08:00

O que faz: Manda as missões do dia (e as pendências atrasadas) para os grupos OP e TEC antes do turno começar.

*O Relatório do Comandante (Fim de Turno)*
Função: resumoFimDeTurno
Origem do evento: Baseado no tempo
Tipo de acionador: Contador de dias
Hora do dia: 18:00 às 19:00 (ou o horário que seu plantão encerra)

O que faz: Conta tudo o que aconteceu no dia e manda no grupo INFO_FAST.

*O Olheiro da Escala*
Função: gatilhoEdicaoEscala
Origem do evento: Da planilha
Tipo de evento: Ao editar

O que faz: Fica vigiando a aba Escala_diaria_2026. Mexeu nela, ele ativa o cronômetro anti-spam de 2 minutos e depois avisa no Telegram.

*⚠️ Atenção: NÃO crie acionador para a função processarEnvioEscalaAgendado. O próprio código cria e destrói ela sozinho!*