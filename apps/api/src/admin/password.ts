import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Formato do hash: scrypt:<log2N>:<r>:<p>:<sal em hex>:<hash em hex>
// Sem "$" de propósito: o Docker Compose interpreta "$" em valores do .env.
const LOG2_N = 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const MAX_PASSWORD_LENGTH = 256;
export const MIN_PASSWORD_LENGTH = 12;

function derive(password: string, salt: Buffer, log2n: number, r: number, p: number): Buffer {
  return scryptSync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: 2 ** log2n,
    r,
    p,
    maxmem: 128 * 1024 * 1024,
  });
}

export function hashPassword(password: string): string {
  if (password.length < MIN_PASSWORD_LENGTH)
    throw new RangeError(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
  if (password.length > MAX_PASSWORD_LENGTH) throw new RangeError('Senha longa demais');
  const salt = randomBytes(16);
  const hash = derive(password, salt, LOG2_N, R, P);
  return `scrypt:${LOG2_N}:${R}:${P}:${salt.toString('hex')}:${hash.toString('hex')}`;
}

interface ParsedHash {
  readonly log2n: number;
  readonly r: number;
  readonly p: number;
  readonly salt: Buffer;
  readonly hash: Buffer;
}

export function parsePasswordHash(value: string): ParsedHash | null {
  const parts = value.split(':');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [, n, r, p, saltHex, hashHex] = parts as [string, string, string, string, string, string];
  const log2n = Number(n);
  const rr = Number(r);
  const pp = Number(p);
  if (!Number.isInteger(log2n) || log2n < 12 || log2n > 20) return null;
  if (!Number.isInteger(rr) || rr < 1 || rr > 32) return null;
  if (!Number.isInteger(pp) || pp < 1 || pp > 4) return null;
  if (!/^[0-9a-f]{32}$/.test(saltHex) || !/^[0-9a-f]{64}$/.test(hashHex)) return null;
  return {
    log2n,
    r: rr,
    p: pp,
    salt: Buffer.from(saltHex, 'hex'),
    hash: Buffer.from(hashHex, 'hex'),
  };
}

export function isValidPasswordHash(value: string): boolean {
  return parsePasswordHash(value) !== null;
}

/** Compara em tempo constante. Nunca lança: entrada inválida é simplesmente "não confere". */
export function verifyPassword(password: string, stored: string): boolean {
  const parsed = parsePasswordHash(stored);
  if (parsed === null || password.length === 0 || password.length > MAX_PASSWORD_LENGTH)
    return false;
  const candidate = derive(password, parsed.salt, parsed.log2n, parsed.r, parsed.p);
  return timingSafeEqual(candidate, parsed.hash);
}
