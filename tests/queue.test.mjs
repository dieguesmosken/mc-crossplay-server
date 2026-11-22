import assert from 'node:assert/strict';
import test from 'node:test';

import { PlayerQueue } from '../packages/queue/dist/index.js';

let seq = 0;
function player(name, platform = 'java') {
  seq += 1;
  const hex = seq.toString(16).padStart(32, '0');
  return { platform, uuid: hex, name };
}

function makeClock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

function fill(queue, count) {
  const players = [];
  for (let index = 0; index < count; index += 1) {
    const p = player(`P${index}`);
    assert.equal(queue.admit(p).decision, 'allow');
    queue.playerJoined(p);
    players.push(p);
  }
  return players;
}

test('com vaga livre e fila vazia, qualquer jogador entra direto', () => {
  const queue = new PlayerQueue({ capacity: 2 });
  const a = player('A');
  assert.deepEqual(queue.admit(a), { decision: 'allow' });
  queue.playerJoined(a);
  assert.equal(queue.snapshot().online.length, 1);
});

test('o limite padrão é de 10 jogadores e o 11º é recusado', () => {
  const queue = new PlayerQueue();
  assert.equal(queue.capacity, 10);
  fill(queue, 10);
  const extra = player('Extra');
  const response = queue.admit(extra);
  assert.equal(response.decision, 'deny');
  assert.equal(response.reason, 'SERVER_FULL');
});

test('entrar na fila cheia dá posição e IN_QUEUE na admissão', () => {
  const queue = new PlayerQueue({ capacity: 1 });
  fill(queue, 1);
  const b = player('B');
  const c = player('C');
  assert.deepEqual(queue.join(b), { status: 'queued', position: 1 });
  assert.deepEqual(queue.join(c), { status: 'queued', position: 2 });
  assert.deepEqual(queue.join(b), { status: 'queued', position: 1 }, 'join é idempotente');
  assert.equal(queue.admit(b).reason, 'IN_QUEUE');
  assert.equal(queue.admit(c).reason, 'IN_QUEUE');
});

test('quando alguém sai, o primeiro da fila ganha reserva e só ele entra', () => {
  const clock = makeClock();
  const queue = new PlayerQueue({ capacity: 1, reservationTtlMs: 60_000, now: clock.now });
  const [a] = fill(queue, 1);
  const b = player('B');
  const c = player('C');
  queue.join(b);
  queue.join(c);

  queue.playerQuit(a);
  assert.deepEqual(queue.snapshot().reserved, [
    {
      uuid: b.uuid.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'),
      expiresAt: clock.now() + 60_000,
    },
  ]);
  assert.equal(queue.admit(b).decision, 'allow');
  assert.equal(queue.admit(c).reason, 'IN_QUEUE');
  assert.equal(queue.admit(player('Intruso')).reason, 'SERVER_FULL', 'furar a fila não funciona');

  queue.playerJoined(b);
  const snapshot = queue.snapshot();
  assert.equal(snapshot.online.length, 1);
  assert.equal(snapshot.reserved.length, 0);
  assert.equal(snapshot.waiting.length, 1);
});

test('reserva expirada passa a vaga para o próximo da fila', () => {
  const clock = makeClock();
  const queue = new PlayerQueue({ capacity: 1, reservationTtlMs: 60_000, now: clock.now });
  const [a] = fill(queue, 1);
  const b = player('B');
  const c = player('C');
  queue.join(b);
  queue.join(c);
  queue.playerQuit(a);

  clock.advance(59_999);
  queue.tick();
  assert.equal(queue.admit(b).decision, 'allow');

  clock.advance(1);
  queue.tick();
  assert.equal(queue.admit(b).decision, 'deny', 'B perdeu a vaga e não está mais na fila');
  assert.equal(queue.admit(c).decision, 'allow', 'C foi chamado');
});

