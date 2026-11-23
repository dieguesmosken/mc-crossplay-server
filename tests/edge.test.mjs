import assert from 'node:assert/strict';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PlayerQueue } from '../packages/queue/dist/index.js';
import { buildApp } from '../apps/api/dist/index.js';
import { hashPassword } from '../apps/api/dist/admin/password.js';
import { LogTailer } from '../apps/api/dist/admin/logtail.js';
import { StatsSampler } from '../apps/api/dist/admin/stats.js';
import { edgeSignature, verifyEdgeRequest } from '../apps/api/dist/admin/edge.js';
import worker, { verifyPassword } from '../apps/edge-gateway/src/worker.js';

// Tudo aleatório por execução: nenhum segredo literal no repositório.
const rand = () => randomBytes(24).toString('hex');
const PASSWORD = rand();
const WRONG = rand();
const EDGE_SECRET = rand();

function edgeHash(password, iterations = 100_000) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password.normalize('NFKC'), salt, iterations, 32, 'sha256');
  return `pbkdf2:${iterations}:${salt.toString('hex')}:${hash.toString('hex')}`;
}

const HASH = edgeHash(PASSWORD);
const env = () => ({
  ADMIN_PASSWORD_HASH: HASH,
  SESSION_SECRET: rand(),
  EDGE_SECRET,
  ORIGIN_URL: 'https://origem.example.test',
});

test('worker password hash accepts only the right password and sane parameters', async () => {
  assert.ok(await verifyPassword(PASSWORD, HASH));
  assert.ok(!(await verifyPassword(WRONG, HASH)));
  assert.ok(!(await verifyPassword('', HASH)));
  assert.ok(!(await verifyPassword(PASSWORD, 'lixo')));
  assert.ok(!(await verifyPassword(PASSWORD, edgeHash(PASSWORD, 5_000))), 'too few iterations');
  assert.ok(
    !(await verifyPassword(PASSWORD, edgeHash(PASSWORD, 200_000))),
    'above the cap',
  );
  assert.ok(!(await verifyPassword('x'.repeat(300), HASH)));
});

