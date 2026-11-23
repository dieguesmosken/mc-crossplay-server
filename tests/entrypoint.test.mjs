import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const ENTRYPOINT = new URL('../infrastructure/docker/minecraft/entrypoint.sh', import.meta.url)
  .pathname;
const INIT_DATA = new URL('../infrastructure/docker/scripts/init-data.sh', import.meta.url)
  .pathname;

// Cria um ambiente isolado com `java` e `curl` falsos, que apenas registram o que receberam.
async function createSandbox() {
  const root = await mkdtemp(path.join(tmpdir(), 'mc-entrypoint-'));
  const bin = path.join(root, 'bin');
  const data = path.join(root, 'data');
  await mkdir(bin);
  await mkdir(data);

  await writeFile(
    path.join(bin, 'java'),
    `#!/bin/sh\necho "cwd=$(pwd)" > "${root}/java.log"\necho "args=$*" >> "${root}/java.log"\n`,
  );
  await writeFile(
    path.join(bin, 'curl'),
    `#!/bin/sh
out=""
while [ $# -gt 0 ]; do
  if [ "$1" = "-o" ]; then out="$2"; fi
  shift
done
echo "$out" >> "${root}/curl.log"
echo "fake-jar" > "$out"
`,
  );
  await chmod(path.join(bin, 'java'), 0o755);
  await chmod(path.join(bin, 'curl'), 0o755);

  return { root, bin, data };
}

// Herda o ambiente do sistema (funciona em Linux comum e no Termux, que não tem /usr/bin),
// mas descarta qualquer MC_* já exportado para não contaminar os testes.
function baseEnv(extra = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('MC_')) delete env[key];
  }
  return { ...env, ...extra };
}

function runEntrypoint(sandbox, env = {}) {
  return spawnSync('sh', [ENTRYPOINT], {
    encoding: 'utf8',
    env: baseEnv({
      PATH: `${sandbox.bin}:${process.env.PATH}`,
      MC_SERVER_ROOT: sandbox.root,
      MC_DATA_DIR: sandbox.data,
      MC_PAPER_JAR: path.join(sandbox.root, 'paper.jar'),
      ...env,
    }),
  });
}

async function withSandbox(fn) {
  const sandbox = await createSandbox();
  try {
    await fn(sandbox);
  } finally {
    await rm(sandbox.root, { recursive: true, force: true });
  }
}

test('without eula.txt the entrypoint creates it as eula=false, exits 1 and never starts Java', async () => {
  await withSandbox(async (sandbox) => {
    const result = runEntrypoint(sandbox);

    assert.equal(result.status, 1);
    assert.equal(
      (await readFile(path.join(sandbox.data, 'eula.txt'), 'utf8')).trim(),
      'eula=false',
    );
    assert.equal(existsSync(path.join(sandbox.root, 'java.log')), false);
  });
});

test('eula=false is never overwritten and keeps the server stopped', async () => {
  await withSandbox(async (sandbox) => {
    await writeFile(path.join(sandbox.data, 'eula.txt'), 'eula=false\n');

    const result = runEntrypoint(sandbox);

    assert.equal(result.status, 1);
    assert.equal(existsSync(path.join(sandbox.root, 'java.log')), false);
  });
});

test('eula=true with Windows line endings (CRLF) is accepted and Java starts in the data dir', async () => {
  await withSandbox(async (sandbox) => {
    await writeFile(path.join(sandbox.data, 'eula.txt'), 'eula=true\r\n');

    const result = runEntrypoint(sandbox);
    const javaLog = await readFile(path.join(sandbox.root, 'java.log'), 'utf8');

    assert.equal(result.status, 0);
    assert.match(javaLog, new RegExp(`cwd=.*${path.basename(sandbox.data)}`));
    assert.match(javaLog, /-jar .*paper\.jar nogui/);
  });
});

test('the JVM heap defaults to 2G for both -Xms and -Xmx', async () => {
  await withSandbox(async (sandbox) => {
    await writeFile(path.join(sandbox.data, 'eula.txt'), 'eula=true\n');

    runEntrypoint(sandbox);
    const javaLog = await readFile(path.join(sandbox.root, 'java.log'), 'utf8');

    assert.match(javaLog, /-Xms2G -Xmx2G/);
  });
});

