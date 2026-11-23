import { createHmac, timingSafeEqual } from 'node:crypto';

export const EDGE_TS_HEADER = 'x-edge-ts';
export const EDGE_SIG_HEADER = 'x-edge-sig';
export const EDGE_TOLERANCE_MS = 60_000;
export const MIN_EDGE_SECRET_LENGTH = 32;

/** Assinatura que o Worker (apps/edge-gateway) põe em cada pedido repassado ao painel. */
export function edgeSignature(secret: string, ts: string, method: string, url: string): string {
  return createHmac('sha256', secret).update(`${ts}.${method.toUpperCase()}.${url}`).digest('hex');
}

export function verifyEdgeRequest(
  secret: string,
  input: { ts: string | undefined; sig: string | undefined; method: string; url: string },
  nowMs: number,
): boolean {
  const { ts, sig } = input;
  if (ts === undefined || sig === undefined) return false;
  if (!/^\d{10,16}$/.test(ts) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  if (Math.abs(nowMs - Number(ts)) > EDGE_TOLERANCE_MS) return false;
  const expected = Buffer.from(edgeSignature(secret, ts, input.method, input.url), 'hex');
  const given = Buffer.from(sig, 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
