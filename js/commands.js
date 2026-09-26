import {getActiveGameId} from './state.js';
let gateway;
export function configureCommands(adapter) { gateway = adapter; }
export async function runCommand(action, payload = {}) {
  if (!gateway) throw new Error('Changes cannot be saved while disconnected. Please try again.');
  return gateway({action, expectedActiveGameId:getActiveGameId(), ...payload});
}