test('quem desiste da reserva libera a vaga imediatamente', () => {
  const queue = new PlayerQueue({ capacity: 1 });
  const [a] = fill(queue, 1);
  const b = player('B');
  const c = player('C');
  queue.join(b);
  queue.join(c);
  queue.playerQuit(a);

  queue.leave(b);
  assert.equal(queue.admit(c).decision, 'allow');
});

test('join com vaga livre devolve reserva; online devolve online', () => {
  const clock = makeClock();
  const queue = new PlayerQueue({ capacity: 2, reservationTtlMs: 5_000, now: clock.now });
  const a = player('A');
  assert.deepEqual(queue.join(a), { status: 'reserved', expiresAt: clock.now() + 5_000 });
  queue.playerJoined(a);
  assert.deepEqual(queue.join(a), { status: 'online' });
});

test('online + reservas nunca passam da capacidade', () => {
  const clock = makeClock();
  const queue = new PlayerQueue({ capacity: 3, now: clock.now });
  const everyone = Array.from({ length: 8 }, (_, index) => player(`J${index}`));
  for (const p of everyone) queue.join(p);
  let snapshot = queue.snapshot();
  assert.equal(snapshot.online.length + snapshot.reserved.length, 3);
  assert.equal(snapshot.waiting.length, 5);

  for (const p of everyone.slice(0, 3)) queue.playerJoined(p);
  queue.playerQuit(everyone[0]);
  snapshot = queue.snapshot();
  assert.ok(snapshot.online.length + snapshot.reserved.length <= 3);
  assert.equal(snapshot.waiting.length, 4);
});

test('sync remove quem caiu e inclui quem o plugin liberou por conta própria', () => {
  const queue = new PlayerQueue({ capacity: 2 });
  const a = player('A');
  const b = player('B');
  const op = player('Op');
  queue.playerJoined(a);
  queue.playerJoined(b);
  const waiting = player('Espera');
  queue.join(waiting);

  queue.sync([a, op]);
  const snapshot = queue.snapshot();
  assert.equal(snapshot.online.length, 2, 'B saiu, Op entrou');
  assert.equal(snapshot.reserved.length, 0);
  assert.equal(queue.admit(waiting).reason, 'IN_QUEUE');
  assert.equal(queue.admit(b).reason, 'SERVER_FULL');

  queue.sync([op]);
  assert.equal(
    queue.admit(waiting).decision,
    'allow',
    'vaga aberta virou reserva do primeiro da fila',
  );
});

test('sync consome a reserva de quem entrou', () => {
  const queue = new PlayerQueue({ capacity: 1 });
  const a = player('A');
  queue.join(a);
  assert.equal(queue.snapshot().reserved.length, 1);
  queue.sync([a]);
  assert.equal(queue.snapshot().reserved.length, 0);
  assert.equal(queue.snapshot().online.length, 1);
});

test('UUID é comparado normalizado (maiúsculas e hífens não duplicam o jogador)', () => {
  const queue = new PlayerQueue({ capacity: 1 });
  const base = '069a79f444e94726a5befca90e38aaf5';
  const lower = { platform: 'java', uuid: base, name: 'N' };
  const upper = { platform: 'java', uuid: '069A79F4-44E9-4726-A5BE-FCA90E38AAF5', name: 'N' };
  queue.playerJoined(lower);
  assert.equal(queue.admit(upper).decision, 'allow');
  queue.playerJoined(upper);
  assert.equal(queue.snapshot().online.length, 1);
});

test('opções inválidas e UUID inválido falham de forma explícita', () => {
  assert.throws(() => new PlayerQueue({ capacity: 0 }), RangeError);
  assert.throws(() => new PlayerQueue({ capacity: 1.5 }), RangeError);
  assert.throws(() => new PlayerQueue({ reservationTtlMs: 0 }), RangeError);
  assert.throws(
    () => new PlayerQueue().admit({ platform: 'java', uuid: 'x', name: 'N' }),
    TypeError,
  );
});
