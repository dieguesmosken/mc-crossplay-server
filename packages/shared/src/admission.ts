import { parsePlayerIdentity, type PlayerIdentity } from './identity.js';
import { fail, ok, type Result } from './result.js';

/** Motivos de recusa. O plugin mostra a mensagem em PT-BR devolvida pela API. */
export const DENY_REASONS = ['SERVER_FULL', 'IN_QUEUE', 'NOT_ALLOWED'] as const;
export type DenyReason = (typeof DENY_REASONS)[number];

export const DENY_MESSAGES: Readonly<Record<DenyReason, string>> = {
  SERVER_FULL: 'O servidor está cheio. Entre na fila pelo site e aguarde a sua vez.',
  IN_QUEUE:
    'Você está na fila. Aguarde ser chamado pelo site e tente conectar quando a vaga for liberada.',
  NOT_ALLOWED: 'Você não tem permissão para entrar neste servidor.',
};

export function isDenyReason(value: unknown): value is DenyReason {
  return typeof value === 'string' && (DENY_REASONS as readonly string[]).includes(value);
}

/** POST /v1/server/admissions — o plugin pergunta se o jogador pode entrar. */
export interface AdmissionRequest {
  readonly player: PlayerIdentity;
}

export type AdmissionResponse =
  | { readonly decision: 'allow' }
  | { readonly decision: 'deny'; readonly reason: DenyReason; readonly message: string };

export function allow(): AdmissionResponse {
  return { decision: 'allow' };
}

export function deny(reason: DenyReason): AdmissionResponse {
  return { decision: 'deny', reason, message: DENY_MESSAGES[reason] };
}

/** POST /v1/server/heartbeat — o plugin informa quem está online (reconciliação). */
export interface Heartbeat {
  readonly players: readonly PlayerIdentity[];
}

export function parseAdmissionRequest(input: unknown): Result<AdmissionRequest> {
  if (typeof input !== 'object' || input === null) return fail('corpo deve ser um objeto');
  const player = parsePlayerIdentity((input as Record<string, unknown>).player);
  if (!player.ok) return player;
  return ok({ player: player.value });
}

export const HEARTBEAT_MAX_PLAYERS = 200;

export function parseHeartbeat(input: unknown): Result<Heartbeat> {
  if (typeof input !== 'object' || input === null) return fail('corpo deve ser um objeto');
  const players = (input as Record<string, unknown>).players;
  if (!Array.isArray(players)) return fail('players deve ser uma lista');
  if (players.length > HEARTBEAT_MAX_PLAYERS)
    return fail(`players excede o limite de ${HEARTBEAT_MAX_PLAYERS}`);

  const parsed: PlayerIdentity[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of players.entries()) {
    const player = parsePlayerIdentity(entry);
    if (!player.ok) return fail(`players[${index}]: ${player.error}`);
    if (seen.has(player.value.uuid)) return fail(`players[${index}]: UUID repetido`);
    seen.add(player.value.uuid);
    parsed.push(player.value);
  }
  return ok({ players: parsed });
}

/** POST /v1/server/events — o plugin avisa que um jogador entrou ou saiu de fato. */
export const SERVER_EVENT_TYPES = ['join', 'quit'] as const;
export type ServerEventType = (typeof SERVER_EVENT_TYPES)[number];

export interface ServerEvent {
  readonly type: ServerEventType;
  readonly player: PlayerIdentity;
}

export function parseServerEvent(input: unknown): Result<ServerEvent> {
  if (typeof input !== 'object' || input === null) return fail('corpo deve ser um objeto');
  const raw = input as Record<string, unknown>;
  const type = raw.type;
  if (type !== 'join' && type !== 'quit') return fail('type deve ser "join" ou "quit"');
  const player = parsePlayerIdentity(raw.player);
  if (!player.ok) return player;
  return ok({ type, player: player.value });
}
