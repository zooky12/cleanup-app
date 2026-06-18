import { state, mutate, saveImmediate } from './store.js';
import { completeTask, recalcTaskFromHistory, snoozeTask } from './tasks.js';
import { today, uid, catEmoji } from './utils.js';
import * as idb from './idb.js';

export async function beginCycle({ name, notifMode, taskIds }) {
  const cycle = {
    cycleId: uid(),
    name: name || 'Cycle',
    notifMode,
    tasks: taskIds.map(id => {
      const t = state.tasks.find(x => x.id === id);
      if (!t) return null;
      return {
        taskId: t.id,
        isTemp: t.category === '__temp__',
        done: false,
        name: t.name,
        catEmoji: catEmoji(state.categories, t.category),
        pointValue: t.pointValue,
      };
    }).filter(Boolean),
    currentIdx: 0,
    startedAt: today(),
  };

  await mutate(s => {
    s.activeCycles.push(cycle);
  }, { immediate: true });

  try {
    const reg = await navigator.serviceWorker.ready;
    if (notifMode === 'simultaneous') {
      for (let i = 0; i < cycle.tasks.length; i++) {
        const t = cycle.tasks[i];
        reg.showNotification(`${t.catEmoji || ''} ${t.name}`, {
          body: `⭐ ${t.pointValue} pts · tap Done when finished`,
          icon: '/icon.svg',
          tag: `cycle-${cycle.cycleId}-task-${i}`,
          requireInteraction: true,
          actions: [{ action: 'done', title: '✓ Done' }, { action: 'snooze', title: '📅 Skip' }],
          data: { type: 'cycle-task', cycleId: cycle.cycleId, taskIndex: i },
        });
      }
    } else {
      const first = cycle.tasks[0];
      reg.showNotification(`Task 1/${cycle.tasks.length}`, {
        body: `${first.catEmoji} ${first.name} · ⭐ ${first.pointValue} pts`,
        icon: '/icon.svg',
        tag: 'cycle-task-' + cycle.cycleId,
        requireInteraction: true,
        actions: [{ action: 'done', title: '✓ Done' }, { action: 'snooze', title: '📅 Snooze +1d' }],
        data: { type: 'cycle-task', cycleId: cycle.cycleId, taskIndex: 0 },
      });
    }
  } catch (e) {
    /* SW may not be active */
  }

  const { showToast } = await import('./components.js');
  showToast(`Cycle started — ${cycle.tasks.length} tasks`);
  return cycle;
}

export async function updateCycle(cycleId, { name, notifMode, taskIds }) {
  const cycle = state.activeCycles.find(c => c.cycleId === cycleId);
  if (!cycle) return;
  const currentTaskIdx = Math.min(cycle.currentIdx, taskIds.length - 1);
  await mutate(s => {
    const c = s.activeCycles.find(x => x.cycleId === cycleId);
    if (!c) return;
    c.tasks = taskIds.map(id => {
      const t = state.tasks.find(x => x.id === id);
      if (!t) return null;
      return {
        taskId: t.id,
        isTemp: t.category === '__temp__',
        done: false,
        name: t.name,
        catEmoji: catEmoji(state.categories, t.category),
        pointValue: t.pointValue,
      };
    }).filter(Boolean);
    c.currentIdx = currentTaskIdx;
    c.name = name || c.name || 'Cycle';
    c.notifMode = notifMode || c.notifMode;
  });
  const { showToast } = await import('./components.js');
  showToast('Cycle updated');
}

export async function cancelCycle(cycleId) {
  const cycle = state.activeCycles.find(c => c.cycleId === cycleId);
  if (cycle) cleanupTempTasks(cycle);
  await mutate(s => {
    s.activeCycles = s.activeCycles.filter(c => c.cycleId !== cycleId);
  });
  const { showToast } = await import('./components.js');
  showToast('Cycle cancelled');
}

export function cleanupTempTasks(cycle) {
  const ids = new Set(
    cycle.tasks.filter(ct => ct.isTemp).map(ct => ct.taskId).filter(Boolean)
  );
  if (ids.size) {
    state.tasks = state.tasks.filter(t => !ids.has(t.id));
  }
}

let _reconciling = false;

export async function reconcilePendingOps() {
  if (_reconciling) return;
  _reconciling = true;

  try {
    if (!('indexedDB' in window) || !state.tasks.length) {
      _reconciling = false;
      return;
    }

    const ops = await idb.dbGetAll('pending_ops');
    if (!ops.length) {
      _reconciling = false;
      return;
    }

    for (const op of ops) {
      if (op.action === 'done') {
        const t = op.taskId ? state.tasks.find(x => x.id === op.taskId) : null;
        if (t) {
          await completeTask(t, { silent: true });
        } else if (op.taskName) {
          await mutate(s => {
            s.totalPoints += op.pointValue || 5;
            s.availablePoints += op.pointValue || 5;
            s.history.push({
              name: op.taskName,
              pts: op.pointValue || 5,
              date: today(),
              type: 'earn',
              catEmoji: op.catEmoji || '',
            });
          });
        }
      } else if (op.action === 'snooze' && op.taskId) {
        const t = state.tasks.find(x => x.id === op.taskId);
        if (t) await snoozeTask(t);
      }
    }

    let cycle = await idb.dbGet('cycle', 'active');
    if (typeof cycle === 'string') {
      try { cycle = JSON.parse(cycle); } catch (e) { cycle = []; }
    }
    state.activeCycles = Array.isArray(cycle) ? cycle : cycle ? [cycle] : [];

    const live = new Set(state.activeCycles.flatMap(c => c.tasks.map(t => t.taskId)));
    state.tasks = state.tasks.filter(t => t.category !== '__temp__' || live.has(t.id));

    await idb.dbClear('pending_ops');
    // Use immediate save since pending_ops are already cleared — state must persist
    await mutate(() => {}, { immediate: true });

    const { showToast } = await import('./components.js');
    if (ops.length) showToast('Synced notification changes');
  } catch (e) {
    console.warn('reconcilePendingOps error', e);
  } finally {
    _reconciling = false;
  }
}

export function addTempTask(name, pts) {
  const task = {
    id: uid(),
    name,
    category: '__temp__',
    defaultInterval: 1,
    pointValue: Math.max(1, pts || 5),
    nextDue: '9999-12-31',
    lastDone: null,
  };
  state.tasks.push(task);
  return task;
}
