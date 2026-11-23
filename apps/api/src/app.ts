import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

import type { PlayerQueue } from '@mc-platform/queue';
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  parseAdmissionRequest,
  parseHeartbeat,
  parseServerEvent,
  verifyRequest,
} from '@mc-platform/shared';

import { registerAdmin, type AdminOptions } from './admin/routes.js';
import type { QueueStore } from './store.js';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

export interface AppOptions {
  /** Segredo compartilhado com o plugin (vem de variável de ambiente). */
  readonly secret: string;
  readonly queue: PlayerQueue;
  readonly store?: QueueStore;
  readonly now?: () => number;
  readonly toleranceMs?: number;
  /** Painel e site. Sem isto, só as rotas da API existem. */
  readonly admin?: Omit<AdminOptions, 'apiSecret' | 'queue'>;
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function buildApp(options: AppOptions): FastifyInstance {
  if (options.secret.length < 16)
    throw new Error('O segredo da API deve ter pelo menos 16 caracteres');
  const { queue, store } = options;
  const now = options.now ?? Date.now;

  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });

  // Mantém o corpo bruto: a assinatura HMAC é calculada sobre os bytes enviados.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    request.rawBody = body as string;
    try {
      done(null, body === '' ? {} : JSON.parse(body as string));
    } catch {
      done(Object.assign(new Error('JSON inválido'), { statusCode: 400 }), undefined);
    }
  });

  const persist = (): void => store?.save(queue.snapshot(), now());

  function authenticate(request: FastifyRequest, reply: FastifyReply): boolean {
    const result = verifyRequest({
      secret: options.secret,
      timestampMs: Number(header(request, TIMESTAMP_HEADER)),
      body: request.rawBody ?? '',
      signature: header(request, SIGNATURE_HEADER) ?? '',
      nowMs: now(),
      ...(options.toleranceMs === undefined ? {} : { toleranceMs: options.toleranceMs }),
    });
    if (result.ok) return true;
    void reply.code(401).send({ error: 'unauthorized', reason: result.reason });
    return false;
  }

  function badRequest(reply: FastifyReply, message: string): void {
    void reply.code(400).send({ error: 'bad_request', message });
  }

  app.get('/health', () => ({ status: 'ok' }));

  // --- Rotas do plugin (autenticadas por HMAC) ---

  app.post('/v1/server/admissions', (request, reply) => {
    if (!authenticate(request, reply)) return;
    const parsed = parseAdmissionRequest(request.body);
    if (!parsed.ok) return badRequest(reply, parsed.error);
    const response = queue.admit(parsed.value.player);
    persist();
    return reply.send(response);
  });

  app.post('/v1/server/events', (request, reply) => {
    if (!authenticate(request, reply)) return;
    const parsed = parseServerEvent(request.body);
    if (!parsed.ok) return badRequest(reply, parsed.error);
    if (parsed.value.type === 'join') queue.playerJoined(parsed.value.player);
    else queue.playerQuit(parsed.value.player);
    persist();
    return reply.send({ ok: true });
  });

  app.post('/v1/server/heartbeat', (request, reply) => {
    if (!authenticate(request, reply)) return;
    const parsed = parseHeartbeat(request.body);
    if (!parsed.ok) return badRequest(reply, parsed.error);
    queue.sync(parsed.value.players);
    persist();
    return reply.send({ ok: true });
  });

  // --- Rotas do site ---
  // ATENÇÃO: ainda sem autenticação do jogador. Qualquer pessoa que souber um UUID pode
  // colocá-lo na fila. O vínculo seguro entre o site e a conta Java/Bedrock é uma decisão
  // em aberto da issue #25 e precisa ser resolvido antes de expor estas rotas na internet.

  app.post('/v1/queue/join', (request, reply) => {
    const parsed = parseAdmissionRequest(request.body);
    if (!parsed.ok) return badRequest(reply, parsed.error);
    const result = queue.join(parsed.value.player);
    persist();
    return reply.send(result);
  });

  app.post('/v1/queue/leave', (request, reply) => {
    const parsed = parseAdmissionRequest(request.body);
    if (!parsed.ok) return badRequest(reply, parsed.error);
    queue.leave(parsed.value.player);
    persist();
    return reply.send({ ok: true });
  });

  app.get('/v1/queue/status', (request, reply) => {
    const uuid = (request.query as Record<string, unknown>).uuid;
    if (typeof uuid !== 'string') return badRequest(reply, 'uuid é obrigatório');
    try {
      return reply.send(queue.statusOf(uuid));
    } catch {
      return badRequest(reply, 'uuid inválido');
    }
  });

  if (options.admin !== undefined)
    registerAdmin(app, { ...options.admin, apiSecret: options.secret, queue });

  return app;
}
