// Views request refreshes without importing one another or owning startup order.
let views = {};
export function registerViews(renderers) {
  views = renderers;
}
export const renderAdmin = () => views.renderAdmin?.();
export const renderGamePage = () => views.renderGamePage?.();
export const renderRankings = () => views.renderRankings?.();
export const updateStats = () => views.updateStats?.();
export const updateHomeSched = () => views.updateHomeSched?.();
export const renderTimerUI = () => views.renderTimerUI?.();
export const renderTVTimer = () => views.renderTVTimer?.();
export const renderPlayerTable = () => views.renderPlayerTable?.();
