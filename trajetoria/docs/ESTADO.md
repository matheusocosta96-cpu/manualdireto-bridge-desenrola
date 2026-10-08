# Estado real — 0.2.0

Quatro categorias, sem meio-termo: **funciona e foi testado aqui**,
**implementado mas não testado no aparelho**, **preparado** (existe código ou
estrutura, mas depende de algo externo) e **não existe**.

## Funciona e foi testado aqui

Testes automatizados das regras (`npm test`, 20 testes) e um Chromium em
viewport de celular (412×915, `tests/ui/`) percorrendo o aplicativo inteiro.

- Recorrência diária, semanal (segunda a domingo) e mensal, inclusive na virada
  do ano.
- Meta por período limita o XP: natação com 3 registros semanais rende XP três
  vezes por semana e não mais.
- Teto diário de XP por área (60) e total (150), configuráveis. Passado o teto,
  a ação **continua registrada** no histórico, apenas sem somar pontos — e o
  registro guarda quanto XP deixou de somar.
- Medicação é confirmação explícita, sem XP. Remover a missão não apaga o
  histórico de tomadas.
- Criar, ajustar, arquivar e reativar missões. Arquivar preserva o XP já
  conquistado.
- Registro de sono datado pela hora de acordar, com recusa de intervalos
  impossíveis.
- Correção de registro: sai do histórico e o XP é recalculado.
- Calendário do mês, comparação de 7 e 30 dias contra a janela anterior, por
  área, com dias ativos.
- Backup: exportação em JSON legível ou cifrado com senha (AES-GCM, chave
  derivada por PBKDF2-SHA256, 310 mil iterações). Restauração valida o conteúdo
  e migra esquemas antigos.
- Migração v1 → v2 sem perder nenhum registro, com recusa de backup vindo de
  versão mais nova que a instalada.
- Persistência após recarregar; nenhum erro no console.
- Caminhos do WebView testados com uma ponte `window.Android` simulada: leitura
  e gravação pelo cofre, lembrete da manhã ao registrar o despertar, tela de
  estado do aparelho, ativação do lembrete da noite com o horário, exportação e
  restauração pelo seletor de arquivos, botão voltar e a tela de recuperação
  quando o cofre não pode ser decifrado.

## Implementado, não testado no aparelho

O APK foi compilado e assinado (`trajetoria-0.2.0-release.apk`, v2+v3,
`apksigner verify` passou, `aapt2 dump badging` confere pacote, versões e
permissões). **Nada abaixo rodou em um Android de verdade** — não há emulador
nem aparelho neste ambiente. É o que você precisa validar primeiro:

- Abertura do WebView e carregamento dos assets pela origem local.
- Pedido da credencial do aparelho ao abrir e ao voltar depois de 30 segundos
  fora (pode ser desligado em Conexões).
- Cofre AES-GCM com Android Keystore, incluindo a cópia anterior de segurança.
- Lembrete da noite por `setExactAndAllowWhileIdle`, reagendado após disparar,
  após reiniciar, após atualizar o aplicativo e após mudança de hora/fuso.
- Notificação da manhã ao registrar o despertar.
- Seletor de arquivos para exportar e restaurar backup.
- Leitura real do estado do sistema na tela de Conexões (notificações, alarme
  exato, economia de bateria, bloqueio de tela, presença do Health Connect).
- Bloqueio de capturas de tela e exclusão do backup automático do sistema.

Roteiro de validação: [HYPEROS.md](HYPEROS.md).

## Preparado, depende de uma decisão ou de algo externo

- **Chat com IA.** O aplicativo envia `{"messages":[...]}` por HTTPS com
  `Authorization: Bearer <token>` e espera `{"reply":"..."}`. O serviço está
  escrito em `server/worker.js` com autenticação, CORS restrito, limite diário e
  mensal, e adaptador para Anthropic ou OpenAI. Falta você escolher provedor,
  criar a conta e publicar. Enquanto não houver serviço, o aplicativo **guarda**
  a pergunta e diz que não há resposta — nunca inventa uma.
- **Relógio Sentela.** Marca, modelo, aplicativo e API desconhecidos. A tela de
  Conexões já informa se o Health Connect existe no aparelho, mas não lê nada.
- **Conta privada e sincronização.** Hoje a recuperação é por backup exportado.
  O esquema versionado e a migração já estão prontos para isso.

## Não existe

- Conectores de calendário, ferramentas da empresa ou qualquer serviço externo.
- Leitura de sensores, passos, frequência cardíaca ou sono automático.
- Sincronização entre aparelhos, conta ou servidor de dados.
- Sistema universal de plugins. A divisão em arquivos facilita, mas não é isso.
- Qualquer cálculo de caloria, plano de treino ou alteração de medicação.

## Limites conhecidos desta versão

- O build sem SDK usa `dx` em vez de `d8`: o código Java precisa continuar em
  nível 8, sem lambdas nem métodos `default` em interfaces. O caminho pelo
  Android Studio não tem essa restrição.
- O `aapt2` do sistema não lê a tabela de recursos do `android.jar` da API 35;
  o build usa o da 34 só para resolver atributos. O APK continua `targetSdk 35`.
- No navegador os dados ficam em `localStorage`, sem criptografia.
- Alarme exato depende de o sistema permitir. Se o HyperOS restringir, o
  lembrete atrasa — a tela de Conexões avisa quando isso acontece.
- O teto de XP vale por área e por dia. Você pode criar quantas missões quiser,
  mas elas disputam o mesmo teto.
