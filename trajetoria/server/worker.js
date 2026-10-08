/**
 * Serviço de IA do Trajetória — Cloudflare Worker.
 *
 * O aplicativo nunca guarda a chave do provedor. Ele fala só com este serviço,
 * que é seu, autentica você por um token e aplica limites de uso e de gasto.
 *
 * Variáveis de ambiente (segredos, via `wrangler secret put`):
 *   ACCESS_TOKEN   token longo e aleatório que o aplicativo envia em Authorization
 *   PROVIDER_KEY   chave da API do provedor escolhido
 * Variáveis simples (wrangler.toml):
 *   PROVIDER       "anthropic" ou "openai"
 *   MODEL          identificador do modelo
 *   DAILY_LIMIT    número máximo de pedidos por dia
 *   MONTHLY_LIMIT  número máximo de pedidos por mês
 *   MAX_TOKENS     teto de tokens por resposta
 * Binding de KV:
 *   USAGE          namespace usado apenas para contadores (nenhuma mensagem)
 */

const ALLOWED_ORIGINS = ['https://appassets.androidplatform.net'];

const SYSTEM_PROMPT = [
  'Você ajuda uma única pessoa a estudar e a organizar a própria rotina e a própria empresa.',
  'Responda em português do Brasil, com objetividade e sem bajulação.',
  'A pessoa está em depressão e com sono desregulado: proponha passos pequenos e possíveis,',
  'nunca transforme descanso ou um dia difícil em falha, e não incentive jornadas longas de trabalho.',
  'Nunca sugira mudar dose, horário ou uso de medicação: isso é decisão de quem prescreveu.',
  'Quando não souber algo, diga que não sabe em vez de inventar.'
].join(' ');

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(origin) }
  });
}

// Comparação de tempo constante para o token não vazar por tempo de resposta.
function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function bump(kv, key, ttl) {
  const current = Number((await kv.get(key)) || 0) + 1;
  await kv.put(key, String(current), { expirationTtl: ttl });
  return current;
}

async function callAnthropic(env, messages) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.PROVIDER_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: env.MODEL,
      max_tokens: Number(env.MAX_TOKENS || 1200),
      system: SYSTEM_PROMPT,
      messages
    })
  });
  if (!response.ok) throw new Error(`provedor respondeu ${response.status}`);
  const data = await response.json();
  const text = (data.content || []).filter(p => p.type === 'text').map(p => p.text).join('\n').trim();
  if (!text) throw new Error('provedor não devolveu texto');
  return text;
}

async function callOpenAI(env, messages) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.PROVIDER_KEY}` },
    body: JSON.stringify({
      model: env.MODEL,
      max_tokens: Number(env.MAX_TOKENS || 1200),
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages]
    })
  });
  if (!response.ok) throw new Error(`provedor respondeu ${response.status}`);
  const data = await response.json();
  const text = ((data.choices || [])[0]?.message?.content || '').trim();
  if (!text) throw new Error('provedor não devolveu texto');
  return text;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== 'POST') return json({ error: 'método não suportado' }, 405, origin);

    const header = request.headers.get('Authorization') || '';
    if (!sameToken(header, `Bearer ${env.ACCESS_TOKEN}`)) return json({ error: 'não autorizado' }, 401, origin);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'corpo inválido' }, 400, origin);
    }

    const messages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
    const valid = messages.length > 0 && messages.every(m =>
      (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length <= 6000);
    if (!valid) return json({ error: 'mensagens inválidas' }, 400, origin);

    // Limites de uso: protegem a conta contra um loop acidental ou um token vazado.
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    const daily = await bump(env.USAGE, `d:${day}`, 60 * 60 * 48);
    const monthly = await bump(env.USAGE, `m:${month}`, 60 * 60 * 24 * 40);
    if (daily > Number(env.DAILY_LIMIT || 60) || monthly > Number(env.MONTHLY_LIMIT || 800)) {
      return json({ error: 'limite de uso do seu serviço atingido' }, 429, origin);
    }

    // O contexto opcional entra como texto comum, nunca como instrução de sistema.
    const payload = [...messages];
    if (Array.isArray(body.context) && body.context.length) {
      const list = body.context.slice(0, 40)
        .map(c => `- ${String(c.title || '').slice(0, 140)} (${c.area}/${c.period})`).join('\n');
      payload.unshift({ role: 'user', content: `Minhas missões ativas de estudo e empresa:\n${list}` });
      payload.unshift({ role: 'assistant', content: 'Certo, vou considerar essas missões.' });
      if (payload[0].role !== 'user') payload.shift();
    }

    try {
      const reply = env.PROVIDER === 'openai'
        ? await callOpenAI(env, payload)
        : await callAnthropic(env, payload);
      return json({ reply }, 200, origin);
    } catch (err) {
      // Mensagens nunca são registradas; só o motivo da falha.
      console.log('falha ao chamar o provedor:', err.message);
      return json({ error: 'o provedor não respondeu' }, 502, origin);
    }
  }
};
