import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('shared package exposes the agreed server states and player limit', async () => {
  const shared = await import('../packages/shared/dist/index.js');

  assert.deepEqual(shared.SERVER_STATES, [
    'OFFLINE',
    'START_REQUESTED',
    'STARTING',
    'LOADING_WORLD',
    'VERIFYING_CONNECTION',
    'ONLINE',
    'IDLE',
    'STOPPING',
    'ERROR',
  ]);
  assert.equal(shared.MAX_PLAYERS, 10);
  assert.equal(shared.isServerState('ONLINE'), true);
  assert.equal(shared.isServerState('UNKNOWN'), false);
});

test('workspace declares the planned app and package directories', async () => {
  const workspace = await readFile(new URL('../pnpm-workspace.yaml', import.meta.url), 'utf8');

  assert.match(workspace, /apps\/\*/);
  assert.match(workspace, /packages\/\*/);
});
