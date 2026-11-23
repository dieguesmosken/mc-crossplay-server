// Gera o valor de ADMIN_PASSWORD_HASH do Worker. A senha é lida sem eco e nunca é gravada.
// Uso: node apps/edge-gateway/scripts/hash-password.mjs
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

const ITERATIONS = 100_000; // máximo aceito pelo runtime dos Workers
const MIN_LENGTH = 12;

function ask(prompt) {
  const output = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stderr.write(chunk);
      cb();
    },
  });
  let muted = false;
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      process.stderr.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

const first = await ask('Senha do admin: ');
if (first.length < MIN_LENGTH) {
  console.error(`A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`);
  process.exit(1);
}
if (first !== (await ask('Repita a senha: '))) {
  console.error('As senhas não conferem.');
  process.exit(1);
}
const salt = randomBytes(16);
const hash = pbkdf2Sync(first.normalize('NFKC'), salt, ITERATIONS, 32, 'sha256');
console.log(`pbkdf2:${ITERATIONS}:${salt.toString('hex')}:${hash.toString('hex')}`);
