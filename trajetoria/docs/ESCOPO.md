# Decisões do proprietário

- Aparelho: POCO X7, Android 15 / HyperOS 2. Uso exclusivo, interface sóbria,
  sem ficção e sem comparação com outras pessoas. O personagem é ele mesmo.
- Referência de progressão: Hero Zero. Só a estrutura — níveis, missões, side
  quests —, nada do visual de jogo.
- Cinco áreas: bem-estar (sono, alimentação, cuidados), inteligência (leitura e
  estudo), empresa, força (calistenia) e resistência (corrida e natação).
- Empresa: venda e hospedagem de sites para gerar caixa enquanto um SaaS de
  agente de IA é desenvolvido. Sem clientes pagantes no início; o progresso
  conta entregas concretas.
- Depressão, sono desregulado e 12 a 18 horas diárias de trabalho com IA e vibe
  coding. Portanto: ações pequenas, sem punição por ausência e sem recompensar
  jornada longa — daí o teto diário de XP.
- Medicação: manhã ao acordar, noite no horário da prescrição (padrão 20h,
  editável pelo usuário). Nomes e doses não foram informados e não devem ser
  inventados. O aplicativo não sugere mudanças. Notificação dispensada não
  conta como tomada.
- Leitura e estudo: cinco minutos de cada são viáveis para começar. Interesses:
  conhecimentos gerais, Direito, programação, IA e vibe coding. Pretende fazer
  Direito, mas não quer estudar só para isso. Não sabe programar de forma
  convencional e quer aprender.
- Alimentação: há seletividade alimentar. Os 3–4 mil kcal mencionados **não**
  são meta nem necessidade; nada de cálculo calórico automático.
- Natação: sexta, sábado e domingo pela manhã, prevista para a semana seguinte
  à conversa inicial. Fica como sugestão até ele confirmar que começou.
- Corrida e calistenia: intenção confirmada, frequência e carga ainda em aberto.
- Sem lesões ou restrições médicas relatadas. Mesmo assim, nenhum plano de
  treino é inferido pelo aplicativo.
- Relógio "Sentela", sem tela, ainda não chegou na conversa inicial. Marca,
  modelo, aplicativo, API e compatibilidade com Health Connect desconhecidos.
- Sem API de IA configurada; provedor e orçamento ainda não escolhidos.
- Dados locais primeiro, funcionamento offline, backup manual. Conta privada
  para recuperar em outro aparelho é desejada, ainda não implementada.

## Perguntas em aberto

1. A natação começou? Em que data? (a missão sai de sugestão para ativa)
2. Horário real do remédio da noite, se for diferente de 20h.
3. Provedor de IA, modelo e teto de gasto mensal.
4. Marca e modelo do relógio, quando chegar.

## Organização para expansão

| Arquivo | Responsabilidade |
|---|---|
| `web/domain.js` | regras: áreas, recorrência, XP, tetos, migração |
| `web/storage.js` | persistência e backup (cifrado ou não) |
| `web/app.js` | telas, diálogos e o cliente HTTP do chat |
| `android/.../Vault.java` | cofre AES-GCM com Android Keystore |
| `android/.../ReminderReceiver.java` | alarmes e notificações |
| `android/.../MainActivity.java` | WebView, ponte JS e estado do sistema |
| `server/worker.js` | serviço de IA privado e autenticado |

Cada conector novo entra separado da interface e precisa declarar permissão,
origem e momento da coleta, e mostrar status real na tela de Conexões — nunca
um "Pendente" genérico que não diz nada. Escrita externa feita por IA exige
confirmação por ação.
