# Serviço de IA do Trajetória

Worker da Cloudflare que fica entre o aplicativo e o provedor de IA. Existe por
três motivos: a chave do provedor não pode morar no aplicativo, o serviço
precisa saber que é você chamando, e precisa haver um teto que impeça uma
fatura inesperada.

- `worker.js` — o serviço.
- `wrangler.toml` — configuração; preencha o id do KV e o modelo.

Passo a passo de publicação e as decisões necessárias: [../docs/AI.md](../docs/AI.md).

Resumo do que ele faz: exige `Authorization: Bearer <ACCESS_TOKEN>` comparado em
tempo constante, libera CORS só para a origem do aplicativo, conta pedidos por
dia e por mês em KV e recusa com `429` ao passar do limite, repassa a conversa
ao provedor (Anthropic ou OpenAI) com uma instrução de sistema alinhada ao
projeto e devolve `{"reply":"..."}`. Não registra o conteúdo das mensagens.
