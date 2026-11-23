import { fail, ok, type Result } from './result.js';

export const PLATFORMS = ['java', 'bedrock'] as const;
export type Platform = (typeof PLATFORMS)[number];

/**
 * Identidade de um jogador como o servidor Paper a enxerga.
 * - Java: UUID da conta (ou offline-mode, se o servidor estiver assim).
 * - Bedrock: UUID gerado pelo Floodgate e nome com o prefixo configurado lá.
 */
export interface PlayerIdentity {
  readonly platform: Platform;
  readonly uuid: string;
  readonly name: string;
}

const UUID_HEX = /^[0-9a-f]{32}$/;
const NAME_MAX_LENGTH = 32;

/** Devolve o UUID em minúsculas com hífens (8-4-4-4-12) ou null se for inválido. */
export function normalizeUuid(value: string): string | null {
  const hex = value.trim().toLowerCase().replaceAll('-', '');
  if (!UUID_HEX.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);
}

function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function parsePlayerIdentity(input: unknown): Result<PlayerIdentity> {
  if (typeof input !== 'object' || input === null) return fail('player deve ser um objeto');
  const raw = input as Record<string, unknown>;

  if (!isPlatform(raw.platform)) return fail('player.platform deve ser "java" ou "bedrock"');
  if (typeof raw.uuid !== 'string') return fail('player.uuid deve ser texto');
  const uuid = normalizeUuid(raw.uuid);
  if (uuid === null) return fail('player.uuid não é um UUID válido');

  if (typeof raw.name !== 'string') return fail('player.name deve ser texto');
  const name = raw.name.trim();
  if (name.length === 0 || name.length > NAME_MAX_LENGTH || hasControlCharacters(name)) {
    return fail(
      `player.name deve ter de 1 a ${NAME_MAX_LENGTH} caracteres, sem caracteres de controle`,
    );
  }

  return ok({ platform: raw.platform, uuid, name });
}
