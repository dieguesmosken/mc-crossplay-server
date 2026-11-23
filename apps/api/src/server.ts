import { PlayerQueue } from '@mc-platform/queue';

import { buildApp } from './app.js';
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

const app = buildApp({ secret, queue, store });

const timer = setInterval(() => {
  queue.tick();
  store.save(queue.snapshot(), Date.now());
}, tickMs);

async function shutdown(): Promise<void> {
  clearInterval(timer);
  await app.close();
  store.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await app.listen({ host, port });
console.log(`API ouvindo em http://${host}:${port}`);
