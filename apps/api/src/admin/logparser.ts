export type LogKind =
  | 'join'
  | 'leave'
  | 'chat'
  | 'advancement'
  | 'death'
  | 'command'
  | 'denied'
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

// O console do Paper escreve "[10:00:00 INFO]: msg"; o latest.log escreve "[10:00:00] [Server thread/INFO]: msg".
const LINE = /^\[(\d{2}:\d{2}:\d{2})(?: ([A-Z]+)|\] \[[^\]]*\/([A-Z]+))\]: (.*)$/;
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
// Paper 26 antepõe "System chat: " a entradas, saídas, mortes e conquistas.
const SYSTEM_CHAT = /^System chat: /;
// Recusa pela whitelist. Só a linha do Geyser traz o nome (jogador Bedrock, sem o ponto do Floodgate).
const DENIED = new RegExp(
  `^\\[Geyser-Spigot\\] ${NAME} has disconnected from the Java server because of (?:§r)?You are not whitelisted on this server!$`,
);
const STARTED = /^Done \(.*\)! For help, type "help"$/;
const STOPPING = /^Stopping (the )?server$/;

const MAX_DETAIL = 2000;

// Avisos que o Paper/Geyser sempre escrevem e que não pedem ação: não entram em "Alertas".
const HARMLESS_WARN: readonly RegExp[] = [
  /^\*{10,}$/,
  /^YOU ARE RUNNING THIS SERVER AS AN ADMINISTRATIVE OR ROOT USER/,
  /^YOU ARE OPENING YOURSELF UP TO POTENTIAL RISKS/,
  /^FOR MORE INFORMATION, SEE https:\/\/madelinemiller\.dev\//,
  /^\[oshi\.software\.os\.linux\.LinuxOperatingSystem\] Did not find udev library/,
  /^\[tel\.schich\.libdatachannel\.LibDataChannel\] .*juice: Send failed, errno=101$/,
];

const MOBS: Readonly<Record<string, string>> = {
  Zombie: 'Zumbi',
  Skeleton: 'Esqueleto',
  Spider: 'Aranha',
  'Cave Spider': 'Aranha da caverna',
  Witch: 'Bruxa',
  Drowned: 'Afogado',
  Husk: 'Husk',
  Stray: 'Esqueleto errante',
  Pillager: 'Saqueador',
  'Iron Golem': 'Golem de ferro',
  Wolf: 'Lobo',
  Bee: 'Abelha',
};

// Mortes mais comuns, em português. O que não estiver aqui continua no texto original.
const DEATHS: readonly (readonly [RegExp, string])[] = [
  [/^was slain by (.+)$/, 'foi morto por $1'],
  [/^was shot by (.+)$/, 'foi atingido por flecha de $1'],
  [/^was killed by (.+)$/, 'foi morto por $1'],
  [/^was blown up by (.+)$/, 'foi explodido por $1'],
  [/^was fireballed by (.+)$/, 'foi atingido por bola de fogo de $1'],
  [/^was pummeled by (.+)$/, 'foi atingido por $1'],
  [/^was impaled by (.+)$/, 'foi empalado por $1'],
  [/^was stung to death$/, 'morreu picado'],
  [/^was pricked to death$/, 'morreu espetado'],
  [/^was struck by lightning$/, 'foi atingido por um raio'],
  [/^was squashed by a falling anvil$/, 'foi esmagado por uma bigorna'],
  [/^drowned$/, 'morreu afogado'],
  [/^burned to death$/, 'morreu queimado'],
  [/^went up in flames$/, 'pegou fogo'],
  [/^starved to death$/, 'morreu de fome'],
  [/^suffocated in a wall$/, 'sufocou numa parede'],
  [/^froze to death$/, 'morreu congelado'],
  [/^withered away$/, 'morreu de definhamento'],
  [/^blew up$/, 'explodiu'],
  [/^hit the ground too hard$/, 'bateu no chão com muita força'],
  [/^fell from a high place$/, 'caiu de um lugar alto'],
  [/^fell off (?:a )?(ladder|vines|scaffolding)$/, 'caiu de $1'],
  [/^tried to swim in lava$/, 'tentou nadar na lava'],
  [/^walked into fire whilst fighting (.+)$/, 'andou no fogo lutando com $1'],
  [/^walked into a cactus whilst trying to escape (.+)$/, 'esbarrou num cacto fugindo de $1'],
  [/^died$/, 'morreu'],
];

export function translateDeath(text: string): string {
  for (const [pattern, replacement] of DEATHS) {
    if (!pattern.test(text)) continue;
    return text
      .replace(pattern, replacement)
      .replace(/(?<= )([A-Z][A-Za-z]*(?: [A-Z][a-z]+)*)$/, (name) => MOBS[name] ?? name);
  }
  return text;
}

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
    const [, clock, consoleLevel, fileLevel, message] = match as unknown as [
      string,
      string,
      string | undefined,
      string | undefined,
      string,
    ];
    const level = consoleLevel ?? fileLevel ?? 'INFO';
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

  #classify(clock: string, level: string, rawMessage: string): LogEntry {
    let m: RegExpExecArray | null;
    const message = rawMessage.replace(SYSTEM_CHAT, '');
    if ((m = DENIED.exec(message)) !== null)
      return this.#entry(
        clock,
        level,
        'denied',
        'tentou entrar, mas não está na whitelist',
        m[1] as string,
      );
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
        return this.#entry(clock, level, 'death', translateDeath(message.slice(space + 1)), first);
    }
    if (level === 'WARN' && HARMLESS_WARN.some((re) => re.test(message)))
      return this.#entry(clock, level, 'info', message);
    const kind: LogKind =
      level === 'WARN' ? 'warn' : level === 'ERROR' || level === 'FATAL' ? 'error' : 'info';
    return this.#entry(clock, level, kind, message);
  }
}
