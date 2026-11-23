import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

import { MIN_PASSWORD_LENGTH, hashPassword } from './password.js';

/**
 * Gera o valor de MC_ADMIN_PASSWORD_HASH. A senha é lida sem eco no terminal
 * e nunca é gravada em lugar nenhum: só o hash é impresso.
 */
async function readPassword(prompt: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stderr.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return await new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      process.stderr.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

const first = await readPassword('Senha do painel: ');
if (first.length < MIN_PASSWORD_LENGTH) {
  console.error(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  process.exit(1);
}
const second = await readPassword('Repita a senha: ');
if (first !== second) {
  console.error('As senhas não conferem.');
  process.exit(1);
}
console.log(hashPassword(first));
