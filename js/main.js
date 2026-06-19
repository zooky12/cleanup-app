import { init as initStore, seed, state } from './store.js';
import { init as initEvents } from './events.js';
import { reconcilePendingOps } from './cycles.js';
import { render, initEvents as initRenderEvents } from './render.js';
import { checkImportParam } from './sharing.js';

export async function init() {
  const firstRun = await initStore();
  if (firstRun || !state.tasks.length) await seed();
  await reconcilePendingOps();
  checkImportParam();
  initEvents();
  initRenderEvents();
  registerSW();
  document.getElementById('app-loading')?.remove();
  const root = document.getElementById('app-root');
  if (root) root.style.display = '';
  render();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('sw.js').catch(() => {});

  navigator.serviceWorker.addEventListener('message', async e => {
    const { reconcilePendingOps } = await import('./cycles.js');
    if (e.data.type === 'task-action') {
      await reconcilePendingOps();
      const { render } = await import('./render.js');
      render();
    } else if (e.data.type === 'cycle-complete') {
      await reconcilePendingOps();
      const { render } = await import('./render.js');
      const { showToast } = await import('./components.js');
      render();
      showToast(`🎉 All ${e.data.count} tasks done!`);
    } else if (e.data.type === 'test-result') {
      const { setLastTestResult, render } = await import('./render.js');
      setLastTestResult(e.data.action, e.data.time, e.data.raw);
      render();
    } else if (e.data.type === 'navigate') {
      const { navigate } = await import('./render.js');
      if (e.data.view) navigate(e.data.view);
    }
  });

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      const { reconcilePendingOps } = await import('./cycles.js');
      await reconcilePendingOps();
      const { render } = await import('./render.js');
      render();
    }
  });
}

init();
