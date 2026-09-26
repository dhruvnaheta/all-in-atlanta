export const DEFAULT_STATE = {
  players: {},
  gameList: [],
  seriesList: [],
  history: [],
  attendance: [],
  activeGameId: null,
  timerState: {
    levelIdx: 0,
    levelStartTs: null,
    pausedRemaining: null,
    running: false,
  },
  levelOverrides: {},
};
