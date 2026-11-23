import assert from 'node:assert/strict';
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PlayerQueue } from '../packages/queue/dist/index.js';
import { buildApp } from '../apps/api/dist/index.js';
import { LogParser } from '../apps/api/dist/admin/logparser.js';
import { LogTailer } from '../apps/api/dist/admin/logtail.js';
import { LoginLimiter } from '../apps/api/dist/admin/limiter.js';
import {
  hashPassword,
  isValidPasswordHash,
  verifyPassword,
} from '../apps/api/dist/admin/password.js';
import {
  createSessionToken,
  readCookie,
  verifySessionToken,
} from '../apps/api/dist/admin/session.js';
import {
  cpuPercent,
  parseCpuStat,
  parseLoadavg,
  parseMeminfo,
  StatsSampler,
} from '../apps/api/dist/admin/stats.js';

const PASSWORD = 'uma senha bem comprida 123';
const SECRET = 'segredo-de-teste-com-mais-de-16';

test('password hash verifies the right password and rejects the others', () => {
  const hash = hashPassword(PASSWORD);
  assert.ok(isValidPasswordHash(hash));
  assert.ok(!hash.includes('$'), 'no $ so docker compose does not interpolate it');
  assert.ok(!hash.includes(PASSWORD));
  assert.ok(verifyPassword(PASSWORD, hash));
  assert.ok(!verifyPassword(PASSWORD + 'x', hash));
  assert.ok(!verifyPassword('', hash));
  assert.ok(!verifyPassword(PASSWORD, 'lixo'));
  assert.notEqual(hash, hashPassword(PASSWORD), 'each hash has its own salt');
  assert.throws(() => hashPassword('curta'));
});

test('session token expires and rejects tampering and other keys', () => {
  const t0 = 1_700_000_000_000;
  const token = createSessionToken('k1', t0, 5_000);
  assert.ok(verifySessionToken('k1', token, t0 + 1_000));
  assert.ok(!verifySessionToken('k1', token, t0 + 6_000), 'expired');
  assert.ok(!verifySessionToken('k2', token, t0 + 1_000), 'wrong key');
  assert.ok(!verifySessionToken('k1', token.slice(0, -2) + 'aa', t0 + 1_000), 'tampered');
  assert.ok(!verifySessionToken('k1', '', t0 + 1_000));
  assert.equal(readCookie('a=1; mc_admin=xyz; b=2', 'mc_admin'), 'xyz');
  assert.equal(readCookie(undefined, 'mc_admin'), undefined);
});

test('login limiter blocks after repeated failures and resets on success', () => {
  const limiter = new LoginLimiter(3, 60_000);
  for (let i = 0; i < 3; i += 1) {
    assert.equal(limiter.retryAfterSeconds('ip', 0), 0);
    limiter.fail('ip', 0);
  }
  assert.ok(limiter.retryAfterSeconds('ip', 1_000) > 0);
  assert.equal(limiter.retryAfterSeconds('outro', 1_000), 0);
  assert.equal(limiter.retryAfterSeconds('ip', 61_000), 0, 'window passed');
  limiter.fail('ip', 70_000);
  limiter.reset('ip');
  assert.equal(limiter.retryAfterSeconds('ip', 70_000), 0);
});

