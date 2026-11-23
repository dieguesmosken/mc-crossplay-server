# Worker de borda do painel (`apps/edge-gateway`)

Faz o login do admin **na borda do Cloudflare** e só então repassa o pedido ao painel que roda em casa. Cada pedido repassado é assinado (HMAC-SHA256 com `EDGE_SECRET`, preso ao método, ao caminho e a um relógio de 60 s); o painel só aceita a assinatura. Saber o endereço do Tunnel não dá acesso.

```
navegador ─HTTPS─> Worker (mine.teuzin.com.br) ─HTTPS─> Cloudflare Tunnel ─> api:8787 (casa)
                    senha + sessão aqui          origem.teuzin.com.br
```

Pelo Worker passam só `/`, `/admin`, `/assets/*` (públicos) e `/admin/api/*` (com sessão). As rotas HMAC do plugin e o `/health` não existem na borda. O jogo (`server.teuzin.com.br`) **não** passa por aqui: o Tunnel carrega só tráfego web.

## Variáveis

| Nome                  | Tipo     | Valor                                                                                        |
| --------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `ADMIN_PASSWORD_HASH` | secret   | `node apps/edge-gateway/scripts/hash-password.mjs` (PBKDF2, 100000 iterações, senha sem eco) |
| `SESSION_SECRET`      | secret   | `openssl rand -hex 32`                                                                       |
| `EDGE_SECRET`         | secret   | `openssl rand -hex 32`; o **mesmo** valor em `MC_EDGE_SECRET` no `.env` de casa              |
| `ORIGIN_URL`          | variável | `https://origem.teuzin.com.br` (hostname do Tunnel, https)                                   |

Trocar a senha (outro hash) invalida todas as sessões. Sem as quatro variáveis o Worker responde 503 e explica o que falta.

## Passo a passo

1. **Tunnel (em casa):** no painel do Cloudflare, Zero Trust, Networks, Tunnels: crie um Tunnel e aponte o hostname `origem.teuzin.com.br` para `http://api:8787` (o `cloudflared` precisa estar na rede `minecraft_net`, ou aponte para `http://127.0.0.1:8787` se rodar no host). Guarde o token só no seu `.env`/no `cloudflared`; ele não vai para o Git.
2. **Painel:** no `.env` de casa, `MC_EDGE_SECRET=<o mesmo EDGE_SECRET>`, `MC_EDGE_ONLY=1` (sem isso, quem descobrir o hostname do Tunnel alcança as rotas públicas da fila e o login local) e `docker compose --profile api up -d --build`.
3. **Worker:** publique `src/worker.js` (colar no editor do painel, ou `npx wrangler deploy` nesta pasta) e cadastre as variáveis acima.
4. **Rota:** Workers Routes ou domínio personalizado: `mine.teuzin.com.br/*` para este Worker.
5. **WAF:** crie uma regra de limite de taxa em `mine.teuzin.com.br/admin/api/login` (por exemplo, 5 requisições por minuto por IP). O freio de tentativas do Worker é por instância e não substitui isso.

## Limites e pontos de atenção

- **Origem fora do ar:** o Worker responde 502 e o painel fica indisponível; o site também, já que ele vem do painel.
- **Duas camadas:** o login local do painel (`127.0.0.1:8787`) continua existindo com a senha dele; a borda tem hash e senha próprios.
- **Tempo real:** o fluxo `/admin/api/stream` (SSE) passa pelo Worker; o Cloudflare pode encerrar conexões muito longas e o painel reconecta sozinho.
- **Não validado em produção:** publicação do Worker, Tunnel e o fluxo pelo domínio real (os testes cobrem Worker + API juntos com um `fetch` simulado).
