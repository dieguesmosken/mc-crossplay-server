interface Attempt {
  count: number;
  firstAt: number;
}

/** Limita tentativas de login por origem: `max` falhas dentro de `windowMs` bloqueiam a origem. */
export class LoginLimiter {
  readonly #attempts = new Map<string, Attempt>();

  constructor(
    private readonly max = 5,
    private readonly windowMs = 15 * 60 * 1000,
  ) {}

  /** Segundos até poder tentar de novo, ou 0 se está liberado. */
  retryAfterSeconds(key: string, nowMs: number): number {
    const attempt = this.#attempts.get(key);
    if (attempt === undefined) return 0;
    if (nowMs - attempt.firstAt >= this.windowMs) {
      this.#attempts.delete(key);
      return 0;
    }
    if (attempt.count < this.max) return 0;
    return Math.ceil((attempt.firstAt + this.windowMs - nowMs) / 1000);
  }

  fail(key: string, nowMs: number): void {
    const attempt = this.#attempts.get(key);
    if (attempt === undefined || nowMs - attempt.firstAt >= this.windowMs) {
      if (this.#attempts.size > 1000) this.#attempts.clear();
      this.#attempts.set(key, { count: 1, firstAt: nowMs });
      return;
    }
    attempt.count += 1;
  }

  reset(key: string): void {
    this.#attempts.delete(key);
  }
}
