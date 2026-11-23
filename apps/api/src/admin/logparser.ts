export type LogKind =
  | 'join'
  | 'leave'
  | 'chat'
  | 'advancement'
  | 'death'
  | 'command'
  | 'server'
  | 'warn'
  | 'error'
  | 'info';

export interface LogEntry {
  /** Número crescente por entrada, para o painel ignorar repetições. */
  readonly seq: number;
  /** Hora do log (HH:MM:SS). O Paper não grava a data, e no container o fuso é UTC. */
  readonly clock: string;
  readonly kind: LogKind;
  readonly level: string;
  readonly player?: string;
  /** Texto da ocorrência, sem o nome do jogador quando há um. */
  readonly text: string;
  /** Linhas seguintes (por exemplo, stack trace), limitadas. */
  detail?: string;
}

export type ServerState = 'unknown' | 'ready' | 'stopping';

const LINE = /^\[(\d{2}:\d{2}:\d{2}) ([A-Z]+)\]: (.*)$/;
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const NAME = String.raw`([A-Za-z0-9_.]{1,32})`;
const JOIN = new RegExp(`^${NAME} joined the game$`);
const LEAVE = new RegExp(`^${NAME} left the game$`);
const CHAT = /^<([A-Za-z0-9_.]{1,32})> (.*)$/;
const ADVANCEMENT = new RegExp(
  `^${NAME} (has made the advancement|has completed the challenge|has reached the goal) (\\[.+\\])$`,
);
const COMMAND = new RegExp(`^${NAME} issued server command: (.*)$`);
const DEATH = new RegExp(
  '^(was (slain|shot|killed|fireballed|pummeled|squashed|squished|blown up|impaled|pricked|stung|' +
    'skewered|poked|burned|doomed|struck|obliterated|roasted|frozen)|fell |drowned|burned to death|' +
    'starved|suffocated|withered|froze|died|hit the ground|went up in flames|walked into|' +
    "tried to swim|blew up|experienced kinetic|discovered|left the confines|didn't want)",
);
const STARTED = /^Done \(.*\)! For help, type "help"$/;
const STOPPING = /^Stopping (the )?server$/;

const MAX_DETAIL = 2000;

/**
 * Lê o log do Paper linha a linha e classifica o que aconteceu no mundo.
 * Mantém o conjunto de jogadores online para reconhecer mortes (que não têm formato fixo).
 */
export class LogParser {
  #seq = 0;
  #last: LogEntry | null = null;
  readonly #online = new Set<string>();
  #state: ServerState = 'unknown';

  get online(): readonly string[] {
    return [...this.#online];
  }

  get state(): ServerState {
    return this.#state;
  }

  /** Esquece o estado (arquivo novo ou truncado: o servidor reiniciou). */
  reset(): void {
    this.#online.clear();
    this.#last = null;
    this.#state = 'unknown';
  }

  /** Devolve a nova entrada, ou null se a linha só complementa a anterior ou é vazia. */
  feed(rawLine: string): LogEntry | null {
    const line = rawLine.replace(ANSI, '').replace(/\r$/, '');
    if (line.trim() === '') return null;
    const match = LINE.exec(line);
    if (match === null) {
      // Continuação (stack trace e semelhantes): anexa à entrada anterior.
      if (this.#last !== null) {
        const next = `${this.#last.detail ?? ''}${this.#last.detail ? '\n' : ''}${line}`;
        this.#last.detail = next.slice(0, MAX_DETAIL);
      }
      return null;
    }
    const [, clock, level, message] = match as unknown as [string, string, string, string];
    const entry = this.#classify(clock, level, message);
    this.#last = entry;
    return entry;
  }

  #entry(clock: string, level: string, kind: LogKind, text: string, player?: string): LogEntry {
    this.#seq += 1;
    return {
      seq: this.#seq,
      clock,
      kind,
      level,
      ...(player === undefined ? {} : { player }),
      text,
    };
  }

  #classify(clock: string, level: string, message: string): LogEntry {
    let m: RegExpExecArray | null;
    if ((m = JOIN.exec(message)) !== null) {
      const player = m[1] as string;
      this.#online.add(player);
      return this.#entry(clock, level, 'join', 'entrou no mundo', player);
    }
    if ((m = LEAVE.exec(message)) !== null) {
      const player = m[1] as string;
      this.#online.delete(player);
      return this.#entry(clock, level, 'leave', 'saiu do mundo', player);
    }
    if ((m = CHAT.exec(message)) !== null)
      return this.#entry(clock, level, 'chat', m[2] as string, m[1] as string);
    if ((m = ADVANCEMENT.exec(message)) !== null) {
      const verb = m[2] as string;
      const what =
        verb === 'has completed the challenge'
          ? 'desafio'
          : verb === 'has reached the goal'
            ? 'meta'
            : 'conquista';
      return this.#entry(clock, level, 'advancement', `${what} ${m[3] as string}`, m[1] as string);
    }
    if ((m = COMMAND.exec(message)) !== null)
      return this.#entry(clock, level, 'command', m[2] as string, m[1] as string);
    if (STARTED.test(message)) {
      this.#online.clear();
      this.#state = 'ready';
      return this.#entry(clock, level, 'server', 'servidor pronto');
    }
    if (STOPPING.test(message)) {
      this.#state = 'stopping';
      return this.#entry(clock, level, 'server', 'servidor parando');
    }
    const space = message.indexOf(' ');
    if (space > 0) {
      const first = message.slice(0, space);
      if (this.#online.has(first) && DEATH.test(message.slice(space + 1)))
        return this.#entry(clock, level, 'death', message.slice(space + 1), first);
    }
    const kind: LogKind =
      level === 'WARN' ? 'warn' : level === 'ERROR' || level === 'FATAL' ? 'error' : 'info';
    return this.#entry(clock, level, kind, message);
  }
}