test('API accepts only fresh edge signatures bound to method and URL', () => {
  const t0 = 1_700_000_000_000;
  const ts = String(t0);
  const sig = edgeSignature(EDGE_SECRET, ts, 'GET', '/admin/api/snapshot');
  const ok = (over = {}, now = t0 + 1_000) =>
    verifyEdgeRequest(
      EDGE_SECRET,
      { ts, sig, method: 'GET', url: '/admin/api/snapshot', ...over },
      now,
    );
  assert.ok(ok());
  assert.ok(!ok({}, t0 + 120_000), 'stale');
  assert.ok(!ok({ method: 'POST' }), 'method bound');
  assert.ok(!ok({ url: '/admin/api/stream' }), 'url bound');
  assert.ok(!ok({ sig: undefined }));
  assert.ok(!ok({ sig: sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0') }), 'tampered');
  assert.ok(!verifyEdgeRequest(rand(), { ts, sig, method: 'GET', url: '/admin/api/snapshot' }, t0));
});

test('worker refuses to run with incomplete or weak configuration', async () => {
  const res = await worker.fetch(new Request('https://mine.example.test/'), {});
  assert.equal(res.status, 503);
  const weak = await worker.fetch(new Request('https://mine.example.test/'), {
    ...env(),
    EDGE_SECRET: 'curto',
  });
  assert.equal(weak.status, 503);
  const http = await worker.fetch(new Request('https://mine.example.test/'), {
    ...env(),
    ORIGIN_URL: 'http://origem.example.test',
  });
  assert.equal(http.status, 503);
});

async function stack() {
  const dir = await mkdtemp(join(tmpdir(), 'edge-'));
  await writeFile(join(dir, 'index.html'), '<h1>site</h1>');
  await writeFile(join(dir, 'admin.html'), '<h1>admin</h1>');
  await writeFile(join(dir, 'latest.log'), '[10:00:00 INFO]: Ana joined the game\n');
  const tailer = new LogTailer({ file: join(dir, 'latest.log'), pollMs: 60_000 });
  await tailer.poll();
  const app = buildApp({
    secret: rand(),
    queue: new PlayerQueue(),
    admin: {
      passwordHash: hashPassword(rand()), // a senha local é outra: só a borda autentica
      tailer,
      stats: new StatsSampler({ procDir: dir }),
      publicDir: dir,
      edgeSecret: EDGE_SECRET,
    },
  });
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    seen.push(url.pathname);
    const body = init.body ? await new Response(init.body).text() : undefined;
    const res = await app.inject({
      method: init.method ?? 'GET',
      url: url.pathname + url.search,
      headers: Object.fromEntries(new Headers(init.headers)),
      payload: body,
    });
    return new Response(res.body, {
      status: res.statusCode,
      headers: { 'content-type': String(res.headers['content-type'] ?? 'text/plain') },
    });
  };
  const cleanup = async () => {
    globalThis.fetch = realFetch;
    await app.close();
    await rm(dir, { recursive: true, force: true });
  };
  return { app, seen, cleanup };
}

const call = (e, path, init = {}) =>
  worker.fetch(new Request(`https://mine.example.test${path}`, init), e);

test('worker serves the public site, hides everything else and gates the panel API', async () => {
  const e = env();
  const { seen, cleanup } = await stack();
  try {
    const home = await call(e, '/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /site/);
    assert.equal((await call(e, '/admin')).status, 200);

    // Rotas HMAC do plugin e /health nunca passam pelo Worker.
    for (const path of ['/v1/server/heartbeat', '/health', '/v1/queue/status'])
      assert.equal((await call(e, path)).status, 404, path);
    assert.equal((await call(e, '/', { method: 'POST', body: '{}' })).status, 405);

    const before = seen.length;
    const blocked = await call(e, '/admin/api/snapshot');
    assert.equal(blocked.status, 401);
    assert.equal((await call(e, '/admin/api/stream')).status, 401);
    assert.equal(seen.length, before, 'unauthenticated requests never reach the origin');
    assert.deepEqual(await (await call(e, '/admin/api/me')).json(), { authenticated: false });
  } finally {
    await cleanup();
  }
});

test('login at the edge unlocks the panel through signed requests', async () => {
  const e = env();
  const { cleanup } = await stack();
  try {
    const bad = await call(e, '/admin/api/login', {
      method: 'POST',
      body: JSON.stringify({ password: WRONG }),
    });
    assert.equal(bad.status, 401);
    assert.equal(bad.headers.get('set-cookie'), null);

    const ok = await call(e, '/admin/api/login', {
      method: 'POST',
      body: JSON.stringify({ password: PASSWORD }),
    });
    assert.equal(ok.status, 200);
    const setCookie = ok.headers.get('set-cookie');
    assert.match(setCookie, /^__Host-mc_edge=/);
    for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/'])
      assert.ok(setCookie.includes(attr), attr);
    const cookie = setCookie.split(';')[0];

    assert.deepEqual(await (await call(e, '/admin/api/me', { headers: { cookie } })).json(), {
      authenticated: true,
    });
    const snap = await call(e, '/admin/api/snapshot', { headers: { cookie } });
    assert.equal(snap.status, 200, 'the API accepted the edge signature');
    assert.deepEqual((await snap.json()).server.online, ['Ana']);

    const forged = cookie.replace(/.$/, cookie.endsWith('0') ? '1' : '0');
    assert.equal(
      (await call(e, '/admin/api/snapshot', { headers: { cookie: forged } })).status,
      401,
    );
    // Outra instalação (outro SESSION_SECRET) não aceita este cookie.
    assert.equal(
      (await call({ ...e, SESSION_SECRET: rand() }, '/admin/api/snapshot', { headers: { cookie } }))
        .status,
      401,
    );
    // Trocar a senha (outro hash) invalida a sessão.
    assert.equal(
      (
        await call({ ...e, ADMIN_PASSWORD_HASH: edgeHash(rand()) }, '/admin/api/snapshot', {
          headers: { cookie },
        })
      ).status,
      401,
    );
  } finally {
    await cleanup();
  }
});

test('a client cannot forge the edge headers directly against the API', async () => {
  const { app, cleanup } = await stack();
  try {
    const ts = String(Date.now());
    const wrong = await app.inject({
      url: '/admin/api/snapshot',
      headers: { 'x-edge-ts': ts, 'x-edge-sig': 'a'.repeat(64) },
    });
    assert.equal(wrong.statusCode, 401);
    const right = await app.inject({
      url: '/admin/api/snapshot',
      headers: {
        'x-edge-ts': ts,
        'x-edge-sig': edgeSignature(EDGE_SECRET, ts, 'GET', '/admin/api/snapshot'),
      },
    });
    assert.equal(right.statusCode, 200);
  } finally {
    await cleanup();
  }
});

test('worker login is throttled after repeated failures', async () => {
  const e = env();
  const { cleanup } = await stack();
  try {
    const attempt = () =>
      call(e, '/admin/api/login', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.' + Math.floor(Math.random() * 200) },
        body: JSON.stringify({ password: WRONG }),
      });
    const headers = { 'cf-connecting-ip': '198.51.100.7' };
    const hit = () =>
      call(e, '/admin/api/login', {
        method: 'POST',
        headers,
        body: JSON.stringify({ password: WRONG }),
      });
    for (let i = 0; i < 5; i += 1) assert.equal((await hit()).status, 401);
    const blocked = await hit();
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    // Mesmo com a senha certa, enquanto bloqueado.
    const right = await call(e, '/admin/api/login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ password: PASSWORD }),
    });
    assert.equal(right.status, 429);
    // Outra origem não é afetada.
    assert.equal((await attempt()).status, 401);
  } finally {
    await cleanup();
  }
});
