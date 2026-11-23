import { statfs } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { readFile } from 'node:fs/promises';

export interface CpuTimes {
  readonly idle: number;
  readonly total: number;
}

export interface MemoryInfo {
  readonly totalBytes: number;
  readonly availableBytes: number;
}

/** Lê a linha agregada "cpu ..." de /proc/stat. */
export function parseCpuStat(text: string): CpuTimes | null {
  const line = text.split('\n').find((l) => l.startsWith('cpu '));
  if (line === undefined) return null;
  const fields = line.trim().split(/\s+/).slice(1).map(Number);
  if (fields.length < 4 || fields.some((n) => !Number.isFinite(n))) return null;
  // user nice system idle iowait irq softirq steal
  const idle = (fields[3] ?? 0) + (fields[4] ?? 0);
  const total = fields.slice(0, 8).reduce((a, b) => a + b, 0);
  return { idle, total };
}

export function cpuPercent(previous: CpuTimes, current: CpuTimes): number {
  const total = current.total - previous.total;
  const idle = current.idle - previous.idle;
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round(((total - idle) / total) * 1000) / 10));
}

export function parseMeminfo(text: string): MemoryInfo | null {
  const kb = (name: string): number | null => {
    const match = new RegExp(`^${name}:\\s+(\\d+)\\s+kB`, 'm').exec(text);
    return match === null ? null : Number(match[1]) * 1024;
  };
  const total = kb('MemTotal');
  const available = kb('MemAvailable');
  if (total === null || available === null) return null;
  return { totalBytes: total, availableBytes: available };
}

export function parseLoadavg(text: string): [number, number, number] | null {
  const [a, b, c] = text.trim().split(/\s+/).slice(0, 3).map(Number);
  if (a === undefined || b === undefined || c === undefined) return null;
  if (![a, b, c].every(Number.isFinite)) return null;
  return [a, b, c];
}

export function parseUptime(text: string): number | null {
  const seconds = Number(text.trim().split(/\s+/)[0]);
  return Number.isFinite(seconds) ? Math.floor(seconds) : null;
}

export interface Gauge {
  readonly totalBytes: number;
  readonly usedBytes: number;
  readonly percent: number;
}

export interface StatsSnapshot {
  readonly sampledAt: number;
  readonly cpu: {
    readonly percent: number;
    readonly cores: number;
    readonly history: number[];
  } | null;
  readonly memory: Gauge | null;
  readonly disk: Gauge | null;
  readonly load: [number, number, number] | null;
  readonly uptimeSeconds: number | null;
}

export interface StatsSamplerOptions {
  readonly procDir?: string;
  /** Pasta cujo disco será medido (o volume montado). Sem ela, o disco não é mostrado. */
  readonly diskPath?: string;
  readonly intervalMs?: number;
  readonly history?: number;
  readonly now?: () => number;
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Mede CPU, memória, disco, carga e tempo ligado do computador.
 * Em container, /proc/stat e /proc/meminfo mostram os números do computador (não do container).
 */
export class StatsSampler {
  readonly #procDir: string;
  readonly #diskPath: string | undefined;
  readonly #intervalMs: number;
  readonly #historySize: number;
  readonly #now: () => number;
  #previous: CpuTimes | null = null;
  #timer: NodeJS.Timeout | null = null;
  #busy = false;
  #snapshot: StatsSnapshot = {
    sampledAt: 0,
    cpu: null,
    memory: null,
    disk: null,
    load: null,
    uptimeSeconds: null,
  };
  readonly #history: number[] = [];

  constructor(options: StatsSamplerOptions = {}) {
    this.#procDir = options.procDir ?? '/proc';
    this.#diskPath = options.diskPath;
    this.#intervalMs = options.intervalMs ?? 2000;
    this.#historySize = options.history ?? 60;
    this.#now = options.now ?? Date.now;
  }

  snapshot(): StatsSnapshot {
    return this.#snapshot;
  }

  async start(): Promise<void> {
    await this.sample();
    this.#timer = setInterval(() => void this.sample(), this.#intervalMs);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
  }

  async sample(): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    try {
      const [stat, meminfo, loadavg, uptime] = await Promise.all([
        readText(`${this.#procDir}/stat`),
        readText(`${this.#procDir}/meminfo`),
        readText(`${this.#procDir}/loadavg`),
        readText(`${this.#procDir}/uptime`),
      ]);

      let cpu: StatsSnapshot['cpu'] = null;
      const times = stat === null ? null : parseCpuStat(stat);
      if (times !== null) {
        if (this.#previous !== null) {
          this.#history.push(cpuPercent(this.#previous, times));
          if (this.#history.length > this.#historySize) this.#history.shift();
        }
        this.#previous = times;
        cpu = {
          percent: this.#history.at(-1) ?? 0,
          cores: availableParallelism(),
          history: [...this.#history],
        };
      }

      const mem = meminfo === null ? null : parseMeminfo(meminfo);
      const memory: Gauge | null =
        mem === null
          ? null
          : {
              totalBytes: mem.totalBytes,
              usedBytes: mem.totalBytes - mem.availableBytes,
              percent:
                Math.round(((mem.totalBytes - mem.availableBytes) / mem.totalBytes) * 1000) / 10,
            };

      let disk: Gauge | null = null;
      if (this.#diskPath !== undefined) {
        try {
          const info = await statfs(this.#diskPath);
          const total = info.blocks * info.bsize;
          const used = total - info.bfree * info.bsize;
          const usable = used + info.bavail * info.bsize;
          disk = {
            totalBytes: total,
            usedBytes: used,
            percent: usable > 0 ? Math.round((used / usable) * 1000) / 10 : 0,
          };
        } catch {
          disk = null;
        }
      }

      this.#snapshot = {
        sampledAt: this.#now(),
        cpu,
        memory,
        disk,
        load: loadavg === null ? null : parseLoadavg(loadavg),
        uptimeSeconds: uptime === null ? null : parseUptime(uptime),
      };
    } finally {
      this.#busy = false;
    }
  }
}
