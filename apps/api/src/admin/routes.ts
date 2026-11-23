import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { join } from 'node:path';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { PlayerQueue } from '@mc-platform/queue';

import { EDGE_SIG_HEADER, EDGE_TS_HEADER, verifyEdgeRequest } from './edge.js';
import { LoginLimiter } from './limiter.js';
import type { LogEntry } from './logparser.js';
import type { LogTailer } from './logtail.js';
import { verifyPassword } from './password.js';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  clearedCookie,
  createSessionToken,
  readCookie,
  sessionCookie,
  verifySessionToken,
} from './session.js';
import type { StatsSampler } from './stats.js';

export interface AdminOptions {
  /** Hash scrypt da senha (formato de password.ts). Sem ele o painel não é registrado. */
  readonly passwordHash: string;
  /** Segredo da API; dele sai a chave de sessão (trocar a senha invalida as sessões). */
  readonly apiSecret: string;
  readonly tailer: LogTailer;
  readonly stats: StatsSampler;
  readonly queue: PlayerQueue;
  /** Pasta com index.html, admin.html, *.css e *.js. */
  readonly publicDir: string;
  /** Cookie com atributo Secure: ligue quando o painel estiver atrás de HTTPS. */
  readonly secureCookies?: boolean;
  /**
   * Segredo compartilhado com o Worker (apps/edge-gateway). Com ele, pedidos assinados pelo
   * Worker (que já autenticou a senha na borda) valem como sessão. Sem ele, só o login local.
   */
  readonly edgeSecret?: string;
  /**
   * Com o Tunnel publicado, qualquer pessoa alcança a API pelo hostname dele. Neste modo, tudo
   * exige a assinatura do Worker, exceto /health e as rotas HMAC do plugin (/v1/server/*), que
   * têm autenticação própria. Exige edgeSecret. O painel local por 127.0.0.1 deixa de abrir.
   */
  readonly edgeOnly?: boolean;
  readonly now?: () => number;
  readonly limiter?: LoginLimiter;
}

const FILES: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/admin': { file: 'admin.html', type: 'text/html; charset=utf-8' },
  '/assets/site.css': { file: 'site.css', type: 'text/css; charset=utf-8' },
  '/assets/admin.css': { file: 'admin.css', type: 'text/css; charset=utf-8' },
  '/assets/admin.js': { file: 'admin.js', type: 'text/javascript; charset=utf-8' },
  '/assets/favicon.svg': { file: 'favicon.svg', type: 'image/svg+xml' },
};

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

const HEARTBEAT_MS = 15_000;