test('log parser classifies joins, leaves, chat, advancements, deaths and server state', () => {
  const p = new LogParser();
  const feed = (l) => p.feed(l);
  assert.equal(feed('[10:00:00 INFO]: Done (5.2s)! For help, type "help"').kind, 'server');
  assert.equal(p.state, 'ready');
  const join = feed('[10:01:00 INFO]: .TeuzinYTBR joined the game');
  assert.deepEqual([join.kind, join.player], ['join', '.TeuzinYTBR']);
  feed('[10:01:05 INFO]: Steve joined the game');
  assert.deepEqual([...p.online].sort(), ['.TeuzinYTBR', 'Steve']);
  const chat = feed('[10:02:00 INFO]: <Steve> oi <b>pessoal</b>');
  assert.deepEqual([chat.kind, chat.player, chat.text], ['chat', 'Steve', 'oi <b>pessoal</b>']);
  assert.equal(
    feed('[10:03:00 INFO]: Steve has made the advancement [Stone Age]').kind,
    'advancement',
  );
  assert.equal(feed('[10:04:00 INFO]: Steve was slain by Zombie').kind, 'death');
  assert.equal(feed('[10:04:30 INFO]: Steve fell from a high place').kind, 'death');
  assert.equal(feed('[10:05:00 INFO]: Steve issued server command: /gamemode').kind, 'command');
  // "Steve" fora da lista de online não vira morte por engano.
  assert.equal(feed('[10:05:10 INFO]: Alex was slain by Zombie').kind, 'info');
  assert.equal(feed("[10:06:00 WARN]: Can't keep up!").kind, 'warn');
  const err = feed('[10:07:00 ERROR]: Boom');
  assert.equal(err.kind, 'error');
  assert.equal(feed('\tat java.base/Foo.bar(Foo.java:1)'), null);
  assert.match(err.detail, /Foo\.bar/);
  feed('[10:08:00 INFO]: Steve left the game');
  assert.deepEqual([...p.online], ['.TeuzinYTBR']);
  assert.equal(feed('[10:09:00 INFO]: Stopping the server').kind, 'server');
  assert.equal(p.state, 'stopping');
  assert.equal(feed(''), null);
  assert.equal(feed('\u001b[32m[10:10:00 INFO]: Hello\u001b[0m').kind, 'info', 'ANSI removed');
});

