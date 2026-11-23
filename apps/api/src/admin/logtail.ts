import { open, stat } from 'node:fs/promises';

import { LogParser, type LogEntry, type ServerState } from './logparser.js';

export interface LogTailerOptions {
  readonly file: string;
  readonly maxEntries?: number;
  readonly pollMs?: number;
  /** Quanto do final do arquivo ler ao começar, para o painel já abrir com histórico. */
  readonly initialBytes?: number;
}

type Listener = (entry: LogEntry) => void;

/** Acompanha o latest.log (somente leitura): lê o que foi acrescentado e avisa os ouvintes. */
export class LogTailer {
  readonly #file: string;
  readonly #maxEntries: number;
  readonly #pollMs: number;
  readonly #initialBytes: number;
  readonly #parser = new LogParser();
  readonly #entries: LogEntry[] = [];
  readonly #listeners = new Set<Listener>();
  #offset = 0;
  #inode: number | null = null;
  #carry = '';
  #timer: NodeJS.Timeout | null = null;
  #busy = false;
  #exists = false;

  constructor(options: LogTailerOptions) {
    this.#file = options.file;
    this.#maxEntries = options.maxEntries ?? 500;
    this.#pollMs = options.pollMs ?? 1000;
    this.#initialBytes = options.initialBytes ?? 256 * 1024;
  }

  get fileExists(): boolean {
    return this.#exists;
  }

  get online(): readonly string[] {
    return this.#parser.online;
  }

  get serverState(): ServerState {
    return this.#parser.state;
  }

  recent(limit = 200): LogEntry[] {
    return this.#entries.slice(-Math.max(1, limit));
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async start(): Promise<void> {
    await this.poll();
    this.#timer = setInterval(() => void this.poll(), this.#pollMs);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
  }

  /** Uma passada de leitura. Público para os testes não dependerem do relógio. */
  async poll(): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    try {
      await this.#read();
    } catch {
      // Falha de leitura (arquivo sumiu no meio): tenta de novo na próxima passada.
    } finally {
      this.#busy = false;
    }
  }

  async #read(): Promise<void> {
    let info;
    try {
      info = await stat(this.#file);
    } catch {
      this.#exists = false;
      return;
    }
    this.#exists = true;
    const first = this.#inode === null;
    if (!first && (info.ino !== this.#inode || info.size < this.#offset)) {
      // Arquivo novo ou truncado: o servidor reiniciou.
      this.#offset = 0;
      this.#carry = '';
      this.#parser.reset();
    }
    this.#inode = info.ino;
    if (first) this.#offset = Math.max(0, info.size - this.#initialBytes);
    if (info.size === this.#offset) return;

    const handle = await open(this.#file, 'r');
    try {
      const length = info.size - this.#offset;
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, this.#offset);
      this.#offset += bytesRead;
      let text = this.#carry + buffer.subarray(0, bytesRead).toString('utf8');
      // Se começamos no meio do arquivo, a primeira linha pode estar cortada.
      if (first && this.#offset - bytesRead > 0) text = text.slice(text.indexOf('\n') + 1);
      const lines = text.split('\n');
      this.#carry = lines.pop() ?? '';
      for (const line of lines) this.#accept(this.#parser.feed(line));
    } finally {
      await handle.close();
    }
  }

  #accept(entry: LogEntry | null): void {
    if (entry === null) return;
    this.#entries.push(entry);
    if (this.#entries.length > this.#maxEntries) this.#entries.shift();
    for (const listener of this.#listeners) listener(entry);
  }
}
