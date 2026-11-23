import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const DOCTOR = new URL('../scripts/dev/doctor.sh', import.meta.url).pathname;
const RUN_LOCAL = new URL('../scripts/dev/run-local.sh', import.meta.url).pathname;

// Ambiente isolado com `java` e `curl` falsos. O java falso responde a `-version` com a
// versão pedida; nos demais casos registra cwd e argumentos.
async function createSandbox(javaVersion = '25.0.1', { curlBroken = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'mc-dev-'));
  const bin = path.join(root, 'bin');
  await mkdir(bin);

  await writeFile(
    path.join(bin, 'java'),
    `#!/bin/sh
if [ "$1" = "-version" ]; then
  echo 'Picked up JAVA_TOOL_OPTIONS: -Dfoo=bar' >&2
  echo 'openjdk version "${javaVersion}" 2026-09-16' >&2
  exit 0
fi
echo "cwd=$(pwd)" > "${root}/java.log"
echo "args=$*" >> "${root}/java.log"
`,
  );
  await writeFile(
    path.join(bin, 'curl'),
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  ${curlBroken ? 'echo \'CANNOT LINK EXECUTABLE "curl"\' >&2; exit 1' : 'echo "curl 8.0.0"; exit 0'}
fi
echo "$*" >> "${root}/curl.log"
out=""
while [ $# -gt 0 ]; do
  if [ "$1" = "-o" ]; then out="$2"; fi
  shift
done
echo "fake-jar" > "$out"
`,
  );
  await chmod(path.join(bin, 'java'), 0o755);
  await chmod(path.join(bin, 'curl'), 0o755);
  return { root, bin };
}

// Herda o ambiente do sistema (Linux, WSL e Termux), descartando variáveis que mudam a
// detecção de plataforma ou que contaminariam os testes.
function baseEnv(sandbox, extra = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('MC_') || ['TERMUX_VERSION', 'WSL_DISTRO_NAME', 'PREFIX'].includes(key)) {
      delete env[key];
    }
  }
  return { ...env, PATH: `${sandbox.bin}:${process.env.PATH}`, HOME: sandbox.root, ...extra };
}

async function withSandbox(javaVersion, fn, options) {
  const sandbox = await createSandbox(javaVersion, options);
  try {
    await fn(sandbox);
  } finally {
    await rm(sandbox.root, { recursive: true, force: true });
  }
}

function runDoctor(sandbox, extra = {}) {
  return spawnSync('sh', [DOCTOR], { encoding: 'utf8', env: baseEnv(sandbox, extra) });
}

test('doctor detects Termux and explains that Docker is not supported there', async () => {
  await withSandbox('25.0.1', async (sandbox) => {
    const result = runDoctor(sandbox, { TERMUX_VERSION: '0.118.3' });

    assert.match(result.stdout, /Plataforma: termux/);
    assert.match(result.stdout, /Docker não é suportado no Termux/);
    assert.equal(result.status, 0);
  });
});

test('doctor detects WSL through WSL_DISTRO_NAME', async () => {
  await withSandbox('25.0.1', async (sandbox) => {
    const result = runDoctor(sandbox, { WSL_DISTRO_NAME: 'Ubuntu-26.04' });

    assert.match(result.stdout, /Plataforma: wsl/);
    assert.match(result.stdout, /Repositório no filesystem Linux do WSL/);
  });
});

test('doctor accepts Java 25 and rejects older Java versions', async () => {
  await withSandbox('25.0.1', async (sandbox) => {
    const result = runDoctor(sandbox);
    assert.match(result.stdout, /\[ok\]\s+Java 25/);
    assert.equal(result.status, 0);
  });

  await withSandbox('21.0.13', async (sandbox) => {
    const result = runDoctor(sandbox);
    assert.match(result.stdout, /\[FALHA\]\s+Java 21/);
    assert.equal(result.status, 1);
  });
});

test('doctor suggests a JVM heap when /proc/meminfo is readable', async (t) => {
  if (!existsSync('/proc/meminfo')) t.skip('/proc/meminfo indisponível');
  await withSandbox('25.0.1', async (sandbox) => {
    const result = runDoctor(sandbox);
    const match = result.stdout.match(/^MC_JAVA_HEAP_SUGERIDO=(\d+)M$/m);

    assert.ok(match, 'linha MC_JAVA_HEAP_SUGERIDO ausente');
    assert.ok(Number(match[1]) >= 512 && Number(match[1]) <= 2048);
  });
});

test('doctor adapts hints per platform and caps the Termux heap lower than Linux', async (t) => {
  if (!existsSync('/proc/meminfo')) t.skip('/proc/meminfo indisponível');
  await withSandbox('25.0.1', async (sandbox) => {
    const termux = runDoctor(sandbox, { TERMUX_VERSION: '0.118.3' });
    const heap = Number(termux.stdout.match(/^MC_JAVA_HEAP_SUGERIDO=(\d+)M$/m)[1]);
    assert.ok(heap <= 1024, `heap no Termux deveria ser <= 1024M, veio ${heap}M`);

    const wsl = runDoctor(sandbox, { WSL_DISTRO_NAME: 'Ubuntu' });
    assert.match(wsl.stdout, /networkingMode=mirrored/);
    assert.doesNotMatch(termux.stdout, /networkingMode=mirrored/);
  });
});

test('doctor reports a broken curl with a Termux-specific fix', async () => {
  await withSandbox(
    '25.0.1',
    async (sandbox) => {
      const termux = runDoctor(sandbox, { TERMUX_VERSION: '0.118.3' });
      assert.match(termux.stdout, /\[FALHA\]\s+curl está instalado, mas não executa/);
      assert.match(termux.stdout, /pkg update && pkg upgrade/);
      assert.equal(termux.status, 1);

      const linux = runDoctor(sandbox);
      assert.doesNotMatch(linux.stdout, /pkg upgrade/);
    },
    { curlBroken: true },
  );
});

test('run-local downloads Paper (URL from the Dockerfile) and plugins, never accepts the EULA', async () => {
  await withSandbox('25.0.1', async (sandbox) => {
    const localDir = path.join(sandbox.root, 'local');
    const env = baseEnv(sandbox, { MC_LOCAL_DIR: localDir });

    const first = spawnSync('sh', [RUN_LOCAL], { encoding: 'utf8', env });
    const curlLog = (await readFile(path.join(sandbox.root, 'curl.log'), 'utf8'))
      .trim()
      .split('\n');

    assert.equal(first.status, 1, 'sem eula=true o servidor não pode iniciar');
    assert.equal(
      (await readFile(path.join(localDir, 'data', 'eula.txt'), 'utf8')).trim(),
      'eula=false',
    );
    assert.equal(curlLog.length, 3, 'paper + geyser + floodgate');
    assert.match(curlLog[0], /fill-data\.papermc\.io\/.*paper-26\.3-255\.jar/);
    assert.equal(existsSync(path.join(localDir, 'paper.jar')), true);
    assert.equal(existsSync(path.join(localDir, 'paper.jar.part')), false);
    assert.equal(existsSync(path.join(sandbox.root, 'java.log')), false);
  });
});

test('run-local starts Java in the data dir with the requested heap once the EULA is accepted', async () => {
  await withSandbox('25.0.1', async (sandbox) => {
    const localDir = path.join(sandbox.root, 'local');
    const dataDir = path.join(localDir, 'data');
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, 'eula.txt'), 'eula=true\r\n');
    await writeFile(path.join(localDir, 'paper.jar'), 'existing-jar');
    const env = baseEnv(sandbox, { MC_LOCAL_DIR: localDir, MC_JAVA_HEAP: '512M' });

    const result = spawnSync('sh', [RUN_LOCAL], { encoding: 'utf8', env });
    const javaLog = await readFile(path.join(sandbox.root, 'java.log'), 'utf8');
    const curlLog = (await readFile(path.join(sandbox.root, 'curl.log'), 'utf8'))
      .trim()
      .split('\n');

    assert.equal(result.status, 0);
    assert.match(javaLog, /-Xms512M -Xmx512M/);
    assert.match(javaLog, /paper\.jar nogui/);
    assert.equal(curlLog.length, 2, 'o paper.jar existente não é baixado de novo');
  });
});

test('run-local aborts before downloading anything when Java is too old', async () => {
  await withSandbox('21.0.13', async (sandbox) => {
    const localDir = path.join(sandbox.root, 'local');
    const env = baseEnv(sandbox, { MC_LOCAL_DIR: localDir });

    const result = spawnSync('sh', [RUN_LOCAL], { encoding: 'utf8', env });

    assert.equal(result.status, 1);
    assert.equal(existsSync(path.join(sandbox.root, 'curl.log')), false);
  });
});

test('shell scripts and Dockerfile are forced to LF through .gitattributes', async () => {
  const attributes = await readFile(new URL('../.gitattributes', import.meta.url), 'utf8');

  assert.match(attributes, /^\*\.sh text eol=lf$/m);
  assert.match(attributes, /^Dockerfile text eol=lf$/m);
});
