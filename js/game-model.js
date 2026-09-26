// Legacy records are interpreted on read; each command writes the explicit lifecycle.
export function normalizeGame(game) {
  if (!game) return null;
  const status = game.finalized ? 'completed' : game.status || (['open','closed'].includes(game.state) ? 'running' : 'scheduled');
  const registrationOpen = status === 'running' && (game.registrationOpen ?? game.state === 'open');
  const {state, ...fields} = game;
  return {...fields, status, registrationOpen};
}
export function requireRunning(game) {
  if (normalizeGame(game)?.status !== 'running') throw new Error('This game is not running.');
}
export function transitionGame(game, action) {
  const next = normalizeGame(game);
  if (!next) throw new Error('Game not found.');
  if (action === 'start') {
    if (next.status !== 'scheduled') throw new Error('Only a scheduled game can be started.');
    return {...next, status:'running', registrationOpen:true};
  }
  requireRunning(next);
  if (action === 'openRegistration') return {...next, registrationOpen:true};
  if (action === 'closeRegistration') return {...next, registrationOpen:false};
  if (action === 'complete') return {...next, status:'completed', registrationOpen:false, finalized:true};
  throw new Error('Invalid game transition.');
}
