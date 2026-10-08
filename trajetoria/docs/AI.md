# Chat com IA

Hoje não há provedor conectado, e o aplicativo deixa isso explícito na tela: sem
serviço configurado ele **guarda** a pergunta e avisa. Nenhuma resposta é
simulada.

Assinatura de ChatGPT, Claude ou similar **não** dá acesso à API. O acesso por
API é uma conta separada, cobrada por uso.

## Contrato

O aplicativo faz `POST` ao endereço HTTPS que você configurar:

```http
POST /chat
Content-Type: application/json
Authorization: Bearer <token guardado só neste aparelho>

{
  "messages": [{"role":"user","content":"Explique variáveis em programação"}],
  "context": [{"title":"Estudar por 5 minutos","area":"intelligence","period":"daily"}]
}
```

- `messages`: as últimas 20 mensagens da conversa.
- `context`: **opcional**, desligado por padrão. Só títulos de missões de
  inteligência e empresa. Sono, medicação e qualquer registro de saúde nunca
  são enviados.
- Resposta esperada: `{"reply":"texto real do provedor"}`.
- Tempo limite de 45 segundos. A resposta nunca é interpretada como HTML nem
  como comando; a IA não altera missões, medicação nem XP.
- O token fica no armazenamento local do aparelho e **não entra no backup**.

## O serviço pronto em `server/`

`server/worker.js` é um Cloudflare Worker completo:

- exige o token em `Authorization`, comparado em tempo constante;
- libera CORS só para `https://appassets.androidplatform.net`;
- limite diário e mensal de pedidos, em KV, para um loop acidental ou um token
  vazado não virarem fatura;
- adaptador para Anthropic ou OpenAI, trocando uma variável;
- instrução de sistema alinhada ao projeto: passos pequenos, sem punir
  descanso, sem incentivar jornada longa e **sem jamais sugerir mudança de
  medicação**;
- não registra o conteúdo das mensagens, só o motivo de uma falha.

### Publicar (≈15 minutos)

```bash
npm i -g wrangler
cd server
wrangler login
wrangler kv namespace create USAGE      # cole o id em wrangler.toml
wrangler secret put ACCESS_TOKEN        # gere com: openssl rand -base64 32
wrangler secret put PROVIDER_KEY        # a chave da API do provedor
wrangler deploy
```

Depois, no aplicativo: **Conexões → Chat com IA**, cole a URL do Worker e o
mesmo `ACCESS_TOKEN`.

### Antes de publicar, três decisões suas

1. **Provedor e modelo.** Define preço e qualidade. Um modelo pequeno dá conta
   de estudo e planejamento por alguns dólares por mês no seu volume.
2. **Teto de gasto.** Além dos limites do Worker, ponha um limite de gasto na
   conta do provedor — é a única trava que não depende de código.
3. **Onde hospedar.** O Worker é a opção de menor atrito e tem plano gratuito.
   Qualquer servidor com HTTPS serve, desde que implemente o mesmo contrato.

Nunca coloque a chave do provedor no aplicativo nem exponha o serviço sem
autenticação.
