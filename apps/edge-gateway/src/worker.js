// Worker de borda do painel (Cloudflare Workers).
//
// Faz a autenticação do admin na borda do Cloudflare e só então repassa o pedido ao painel
// que roda em casa (alcançado por um Cloudflare Tunnel). Cada pedido repassado é assinado com
// EDGE_SECRET; o painel (apps/api) só aceita a assinatura, então o endereço do Tunnel sozinho
// não dá acesso. Sem dependências: usa só a Web Crypto e o fetch do runtime.
//
// Variáveis (veja README.md): ADMIN_PASSWORD_HASH, SESSION_SECRET, EDGE_SECRET (secrets) e
// ORIGIN_URL (endereço público do Tunnel, ex.: https://origem.teuzin.com.br).

const SESSION_COOKIE = '__Host-mc_edge';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
// O runtime dos Workers recusa PBKDF2 acima de 100000 iterações.
const MAX_ITERATIONS = 100_000;
const MAX_PASSWORD_LENGTH = 256;
const LOGIN_MAX_FAILS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const encoder = new TextEncoder();
const failures = new Map(); // por isolate: freio básico; o limite forte é regra de WAF (README)

const PUBLIC_PATHS = new Set(['/', '/admin']);
const isPublicPath = (path) => PUBLIC_PATHS.has(path) || /^\/assets\/[a-z0-9._-]+$/.test(path);

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(text) {
  if (!/^(?:[0-9a-f]{2})+$/.test(text)) return null;
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

/** Hash no formato pbkdf2:<iterações>:<sal hex>:<hash hex> (veja scripts/hash-password.mjs). */
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length === 0) return false;
  if (password.length > MAX_PASSWORD_LENGTH) return false;
  const parts = typeof stored === 'string' ? stored.split(':') : [];
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  const salt = fromHex(parts[2]);
  const expected = fromHex(parts[3]);
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > MAX_ITERATIONS)
    return false;
  if (salt === null || expected === null || expected.length !== 32) return false;
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derived = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      material,
      256,
    ),
  );
  return equalBytes(derived, expected);
}

async function sessionKey(env) {
  // A chave depende do hash: trocar a senha invalida todas as sessões.
  return hmacHex(env.SESSION_SECRET, `edge-session:${env.ADMIN_PASSWORD_HASH}`);
}

async function createSession(env, nowMs) {
  const payload = `${nowMs + SESSION_TTL_MS}.${hex(crypto.getRandomValues(new Uint8Array(12)))}`;
  return `${payload}.${await hmacHex(await sessionKey(env), payload)}`;
}

async function isAuthed(request, env, nowMs) {
  const cookie = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${SESSION_COOKIE}=`));
  if (cookie === undefined) return false;
  const parts = cookie.slice(SESSION_COOKIE.length + 1).split('.');
  if (parts.length !== 3) return false;
  const [expires, nonce, signature] = parts;
  if (!/^\d{10,16}$/.test(expires) || !/^[0-9a-f]{24}$/.test(nonce)) return false;
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = fromHex(await hmacHex(await sessionKey(env), `${expires}.${nonce}`));
  const given = fromHex(signature);
  return equalBytes(expected, given) && Number(expires) > nowMs;
}

const cookieAttrs = 'Path=/; HttpOnly; Secure; SameSite=Strict';
const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });

function retryAfter(key, nowMs) {
  const entry = failures.get(key);
  if (!entry) return 0;
  const recent = entry.filter((t) => nowMs - t < LOGIN_WINDOW_MS);
  if (recent.length === 0) failures.delete(key);
  else failures.set(key, recent);
  if (recent.length < LOGIN_MAX_FAILS) return 0;
  return Math.ceil((recent[0] + LOGIN_WINDOW_MS - nowMs) / 1000);
}

function configError(env) {
  const missing = ['ADMIN_PASSWORD_HASH', 'SESSION_SECRET', 'EDGE_SECRET', 'ORIGIN_URL'].filter(
    (name) => typeof env[name] !== 'string' || env[name] === '',
  );
  if (missing.length > 0) return `Configuração incompleta: ${missing.join(', ')}`;
  if (env.SESSION_SECRET.length < 32 || env.EDGE_SECRET.length < 32)
    return 'SESSION_SECRET e EDGE_SECRET precisam ter pelo menos 32 caracteres';
  try {
    if (new URL(env.ORIGIN_URL).protocol !== 'https:') return 'ORIGIN_URL precisa ser https';
  } catch {
    return 'ORIGIN_URL inválida';
  }
  return null;
}

async function proxy(request, env, url, nowMs) {
  const target = new URL(url.pathname + url.search, env.ORIGIN_URL);
  const pathAndQuery = target.pathname + target.search;
  const ts = String(nowMs);
  const headers = new Headers();
  for (const name of ['accept', 'content-type', 'user-agent', 'accept-language'])
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  // Nenhum cookie nem cabeçalho de borda do cliente chega ao painel.
  headers.set('x-edge-ts', ts);
  headers.set(
    'x-edge-sig',
    await hmacHex(env.EDGE_SECRET, `${ts}.${request.method.toUpperCase()}.${pathAndQuery}`),
  );
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  let upstream;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: 'manual',
    });
  } catch {
    return json(502, { error: 'origin_unreachable', message: 'O servidor de casa não respondeu.' });
  }
  const out = new Headers(upstream.headers);
  out.delete('set-cookie');
  out.delete('connection');
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export default {
  async fetch(request, env) {
    const problem = configError(env);
    if (problem !== null) return json(503, { error: 'misconfigured', message: problem });

    const nowMs = Date.now();
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/admin/api/login' && request.method === 'POST') {
      const key = request.headers.get('cf-connecting-ip') ?? 'desconhecido';
      const wait = retryAfter(key, nowMs);
      if (wait > 0)
        return json(
          429,
          { error: 'too_many_attempts', retryAfterSeconds: wait },
          { 'Retry-After': String(wait) },
        );
      let password = '';
      try {
        const body = await request.json();
        if (typeof body?.password === 'string') password = body.password;
      } catch {
        // corpo inválido conta como senha vazia
      }
      if (!(await verifyPassword(password, env.ADMIN_PASSWORD_HASH))) {
        failures.set(key, [...(failures.get(key) ?? []), nowMs]);
        return json(401, { error: 'invalid_credentials' });
      }
      failures.delete(key);
      return json(
        200,
        { ok: true },
        {
          'Set-Cookie': `${SESSION_COOKIE}=${await createSession(env, nowMs)}; ${cookieAttrs}; Max-Age=${SESSION_TTL_MS / 1000}`,
        },
      );
    }

    if (path === '/admin/api/logout' && request.method === 'POST')
      return json(
        200,
        { ok: true },
        { 'Set-Cookie': `${SESSION_COOKIE}=; ${cookieAttrs}; Max-Age=0` },
      );

    if (path === '/admin/api/me' && request.method === 'GET')
      return json(200, { authenticated: await isAuthed(request, env, nowMs) });

    if (path.startsWith('/admin/api/')) {
      if (!(await isAuthed(request, env, nowMs))) return json(401, { error: 'unauthorized' });
      return proxy(request, env, url, nowMs);
    }

    // Só o site e os arquivos da interface passam sem login. Todo o resto (inclusive as
    // rotas HMAC do plugin e /health) nunca é alcançável por aqui.
    if (!isPublicPath(path)) return json(404, { error: 'not_found' });
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return json(405, { error: 'method_not_allowed' });
    return proxy(request, env, url, nowMs);
  },
};