export function registerAdmin(app: FastifyInstance, options: AdminOptions): void {
  const now = options.now ?? Date.now;
  const secure = options.secureCookies ?? false;
  const limiter = options.limiter ?? new LoginLimiter();
  const sessionKey = createHmac('sha256', options.apiSecret)
    .update(`admin-session:${options.passwordHash}`)
    .digest('hex');

  // Os arquivos da interface são lidos uma vez: só estes caminhos existem (sem path traversal).
  const pages = new Map<string, { body: Buffer; type: string }>();
  for (const [route, { file, type }] of Object.entries(FILES)) {
    try {
      pages.set(route, { body: readFileSync(join(options.publicDir, file)), type });
    } catch {
      // Arquivo ausente: a rota responde 404.
    }
  }

  app.addHook('onSend', (request, reply, payload, done) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) void reply.header(name, value);
    if (request.url.startsWith('/admin/api/')) void reply.header('Cache-Control', 'no-store');
    done(null, payload);
  });

  if (options.edgeOnly === true) {
    if (options.edgeSecret === undefined) throw new Error('edgeOnly exige edgeSecret');
    app.addHook('onRequest', (request, reply, done) => {
      const path = request.url.split('?')[0] ?? '';
      if (path === '/health' || path.startsWith('/v1/server/') || isAuthedByEdge(request)) {
        done();
        return;
      }
      void reply.code(404).send({ error: 'not_found' });
    });
  }

  for (const [route] of Object.entries(FILES)) {
    app.get(route, (_request, reply) => {
      const page = pages.get(route);
      if (page === undefined) return reply.code(404).send({ error: 'not_found' });
      return reply
        .header('Content-Type', page.type)
        .header('Cache-Control', route.startsWith('/assets/') ? 'public, max-age=300' : 'no-cache')
        .send(page.body);
    });
  }

  const header = (request: FastifyRequest, name: string): string | undefined => {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };

  function isAuthedByEdge(request: FastifyRequest): boolean {
    if (options.edgeSecret === undefined) return false;
    return verifyEdgeRequest(
      options.edgeSecret,
      {
        ts: header(request, EDGE_TS_HEADER),
        sig: header(request, EDGE_SIG_HEADER),
        method: request.method,
        url: request.url,
      },
      now(),
    );
  }

  function isAuthed(request: FastifyRequest): boolean {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (token !== undefined && verifySessionToken(sessionKey, token, now())) return true;
    return isAuthedByEdge(request);
  }

  function requireAuth(request: FastifyRequest, reply: FastifyReply): boolean {
    if (isAuthed(request)) return true;
    void reply.code(401).send({ error: 'unauthorized' });
    return false;
  }

  app.post('/admin/api/login', (request, reply) => {
    const key = request.ip;
    const wait = limiter.retryAfterSeconds(key, now());
    if (wait > 0) {
      return reply
        .code(429)
        .header('Retry-After', String(wait))
        .send({ error: 'too_many_attempts', retryAfterSeconds: wait });
    }
    const body = request.body as { password?: unknown } | null;
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!verifyPassword(password, options.passwordHash)) {
      limiter.fail(key, now());
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    limiter.reset(key);
    const token = createSessionToken(sessionKey, now());
    return reply
      .header('Set-Cookie', sessionCookie(token, secure, Math.floor(SESSION_TTL_MS / 1000)))
      .send({ ok: true });
  });

  app.post('/admin/api/logout', (_request, reply) =>
    reply.header('Set-Cookie', clearedCookie(secure)).send({ ok: true }),
  );

  app.get('/admin/api/me', (request, reply) => reply.send({ authenticated: isAuthed(request) }));

  function snapshot(): Record<string, unknown> {
    const q = options.queue.snapshot();
    return {
      server: {
        state: options.tailer.serverState,
        logFound: options.tailer.fileExists,
        online: options.tailer.online,
      },
      queue: {
        capacity: q.capacity,
        online: q.online.length,
        reserved: q.reserved.length,
        waiting: q.waiting.length,
      },
      stats: options.stats.snapshot(),
      logs: options.tailer.recent(300),
    };
  }

  app.get('/admin/api/snapshot', (request, reply) => {
    if (!requireAuth(request, reply)) return;
    return reply.send(snapshot());
  });

  const streams = new Set<ServerResponse>();

  app.get('/admin/api/stream', (request, reply) => {
    if (!requireAuth(request, reply)) return;
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...SECURITY_HEADERS,
    });
    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    streams.add(res);
    send('hello', snapshot());

    const unsubscribe = options.tailer.subscribe((entry: LogEntry) => {
      send('log', {
        entry,
        online: options.tailer.online,
        state: options.tailer.serverState,
      });
    });
    const statsTimer = setInterval(() => {
      const q = options.queue.snapshot();
      send('stats', {
        stats: options.stats.snapshot(),
        queue: {
          capacity: q.capacity,
          online: q.online.length,
          reserved: q.reserved.length,
          waiting: q.waiting.length,
        },
      });
    }, 2000);
    const beat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    const sessionCheck = setInterval(() => {
      if (!isAuthed(request)) res.end();
    }, 60_000);

    const cleanup = (): void => {
      unsubscribe();
      clearInterval(statsTimer);
      clearInterval(beat);
      clearInterval(sessionCheck);
      streams.delete(res);
    };
    res.on('close', cleanup);
  });

  app.addHook('onClose', (_instance, done) => {
    for (const res of streams) res.end();
    done();
  });
}