test('MC_JAVA_HEAP and MC_JAVA_OPTS are honored', async () => {
  await withSandbox(async (sandbox) => {
    await writeFile(path.join(sandbox.data, 'eula.txt'), 'eula=true\n');

    runEntrypoint(sandbox, { MC_JAVA_HEAP: '1536M', MC_JAVA_OPTS: '-XX:+UseG1GC -Dfoo=bar' });
    const javaLog = await readFile(path.join(sandbox.root, 'java.log'), 'utf8');

    assert.match(javaLog, /-Xms1536M -Xmx1536M -XX:\+UseG1GC -Dfoo=bar -jar/);
  });
});

test('Geyser and Floodgate are downloaded once and kept when already present', async () => {
  await withSandbox(async (sandbox) => {
    await writeFile(path.join(sandbox.data, 'eula.txt'), 'eula=true\n');

    runEntrypoint(sandbox);
    assert.equal(existsSync(path.join(sandbox.data, 'plugins', 'geyser.jar')), true);
    assert.equal(existsSync(path.join(sandbox.data, 'plugins', 'floodgate.jar')), true);
    const firstRun = (await readFile(path.join(sandbox.root, 'curl.log'), 'utf8'))
      .trim()
      .split('\n');
    assert.equal(firstRun.length, 2);

    await writeFile(path.join(sandbox.data, 'plugins', 'geyser.jar'), 'custom-geyser');
    runEntrypoint(sandbox);
    const secondRun = (await readFile(path.join(sandbox.root, 'curl.log'), 'utf8'))
      .trim()
      .split('\n');

    assert.equal(secondRun.length, 2, 'no extra downloads on the second start');
    assert.equal(
      await readFile(path.join(sandbox.data, 'plugins', 'geyser.jar'), 'utf8'),
      'custom-geyser',
    );
  });
});

