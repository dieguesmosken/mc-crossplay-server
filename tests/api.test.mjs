import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PlayerQueue } from '../packages/queue/dist/index.js';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, signRequest } from '../packages/shared/dist/index.js';
import { QueueStore, buildApp } from '../apps/api/dist/index.js';

const SECRET = 'segredo-de-teste-com-16+';
const NOW = 1_700_000_000_000;

let seq = 0;
function player(name, platform = 'java') {
  seq += 1;
  return { platform, uuid: seq.toString(16).padStart(32, '0'), name };
}

function setup({ capacity = 2, store } = {}) {
  const clock = { now: NOW };
  const queue = new PlayerQueue({ capacity, now: () => clock.now });
  const app = buildApp({
    secret: SECRET,
    queue,
    now: () => clock.now,
    ...(store ? { store } : {}),
  });
  return { app, queue, clock };
}

function signed(path, payload, { secret = SECRET, timestamp = NOW } = {}) {
  const body = JSON.stringify(payload);
  return {
    method: 'POST',
    url: path,
    headers: {
      'content-type': 'application/json',
      [TIMESTAMP_HEADER]: String(timestamp),
      [SIGNATURE_HEADER]: signRequest(secret, timestamp, body),
    },
    payload: body,
  };
}

test('GET /health responde ok', async () => {
  const { app } = setup();
  const response = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok' });
});

test('segredo curto é recusado na criação', () => {
  assert.throws(() => buildApp({ secret: 'curto', queue: new PlayerQueue() }), /16 caracteres/);
});

test('rotas do plugin exigem assinatura válida', async () => {
  const { app } = setup();
  const body = JSON.stringify({ player: player('A') });

  const noHeaders = await app.inject({
    method: 'POST',
    url: '/v1/server/admissions',
    headers: { 'content-type': 'application/json' },
    payload: body,
  });
  assert.equal(noHeaders.statusCode, 401);

  const wrongSecret = await app.inject(
    signed('/v1/server/admissions', { player: player('A') }, { secret: 'outro-segredo-qualquer' }),
  );
  assert.equal(wrongSecret.statusCode, 401);
  assert.equal(wrongSecret.json().reason, 'BAD_SIGNATURE');

  const stale = await app.inject(
    signed('/v1/server/admissions', { player: player('A') }, { timestamp: NOW - 60_000 }),
  );
  assert.equal(stale.statusCode, 401);
  assert.equal(stale.json().reason, 'STALE');

  const tampered = signed('/v1/server/admissions', { player: player('A') });
  tampered.payload = tampered.payload.replace('"A"', '"B"');
  assert.equal((await app.inject(tampered)).statusCode, 401);
});

test('admissions libera com vaga e recusa quando cheio, com mensagem em português', async () => {
  const { app, queue } = setup({ capacity: 1 });
  const a = player('A');
  const b = player('B');

  const first = await app.inject(signed('/v1/server/admissions', { player: a }));
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.json(), { decision: 'allow' });

  await app.inject(signed('/v1/server/events', { type: 'join', player: a }));
  assert.equal(queue.snapshot().online.length, 1);

  const second = await app.inject(signed('/v1/server/admissions', { player: b }));
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().decision, 'deny');
  assert.equal(second.json().reason, 'SERVER_FULL');
  assert.match(second.json().message, /cheio/);
});

test('corpo inválido gera 400 (depois da autenticação)', async () => {
  const { app } = setup();
  const bad = await app.inject(
    signed('/v1/server/admissions', { player: { platform: 'java', uuid: 'x', name: 'A' } }),
  );
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.json().error, 'bad_request');

  const badEvent = await app.inject(
    signed('/v1/server/events', { type: 'kick', player: player('A') }),
  );
  assert.equal(badEvent.statusCode, 400);

  const rawBody = '{nao e json';
  const badJson = await app.inject({
    method: 'POST',
    url: '/v1/server/heartbeat',
    headers: {
      'content-type': 'application/json',
      [TIMESTAMP_HEADER]: String(NOW),
      [SIGNATURE_HEADER]: signRequest(SECRET, NOW, rawBody),
    },
    payload: rawBody,
  });
  assert.equal(badJson.statusCode, 400);
});

