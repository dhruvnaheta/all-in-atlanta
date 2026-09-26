// Pure timestamp calculations; callers supply the clock and configured durations.
export function remainingTime(state, duration, now) {
  if (!state.running) return state.pausedRemaining ?? duration;
  return Math.max(0, duration - (now - state.levelStartTs));
}
export function startTimer(state, duration, now) {
  if (state.running) return { ...state };
  return {
    ...state,
    running: true,
    pausedRemaining: null,
    levelStartTs: now - (duration - (state.pausedRemaining ?? duration)),
  };
}
export function pauseTimer(state, duration, now) {
  if (!state.running) return { ...state };
  return {
    ...state,
    running: false,
    levelStartTs: null,
    pausedRemaining: remainingTime(state, duration, now),
  };
}
export function jumpTimer(state, levelIdx, duration, now) {
  return {
    ...state,
    levelIdx,
    levelStartTs: state.running ? now : null,
    pausedRemaining: state.running ? null : duration,
  };
}
export function advanceTimer(state, durations, now) {
  if (!state.running) return { ...state };
  let levelIdx = Math.max(0, Math.min(state.levelIdx, durations.length - 1));
  let levelStartTs = state.levelStartTs ?? now;
  while (
    levelIdx < durations.length - 1 &&
    now - levelStartTs >= durations[levelIdx]
  ) {
    levelStartTs += durations[levelIdx++];
  }
  // The last blind level repeats, with no browser or server polling required.
  const duration = durations[levelIdx];
  if (now - levelStartTs >= duration)
    levelStartTs += Math.floor((now - levelStartTs) / duration) * duration;
  return { ...state, levelIdx, levelStartTs };
}
export function resetTimer(duration) {
  return {
    levelIdx: 0,
    levelStartTs: null,
    pausedRemaining: duration,
    running: false,
  };
}
