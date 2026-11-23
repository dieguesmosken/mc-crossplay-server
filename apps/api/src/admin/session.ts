import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'mc_admin';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function key(secret: string): Buffer {
  // Chave própria da sessão, derivada do segredo da API (o segredo em si nunca assina cookies).
  return createHmac('sha256', secret).update('mc-admin-session-v1').digest();
}

function sign(secret: string, payload: string): string {
  return createHmac('sha256', key(secret)).update(payload).digest('hex');
}

/** Token: <expira em ms>.<nonce>.<assinatura hex> */
export function createSessionToken(secret: string, nowMs: number, ttlMs = SESSION_TTL_MS): string {
  const payload = `${nowMs + ttlMs}.${randomBytes(12).toString('hex')}`;
  return `${payload}.${sign(secret, payload)}`;
}

export function verifySessionToken(secret: string, token: string, nowMs: number): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expires, nonce, signature] = parts as [string, string, string];
  if (!/^\d{10,16}$/.test(expires) || !/^[0-9a-f]{24}$/.test(nonce)) return false;
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = Buffer.from(sign(secret, `${expires}.${nonce}`), 'hex');
  const given = Buffer.from(signature, 'hex');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  return Number(expires) > nowMs;
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

export function sessionCookie(token: string, secure: boolean, maxAgeSeconds: number): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function clearedCookie(secure: boolean): string {
  return sessionCookie('', secure, 0);
}
