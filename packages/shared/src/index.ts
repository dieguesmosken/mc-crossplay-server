export const SERVER_STATES = [
  'OFFLINE',
  'START_REQUESTED',
  'STARTING',
  'LOADING_WORLD',
  'VERIFYING_CONNECTION',
  'ONLINE',
  'IDLE',
  'STOPPING',
  'ERROR',
] as const;

export type ServerState = (typeof SERVER_STATES)[number];

export const MAX_PLAYERS = 10;

export function isServerState(value: string): value is ServerState {
  return SERVER_STATES.includes(value as ServerState);
}

export * from './result.js';
export * from './identity.js';
export * from './admission.js';
export * from './signing.js';
