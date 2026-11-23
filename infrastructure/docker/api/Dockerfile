# Dockerfile da API da fila (apps/api) — issue #25.
# Contexto de build: a RAIZ do repositório (veja docker-compose.yml). Precisa do workspace
# inteiro porque a API depende de @mc-platform/queue e @mc-platform/shared.
#
# Node 26.13.1: o repositório exige node >=26.13.1 e usa node:sqlite (módulo embutido).
# O corepack não vem mais com o Node recente, por isso o pnpm é instalado pelo npm, na
# versão do campo packageManager do package.json.
FROM node:26.13.1-alpine

RUN npm install --global pnpm@12.21.0

WORKDIR /repo
COPY . .

# --frozen-lockfile: o build falha se o pnpm-lock.yaml não bater com os package.json.
RUN pnpm install --frozen-lockfile \
    && pnpm --filter "@mc-platform/api..." build

# Estado da fila (SQLite). Fica num volume nomeado, que herda o dono desta pasta.
RUN mkdir -p /data && chown node:node /data
USER node

ENV MC_API_DB=/data/api.sqlite
# 0.0.0.0 é só dentro da rede privada do compose: o compose NÃO publica a porta no host.
ENV MC_API_HOST=0.0.0.0
ENV MC_API_PORT=8787

# O segredo (MC_API_SECRET) nunca entra na imagem: vem do ambiente em tempo de execução.
CMD ["node", "apps/api/dist/server.js"]