test('log tailer reads new lines, keeps partial lines and survives truncation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tail-'));
  const file = join(dir, 'latest.log');
  try {
    const tailer = new LogTailer({ file, pollMs: 60_000 });
    await tailer.poll();
    assert.equal(tailer.fileExists, false);

    await writeFile(file, '[10:00:00 INFO]: Ana joined the game\n[10:00:01 INFO]: Be');
    await tailer.poll();
    assert.equal(tailer.fileExists, true);
    assert.deepEqual([...tailer.online], ['Ana']);
    assert.equal(tailer.recent().length, 1, 'partial line waits');

    const seen = [];
    tailer.subscribe((e) => seen.push(e.kind));
    await appendFile(file, 'to joined the game\n[10:00:02 INFO]: Ana left the game\n');
    await tailer.poll();
    assert.deepEqual(seen, ['join', 'leave']);
    assert.deepEqual([...tailer.online], ['Beto']);

    // Servidor reiniciou: arquivo menor que o deslocamento.
    await writeFile(file, '[11:00:00 INFO]: Ze joined the game\n');
    await tailer.poll();
    assert.deepEqual([...tailer.online], ['Ze']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('stats parsers compute CPU %, memory and load from /proc text', async () => {
  const a = parseCpuStat('cpu  100 0 100 800 0 0 0 0 0 0\ncpu0 1 1 1 1');
  const b = parseCpuStat('cpu  200 0 200 1000 0 0 0 0 0 0');
  assert.equal(cpuPercent(a, b), 50);
  assert.equal(cpuPercent(a, a), 0);
  assert.equal(parseCpuStat('nada'), null);
  const mem = parseMeminfo('MemTotal:       1000 kB\nMemFree: 10 kB\nMemAvailable:    250 kB\n');
  assert.deepEqual(mem, { totalBytes: 1000 * 1024, availableBytes: 250 * 1024 });
  assert.equal(parseMeminfo('MemTotal: 1 kB'), null);
  assert.deepEqual(parseLoadavg('0.50 1.00 1.50 1/200 123'), [0.5, 1, 1.5]);

  const dir = await mkdtemp(join(tmpdir(), 'proc-'));
  try {
    await writeFile(join(dir, 'stat'), 'cpu  100 0 100 800 0 0 0 0\n');
    await writeFile(join(dir, 'meminfo'), 'MemTotal: 2000 kB\nMemAvailable: 500 kB\n');
    await writeFile(join(dir, 'loadavg'), '0.1 0.2 0.3 1/1 1\n');
    await writeFile(join(dir, 'uptime'), '3600.50 100.00\n');
    const sampler = new StatsSampler({ procDir: dir, diskPath: dir });
    await sampler.sample();
    await writeFile(join(dir, 'stat'), 'cpu  200 0 200 1000 0 0 0 0\n');
    await sampler.sample();
    const s = sampler.snapshot();
    assert.equal(s.cpu.percent, 50);
    assert.equal(s.memory.percent, 75);
    assert.equal(s.uptimeSeconds, 3600);
    assert.ok(s.disk.totalBytes > 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function adminApp() {
  const dir = await mkdtemp(join(tmpdir(), 'admin-'));
  const file = join(dir, 'latest.log');
  await writeFile(file, '[10:00:00 INFO]: Ana joined the game\n');
  await writeFile(join(dir, 'index.html'), '<h1>site</h1>');
  await writeFile(join(dir, 'admin.html'), '<h1>admin</h1>');
  await writeFile(join(dir, 'segredo.txt'), 'não deve vazar');
  const tailer = new LogTailer({ file, pollMs: 60_000 });
  await tailer.poll();
  const stats = new StatsSampler({ procDir: dir });
  const hash = hashPassword(PASSWORD);
  const app = buildApp({
    secret: SECRET,
    queue: new PlayerQueue(),
    admin: { passwordHash: hash, tailer, stats, publicDir: dir },
  });
  return { app, dir };
}

const cookieOf = (res) => res.headers['set-cookie'].split(';')[0];

test('admin pages are public but the panel API needs the password', async () => {
  const { app, dir } = await adminApp();
  try {
    const home = await app.inject({ url: '/' });
    assert.equal(home.statusCode, 200);
    assert.match(home.headers['content-security-policy'], /default-src 'none'/);
    assert.equal(home.headers['x-content-type-options'], 'nosniff');
    assert.equal((await app.inject({ url: '/admin' })).statusCode, 200);
    assert.equal((await app.inject({ url: '/segredo.txt' })).statusCode, 404);
    assert.equal((await app.inject({ url: '/assets/../segredo.txt' })).statusCode, 404);

    for (const url of ['/admin/api/snapshot', '/admin/api/stream'])
      assert.equal((await app.inject({ url })).statusCode, 401, url);
    assert.deepEqual((await app.inject({ url: '/admin/api/me' })).json(), { authenticated: false });

    const bad = await app.inject({
      method: 'POST',
      url: '/admin/api/login',
      payload: { password: 'errada errada errada' },
    });
    assert.equal(bad.statusCode, 401);
    assert.equal(bad.headers['set-cookie'], undefined);

    const ok = await app.inject({
      method: 'POST',
      url: '/admin/api/login',
      payload: { password: PASSWORD },
    });
    assert.equal(ok.statusCode, 200);
    assert.match(ok.headers['set-cookie'], /HttpOnly/);
    assert.match(ok.headers['set-cookie'], /SameSite=Strict/);
    const cookie = cookieOf(ok);

    const snap = await app.inject({ url: '/admin/api/snapshot', headers: { cookie } });
    assert.equal(snap.statusCode, 200);
    assert.deepEqual(snap.json().server.online, ['Ana']);
    assert.equal(snap.headers['cache-control'], 'no-store');
    assert.ok(!JSON.stringify(snap.json()).includes(PASSWORD));

    const forged = await app.inject({
      url: '/admin/api/snapshot',
      headers: { cookie: 'mc_admin=' + cookie.split('=')[1].replace(/.$/, 'x') },
    });
    assert.equal(forged.statusCode, 401);

    await app.inject({ method: 'POST', url: '/admin/api/logout' });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('login is rate limited per client', async () => {
  const { app, dir } = await adminApp();
  try {
    const attempt = () =>
      app.inject({
        method: 'POST',
        url: '/admin/api/login',
        payload: { password: 'nao-e-essa-123' },
      });
    for (let i = 0; i < 5; i += 1) assert.equal((await attempt()).statusCode, 401);
    const blocked = await attempt();
    assert.equal(blocked.statusCode, 429);
    assert.ok(Number(blocked.headers['retry-after']) > 0);
    // Mesmo com a senha certa, enquanto bloqueado.
    const right = await app.inject({
      method: 'POST',
      url: '/admin/api/login',
      payload: { password: PASSWORD },
    });
    assert.equal(right.statusCode, 429);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('without an admin config the API has no panel routes', async () => {
  const app = buildApp({ secret: SECRET, queue: new PlayerQueue() });
  try {
    assert.equal((await app.inject({ url: '/' })).statusCode, 404);
    assert.equal((await app.inject({ url: '/admin/api/snapshot' })).statusCode, 404);
    assert.equal((await app.inject({ url: '/health' })).statusCode, 200);
  } finally {
    await app.close();
  }
});
