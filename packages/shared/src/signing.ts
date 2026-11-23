import { createHmac, timingSafeEqual } from 'node:crypto';

export const TIMESTAMP_HEADER = 'x-mc-timestamp';
export const SIGNATURE_HEADER = 'x-mc-signature';
export const DEFAULT_TOLERANCE_MS = 30_000;

/**
 * Assinatura HMAC-SHA256 de `${timestampMs}.${body}`, em hexadecimal.
 * O segredo vem só de variável de ambiente; nunca vai para o Git.
 */
export function signRequest(secret: string, timestampMs: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestampMs}.${body}`).digest('hex');
}

export type VerifyFailure = 'MALFORMED' | 'STALE' | 'BAD_SIGNATURE';

export interface VerifyInput {
  readonly secret: string;
  readonly timestampMs: number;
  readonly body: string;
  readonly signature: string;
  readonly nowMs: number;
  readonly toleranceMs?: number;
}

/**
 * Limitação conhecida: dentro da janela de tolerância um pedido idêntico pode ser
 * repetido. A API deve tratar as operações como idempotentes (admitir o mesmo
 * jogador duas vezes não muda o estado).
 */
export function verifyRequest(
  input: VerifyInput,
): { readonly ok: true } | { readonly ok: false; readonly reason: VerifyFailure } {
  const { secret, timestampMs, body, signature, nowMs, toleranceMs = DEFAULT_TOLERANCE_MS } = input;

  if (!Number.isFinite(timestampMs) || !/^[0-9a-f]{64}$/.test(signature)) {
    return { ok: false, reason: 'MALFORMED' };
  }
  if (Math.abs(nowMs - timestampMs) > toleranceMs) {
    return { ok: false, reason: 'STALE' };
  }

  const expected = Buffer.from(signRequest(secret, timestampMs, body), 'hex');
  const received = Buffer.from(signature, 'hex');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }
  return { ok: true };
}
