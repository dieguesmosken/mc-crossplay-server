import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { QueueSnapshot } from '@mc-platform/queue';

/**
 * Persistência do estado da fila em SQLite (node:sqlite, sem dependência nativa:
 * funciona também no Termux). O estado é pequeno (no máximo algumas dezenas de
 * jogadores), então guardamos o instantâneo inteiro numa linha.
 */
export class QueueStore {
  readonly #db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    this.#db.exec('PRAGMA journal_mode = WAL');
    this.#db.exec(
      'CREATE TABLE IF NOT EXISTS queue_state (id INTEGER PRIMARY KEY CHECK (id = 1), snapshot TEXT NOT NULL, updated_at INTEGER NOT NULL)',
    );
  }

  load(): QueueSnapshot | null {
    const row = this.#db.prepare('SELECT snapshot FROM queue_state WHERE id = 1').get() as
      { snapshot: string } | undefined;
    if (row === undefined) return null;
    return JSON.parse(row.snapshot) as QueueSnapshot;
  }

  save(snapshot: QueueSnapshot, nowMs: number): void {
    this.#db
      .prepare(
        'INSERT INTO queue_state (id, snapshot, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at',
      )
      .run(JSON.stringify(snapshot), nowMs);
  }

  close(): void {
    this.#db.close();
  }
}
