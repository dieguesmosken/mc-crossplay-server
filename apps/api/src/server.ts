import { PlayerQueue } from '@mc-platform/queue';

import { buildApp } from './app.js';
import { MIN_EDGE_SECRET_LENGTH } from './admin/edge.js';
import { LogTailer } from './admin/logtail.js';
import { isValidPasswordHash } from './admin/password.js';
import { StatsSampler } from './admin/stats.js';
import { QueueStore } from './store.js';

const secret = process.env.MC_API_SECRET ?? '';
if (secret.length < 16) {
  console.error('Defina MC_API_SECRET com pelo menos 16 caracteres (veja .env.example).');
  process.exit(1);
}

const host = process.env.MC_API_HOST ?? '127.0.0.1';
const port = Number(process.env.MC_API_PORT ?? 8787);
const dbPath = process.env.MC_API_DB ?? './data/api.sqlite';
const tickMs = 5_000;

const store = new QueueStore(dbPath);
const queue = new PlayerQueue();
const saved = store.load();
if (saved !== null) queue.restore(saved);

const hash = process.env.MC_ADMIN_PASSWORD_HASH ?? '';
const edgeSecret = process.env.MC_EDGE_SECRET ?? '';
if (process.env.MC_EDGE_ONLY === '1' && edgeSecret === '') {
  console.error('MC_EDGE_ONLY=1 exige MC_EDGE_SECRET.');
  process.exit(1);
}
if (edgeSecret !== '' && edgeSecret.length < MIN_EDGE_SECRET_LENGTH) {
  console.error(`MC_EDGE_SECRET precisa ter pelo menos ${MIN_EDGE_SECRET_LENGTH} caracteres.`);
  process.exit(1);
}
let tailer: LogTailer | undefined;
let stats: StatsSampler | undefined;
let admin: Parameters<typeof buildApp>[0]['admin'];
if (hash === '') {
  console.log(
    'Painel desativado: defina MC_ADMIN_PASSWORD_HASH (pnpm --filter @mc-platform/api hash-password).',
  );
} else if (!isValidPasswordHash(hash)) {
  console.error('MC_ADMIN_PASSWORD_HASH não está no formato esperado; o painel não será ativado.');
  process.exit(1);
} else {
  tailer = new LogTailer({ file: process.env.MC_LOG_FILE ?? '/minecraft-logs/latest.log' });
  stats = new StatsSampler({
    procDir: process.env.MC_PROC_DIR ?? '/proc',
    diskPath: process.env.MC_DISK_PATH ?? '/minecraft-logs',
  });
  await Promise.all([tailer.start(), stats.start()]);
  admin = {
    passwordHash: hash,
    tailer,
    stats,
    publicDir: process.env.MC_PUBLIC_DIR ?? new URL('../public', import.meta.url).pathname,
    secureCookies: process.env.MC_ADMIN_SECURE_COOKIE === '1',
    ...(edgeSecret === '' ? {} : { edgeSecret }),
    edgeOnly: process.env.MC_EDGE_ONLY === '1',
  };
}

const app = buildApp({ secret, queue, store, ...(admin === undefined ? {} : { admin }) });

const timer = setInterval(() => {
  queue.tick();
  store.save(queue.snapshot(), Date.now());
}, tickMs);

async function shutdown(): Promise<void> {
  clearInterval(timer);
  tailer?.stop();
  stats?.stop();
  await app.close();
  store.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await app.listen({ host, port });
console.log(`API ouvindo em http://${host}:${port}`);