test('fluxo completo: fila pelo site, vaga liberada, reserva, entrada', async () => {
  const { app, queue, clock } = setup({ capacity: 1 });
  const a = player('A');
  const b = player('B');
  await app.inject(signed('/v1/server/events', { type: 'join', player: a }));

  const joined = await app.inject({
    method: 'POST',
    url: '/v1/queue/join',
    payload: { player: b },
  });
  assert.deepEqual(joined.json(), { status: 'queued', position: 1 });

  const waiting = await app.inject({ method: 'GET', url: `/v1/queue/status?uuid=${b.uuid}` });
  assert.deepEqual(waiting.json(), { status: 'queued', position: 1 });

  await app.inject(signed('/v1/server/events', { type: 'quit', player: a }));
  const reserved = await app.inject({ method: 'GET', url: `/v1/queue/status?uuid=${b.uuid}` });
  assert.equal(reserved.json().status, 'reserved');
  assert.equal(reserved.json().expiresAt, clock.now + queue.reservationTtlMs);

  const admission = await app.inject(signed('/v1/server/admissions', { player: b }));
  assert.equal(admission.json().decision, 'allow');
  await app.inject(signed('/v1/server/events', { type: 'join', player: b }));

  const online = await app.inject({ method: 'GET', url: `/v1/queue/status?uuid=${b.uuid}` });
  assert.deepEqual(online.json(), { status: 'online' });
});

test('leave tira da fila e status valida o uuid', async () => {
  const { app } = setup({ capacity: 1 });
  const a = player('A');
  const b = player('B');
  await app.inject(signed('/v1/server/events', { type: 'join', player: a }));
  await app.inject({ method: 'POST', url: '/v1/queue/join', payload: { player: b } });
  await app.inject({ method: 'POST', url: '/v1/queue/leave', payload: { player: b } });

  const status = await app.inject({ method: 'GET', url: `/v1/queue/status?uuid=${b.uuid}` });
  assert.deepEqual(status.json(), { status: 'none' });

  assert.equal((await app.inject({ method: 'GET', url: '/v1/queue/status' })).statusCode, 400);
  assert.equal(
    (await app.inject({ method: 'GET', url: '/v1/queue/status?uuid=xyz' })).statusCode,
    400,
  );
});

test('heartbeat reconcilia a presença', async () => {
  const { app, queue } = setup({ capacity: 3 });
  const a = player('A');
  const b = player('B');
  await app.inject(signed('/v1/server/events', { type: 'join', player: a }));
  await app.inject(signed('/v1/server/events', { type: 'join', player: b }));

  const response = await app.inject(signed('/v1/server/heartbeat', { players: [b] }));
  assert.equal(response.statusCode, 200);
  assert.equal(queue.snapshot().online.length, 1);

  assert.equal(
    (await app.inject(signed('/v1/server/heartbeat', { players: [b, b] }))).statusCode,
    400,
  );
});

test('o estado sobrevive a reinício via SQLite', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mc-api-'));
  const path = join(dir, 'api.sqlite');
  try {
    const store = new QueueStore(path);
    const { app } = setup({ capacity: 1, store });
    const a = player('A');
    const b = player('B');
    await app.inject(signed('/v1/server/events', { type: 'join', player: a }));
    await app.inject({ method: 'POST', url: '/v1/queue/join', payload: { player: b } });
    await app.close();
    store.close();

    const reopened = new QueueStore(path);
    const snapshot = reopened.load();
    assert.ok(snapshot);
    const queue = new PlayerQueue({ capacity: 1, now: () => NOW });
    queue.restore(snapshot);
    assert.equal(queue.snapshot().online.length, 1);
    assert.deepEqual(queue.statusOf(b.uuid), { status: 'queued', position: 1 });
    reopened.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('QueueStore em memória começa vazio e restore descarta reservas vencidas', () => {
  const store = new QueueStore(':memory:');
  assert.equal(store.load(), null);
  store.close();

  const uuid = (n) => n.toString(16).padStart(32, '0');
  const queue = new PlayerQueue({ capacity: 1, now: () => NOW });
  queue.restore({
    capacity: 1,
    online: [],
    reserved: [{ uuid: uuid(1), expiresAt: NOW - 1 }],
    waiting: [uuid(2)],
  });
  assert.deepEqual(
    queue.snapshot().reserved.map((r) => r.uuid),
    [uuid(2).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')],
  );
});
