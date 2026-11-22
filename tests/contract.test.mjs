import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DENY_MESSAGES,
  DENY_REASONS,
  allow,
  deny,
  normalizeUuid,
  parseAdmissionRequest,
  parseHeartbeat,
  parsePlayerIdentity,
  signRequest,
  verifyRequest,
} from '../packages/shared/dist/index.js';

const JAVA = { platform: 'java', uuid: '069A79F4-44E9-4726-A5BE-FCA90E38AAF5', name: 'Notch' };
const BEDROCK = {
  platform: 'bedrock',
  uuid: '00000000-0000-0000-0009-01f64f65c7c3',
  name: '.Teuzin',
};

test('normalizeUuid aceita com ou sem hífens e devolve minúsculas com hífens', () => {
  const canonical = '069a79f4-44e9-4726-a5be-fca90e38aaf5';
  assert.equal(normalizeUuid('069A79F4-44E9-4726-A5BE-FCA90E38AAF5'), canonical);
  assert.equal(normalizeUuid('069a79f444e94726a5befca90e38aaf5'), canonical);
  assert.equal(normalizeUuid('não-é-uuid'), null);
  assert.equal(normalizeUuid('069a79f4-44e9-4726-a5be-fca90e38aaf'), null);
});

test('parsePlayerIdentity normaliza o UUID e recusa entradas inválidas', () => {
  const parsed = parsePlayerIdentity(JAVA);
  assert.deepEqual(parsed, {
    ok: true,
    value: { platform: 'java', uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5', name: 'Notch' },
  });

  for (const bad of [
    null,
    'x',
    { ...JAVA, platform: 'console' },
    { ...JAVA, uuid: 'abc' },
    { ...JAVA, name: '' },
    { ...JAVA, name: 'a'.repeat(33) },
    { ...JAVA, name: 'a\nb' },
    { ...JAVA, name: 42 },
  ]) {
    assert.equal(parsePlayerIdentity(bad).ok, false, JSON.stringify(bad));
  }
});

test('parseAdmissionRequest exige player válido', () => {
  assert.equal(parseAdmissionRequest({ player: BEDROCK }).ok, true);
  assert.equal(parseAdmissionRequest({}).ok, false);
  assert.equal(parseAdmissionRequest(null).ok, false);
});

test('parseHeartbeat valida a lista e recusa UUID repetido', () => {
  const good = parseHeartbeat({ players: [JAVA, BEDROCK] });
  assert.equal(good.ok, true);
  assert.equal(good.value.players.length, 2);

  assert.equal(parseHeartbeat({ players: [] }).ok, true);
  assert.equal(parseHeartbeat({ players: 'x' }).ok, false);
  assert.equal(parseHeartbeat({ players: [JAVA, JAVA] }).ok, false);
  const invalid = parseHeartbeat({ players: [JAVA, { ...BEDROCK, name: '' }] });
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /players\[1\]/);
});

test('allow/deny montam respostas com mensagem em português', () => {
  assert.deepEqual(allow(), { decision: 'allow' });
  for (const reason of DENY_REASONS) {
    const response = deny(reason);
    assert.equal(response.decision, 'deny');
    assert.equal(response.reason, reason);
    assert.equal(response.message, DENY_MESSAGES[reason]);
    assert.ok(response.message.length > 10);
  }
});

test('HMAC: assinatura válida passa e qualquer alteração falha', () => {
  const secret = 'segredo-de-teste';
  const body = JSON.stringify({ player: JAVA });
  const now = 1_700_000_000_000;
  const signature = signRequest(secret, now, body);

  assert.match(signature, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    verifyRequest({ secret, timestampMs: now, body, signature, nowMs: now + 1000 }),
    { ok: true },
  );

  assert.deepEqual(
    verifyRequest({ secret: 'outro', timestampMs: now, body, signature, nowMs: now }),
    { ok: false, reason: 'BAD_SIGNATURE' },
  );
  assert.deepEqual(
    verifyRequest({ secret, timestampMs: now, body: body + ' ', signature, nowMs: now }),
    { ok: false, reason: 'BAD_SIGNATURE' },
  );
  assert.deepEqual(verifyRequest({ secret, timestampMs: now + 1, body, signature, nowMs: now }), {
    ok: false,
    reason: 'BAD_SIGNATURE',
  });
});

test('HMAC: timestamp fora da janela é recusado e formato ruim é MALFORMED', () => {
  const secret = 's';
  const body = '{}';
  const now = 1_700_000_000_000;
  const signature = signRequest(secret, now, body);

  assert.deepEqual(
    verifyRequest({ secret, timestampMs: now, body, signature, nowMs: now + 30_001 }),
    { ok: false, reason: 'STALE' },
  );
  assert.deepEqual(
    verifyRequest({ secret, timestampMs: now, body, signature, nowMs: now - 30_001 }),
    { ok: false, reason: 'STALE' },
  );
  assert.deepEqual(
    verifyRequest({ secret, timestampMs: now, body, signature, nowMs: now + 30_000 }),
    { ok: true },
  );
  assert.deepEqual(
    verifyRequest({ secret, timestampMs: now, body, signature, nowMs: now, toleranceMs: 10 }),
    { ok: true },
  );
  assert.deepEqual(
    verifyRequest({ secret, timestampMs: Number.NaN, body, signature, nowMs: now }),
    { ok: false, reason: 'MALFORMED' },
  );
  assert.deepEqual(verifyRequest({ secret, timestampMs: now, body, signature: 'zz', nowMs: now }), {
    ok: false,
    reason: 'MALFORMED',
  });
});
