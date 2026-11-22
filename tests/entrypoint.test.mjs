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

function runEntrypoint(sandbox, env = {}) {
  return spawnSync('sh', [ENTRYPOINT], {
    encoding: 'utf8',
    env: {
      PATH: `${sandbox.bin}:/usr/bin:/bin`,
      MC_SERVER_ROOT: sandbox.root,
      MC_DATA_DIR: sandbox.data,
      MC_PAPER_JAR: path.join(sandbox.root, 'paper.jar'),
      ...env,
    },
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
    const env = { PATH: '/usr/bin:/bin', MC_DATA_DIR: data };

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