test('init-data.sh creates eula=false once and never overwrites an existing decision', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mc-init-'));
  const data = path.join(root, 'data');
  try {
    const env = baseEnv({ MC_DATA_DIR: data });

    const first = spawnSync('sh', [INIT_DATA], { encoding: 'utf8', env });
    assert.equal(first.status, 0);
    assert.equal((await readFile(path.join(data, 'eula.txt'), 'utf8')).trim(), 'eula=false');

    await writeFile(path.join(data, 'eula.txt'), 'eula=true\n');
    const second = spawnSync('sh', [INIT_DATA], { encoding: 'utf8', env });

    assert.equal(second.status, 0);
    assert.equal((await readFile(path.join(data, 'eula.txt'), 'utf8')).trim(), 'eula=true');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('docker-compose keeps a single data volume, no restart loop and a configurable memory limit', async () => {
  const compose = await readFile(
    new URL('../infrastructure/docker/docker-compose.yml', import.meta.url),
    'utf8',
  );

  assert.match(compose, /- \.\/data:\/server\/data/);
  assert.doesNotMatch(compose, /eula\.txt:\/server\/eula\.txt/);
  assert.match(compose, /restart: "no"/);
  assert.match(compose, /mem_limit: \$\{MC_MEMORY_LIMIT:-3g\}/);
  assert.match(compose, /MC_JAVA_HEAP: \$\{MC_JAVA_HEAP:-2G\}/);
});

test('docker-compose keeps stdin and tty open so the server console can be attached', async () => {
  const compose = await readFile(
    new URL('../infrastructure/docker/docker-compose.yml', import.meta.url),
    'utf8',
  );

  assert.match(compose, /^\s+stdin_open: true$/m);
  assert.match(compose, /^\s+tty: true$/m);
});

test('docker-compose publishes Java and Bedrock ports on MC_BIND_ADDRESS, loopback by default', async () => {
  const compose = await readFile(
    new URL('../infrastructure/docker/docker-compose.yml', import.meta.url),
    'utf8',
  );
  const bind = '\\$\\{MC_BIND_ADDRESS:-127\\.0\\.0\\.1\\}';

  // Java (TCP) e Bedrock (UDP + TCP da sinalização do NetherNet, issue #23).
  assert.match(compose, new RegExp(`- "${bind}:25565:25565/tcp"`));
  assert.match(compose, new RegExp(`- "${bind}:19132:19132/udp"`));
  assert.match(compose, new RegExp(`- "${bind}:19132:19132/tcp"`));

  // Nenhuma porta publicada fora do padrão seguro: toda entrada de "ports" usa a variável.
  const published = compose.match(/^\s*- "[^"]*:\d+:\d+\/(?:tcp|udp)"/gm) ?? [];
  assert.equal(published.length, 3);
  for (const line of published) assert.match(line, new RegExp(bind));
  assert.doesNotMatch(compose, /"0\.0\.0\.0:/);
});

test('.env.example keeps MC_BIND_ADDRESS on loopback and warns about the LAN exposure', async () => {
  const example = await readFile(
    new URL('../infrastructure/docker/.env.example', import.meta.url),
    'utf8',
  );

  // Exatamente uma definição ativa, no padrão seguro.
  const active = example.match(/^MC_BIND_ADDRESS=.*$/gm) ?? [];
  assert.deepEqual(active, ['MC_BIND_ADDRESS=127.0.0.1']);
  // O aviso sobre ufw e LAN precisa continuar ao lado da variável.
  assert.match(example, /Docker ignora as regras do ufw/);
});

test('docker-compose runs the queue API only under the "api" profile, published only on loopback', async () => {
  const compose = await readFile(
    new URL('../infrastructure/docker/docker-compose.yml', import.meta.url),
    'utf8',
  );
  const apiBlock = compose.slice(compose.indexOf('\n  api:\n'), compose.indexOf('\nvolumes:'));

  assert.ok(apiBlock.length > 0, 'api service block not found');
  assert.match(apiBlock, /profiles: \["api"\]/);
  assert.match(apiBlock, /MC_API_SECRET: \$\{MC_API_SECRET:-\}/);
  assert.match(apiBlock, /api_data:\/data/);
  // Painel: a única porta publicada da API é em 127.0.0.1, nunca na LAN.
  const apiPorts = apiBlock.match(/^\s+- "[^"]*:\d+"\s*$/gm) ?? [];
  assert.equal(apiPorts.length, 1);
  assert.match(apiPorts[0], /- "127\.0\.0\.1:\$\{MC_ADMIN_PORT:-8787\}:8787"/);
  // Logs do Paper entram somente leitura; o hash da senha vem do ambiente, nunca escrito.
  assert.match(apiBlock, /\.\/data\/logs:\/minecraft-logs:ro/);
  assert.match(apiBlock, /MC_ADMIN_PASSWORD_HASH: \$\{MC_ADMIN_PASSWORD_HASH:-\}/);
  assert.match(apiBlock, /MC_EDGE_SECRET: \$\{MC_EDGE_SECRET:-\}/);
  assert.match(apiBlock, /MC_EDGE_ONLY: \$\{MC_EDGE_ONLY:-0\}/);
  assert.doesNotMatch(
    compose,
    /MC_API_SECRET: [^$\s]/,
    'the secret must never be written in the compose file',
  );
  // O mesmo segredo chega ao servidor Paper para o plugin.
  assert.equal((compose.match(/MC_API_SECRET: \$\{MC_API_SECRET:-\}/g) ?? []).length, 2);
});

test('API Dockerfile builds from the lockfile, runs as non-root and never embeds the secret', async () => {
  const dockerfile = await readFile(
    new URL('../infrastructure/docker/api/Dockerfile', import.meta.url),
    'utf8',
  );
  const env = await readFile(
    new URL('../infrastructure/docker/.env.example', import.meta.url),
    'utf8',
  );

  assert.match(dockerfile, /^FROM node:26\.13\.1-alpine$/m);
  assert.match(dockerfile, /pnpm install --frozen-lockfile/);
  assert.match(dockerfile, /^USER node$/m);
  assert.doesNotMatch(dockerfile, /^(ENV|ARG)\s+MC_API_SECRET/m);
  assert.match(env, /^MC_API_SECRET=$/m, '.env.example must keep the secret empty');
});
