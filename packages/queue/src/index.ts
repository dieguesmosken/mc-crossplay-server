import {
  MAX_PLAYERS,
  allow,
  deny,
  normalizeUuid,
  type AdmissionResponse,
  type PlayerIdentity,
} from '@mc-platform/shared';

export const DEFAULT_RESERVATION_TTL_MS = 120_000;

export interface QueueOptions {
  readonly capacity?: number;
  readonly reservationTtlMs?: number;
  /** Relógio injetável para testes. */
  readonly now?: () => number;
}

export type JoinResult =
  | { readonly status: 'online' }
  | { readonly status: 'reserved'; readonly expiresAt: number }
  | { readonly status: 'queued'; readonly position: number };

export interface QueueSnapshot {
  readonly capacity: number;
  readonly online: readonly string[];
  readonly reserved: readonly { readonly uuid: string; readonly expiresAt: number }[];
  readonly waiting: readonly string[];
}

/**
 * Fila lógica do site (não é fila de pacotes TCP/UDP) e controle do limite de jogadores.
 * Lógica pura e em memória: a persistência em SQLite fica na API.
 *
 * Invariante: online + reservas ativas <= capacity. Vagas livres vão para o início da fila
 * como reservas com prazo; quem não chega a tempo perde a vaga e o próximo é chamado.
 */
export class PlayerQueue {
  readonly capacity: number;
  readonly reservationTtlMs: number;
  readonly #now: () => number;
  readonly #online = new Set<string>();
  readonly #reservations = new Map<string, number>();
  #waiting: string[] = [];

  constructor(options: QueueOptions = {}) {
    this.capacity = options.capacity ?? MAX_PLAYERS;
    this.reservationTtlMs = options.reservationTtlMs ?? DEFAULT_RESERVATION_TTL_MS;
    this.#now = options.now ?? Date.now;
    if (!Number.isInteger(this.capacity) || this.capacity < 1)
      throw new RangeError('capacity deve ser um inteiro >= 1');
    if (!Number.isFinite(this.reservationTtlMs) || this.reservationTtlMs <= 0) {
      throw new RangeError('reservationTtlMs deve ser > 0');
    }
  }

  /** Jogador pede para entrar na fila (idempotente). */
  join(player: PlayerIdentity): JoinResult {
    const key = this.#key(player);
    this.#expire();

    if (this.#online.has(key)) return { status: 'online' };
    const reservedUntil = this.#reservations.get(key);
    if (reservedUntil !== undefined) return { status: 'reserved', expiresAt: reservedUntil };

    if (!this.#waiting.includes(key)) this.#waiting.push(key);
    this.#promote();

    const reserved = this.#reservations.get(key);
    if (reserved !== undefined) return { status: 'reserved', expiresAt: reserved };
    return { status: 'queued', position: this.#waiting.indexOf(key) + 1 };
  }

  /** Jogador desiste da fila ou da reserva. */
  leave(player: PlayerIdentity): void {
    const key = this.#key(player);
    this.#waiting = this.#waiting.filter((entry) => entry !== key);
    if (this.#reservations.delete(key)) this.#promote();
  }

  /**
   * Decisão para o plugin (AsyncPlayerPreLoginEvent). Não consome a reserva:
   * isso acontece em `playerJoined`, quando o jogador realmente entra.
   */
  admit(player: PlayerIdentity): AdmissionResponse {
    const key = this.#key(player);
    this.#expire();
    this.#promote();

    if (this.#online.has(key)) return allow();
    if (this.#reservations.has(key)) return allow();

    // Entrada direta: só com vaga livre e ninguém esperando à frente.
    if (this.#waiting.length === 0 && this.#freeSlots() > 0) return allow();

    return deny(this.#waiting.includes(key) ? 'IN_QUEUE' : 'SERVER_FULL');
  }

  /** O jogador entrou de fato no servidor. */
  playerJoined(player: PlayerIdentity): void {
    const key = this.#key(player);
    this.#reservations.delete(key);
    this.#waiting = this.#waiting.filter((entry) => entry !== key);
    this.#online.add(key);
  }

  playerQuit(player: PlayerIdentity): void {
    if (this.#online.delete(this.#key(player))) this.#promote();
  }

  /**
   * Reconcilia a presença com a lista real do servidor (heartbeat do plugin).
   * Quem não está na lista sai de `online`; quem está entra, mesmo sem reserva
   * (ops, whitelist local e outros casos que o plugin liberou sozinho).
   */
  sync(players: readonly PlayerIdentity[]): void {
    const present = new Set(players.map((player) => this.#key(player)));
    for (const key of [...this.#online]) {
      if (!present.has(key)) this.#online.delete(key);
    }
    for (const key of present) {
      this.#reservations.delete(key);
      this.#waiting = this.#waiting.filter((entry) => entry !== key);
      this.#online.add(key);
    }
    this.#expire();
    this.#promote();
  }

  /** Expira reservas vencidas e chama o próximo da fila. Chamar periodicamente. */
  tick(): void {
    this.#expire();
    this.#promote();
  }

  /** Situação de um jogador (para o site consultar a própria posição). */
  statusOf(uuid: string): JoinResult | { readonly status: 'none' } {
    const key = normalizeUuid(uuid);
    if (key === null) throw new TypeError('UUID inválido');
    this.#expire();
    this.#promote();
    if (this.#online.has(key)) return { status: 'online' };
    const expiresAt = this.#reservations.get(key);
    if (expiresAt !== undefined) return { status: 'reserved', expiresAt };
    const index = this.#waiting.indexOf(key);
    if (index >= 0) return { status: 'queued', position: index + 1 };
    return { status: 'none' };
  }

  /** Restaura o estado salvo (ex.: depois de reiniciar a API). Reservas vencidas são descartadas. */
  restore(snapshot: QueueSnapshot): void {
    this.#online.clear();
    this.#reservations.clear();
    for (const uuid of snapshot.online) this.#online.add(this.#key({ uuid }));
    for (const { uuid, expiresAt } of snapshot.reserved)
      this.#reservations.set(this.#key({ uuid }), expiresAt);
    const seen = new Set<string>();
    this.#waiting = [];
    for (const uuid of snapshot.waiting) {
      const key = this.#key({ uuid });
      if (!seen.has(key) && !this.#online.has(key) && !this.#reservations.has(key)) {
        seen.add(key);
        this.#waiting.push(key);
      }
    }
    this.#expire();
    this.#promote();
  }

  snapshot(): QueueSnapshot {
    return {
      capacity: this.capacity,
      online: [...this.#online],
      reserved: [...this.#reservations].map(([uuid, expiresAt]) => ({ uuid, expiresAt })),
      waiting: [...this.#waiting],
    };
  }

  #key(player: { readonly uuid: string }): string {
    const uuid = normalizeUuid(player.uuid);
    if (uuid === null) throw new TypeError('UUID inválido');
    return uuid;
  }

  #freeSlots(): number {
    return this.capacity - this.#online.size - this.#reservations.size;
  }

  #expire(): void {
    const now = this.#now();
    for (const [key, expiresAt] of this.#reservations) {
      if (expiresAt <= now) this.#reservations.delete(key);
    }
  }

  #promote(): void {
    while (this.#freeSlots() > 0 && this.#waiting.length > 0) {
      const next = this.#waiting.shift();
      if (next === undefined) break;
      this.#reservations.set(next, this.#now() + this.reservationTtlMs);
    }
  }
}
