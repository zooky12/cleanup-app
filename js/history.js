import { state, mutate } from './store.js';
import { recalcTaskFromHistory } from './tasks.js';

export async function deleteHistoryEntry(entry) {
  await mutate(s => {
    const idx = s.history.indexOf(entry);
    if (idx === -1) return;
    s.history.splice(idx, 1);
    if (entry.type === 'earn') {
      s.totalPoints = Math.max(0, s.totalPoints - entry.pts);
      s.availablePoints = Math.max(0, s.availablePoints - entry.pts);
    } else if (entry.type === 'redeem') {
      s.availablePoints = Math.min(s.totalPoints, s.availablePoints + entry.pts);
    }
  });
  if (entry.type === 'earn') {
    const task = state.tasks.find(t => t.id === entry.taskId);
    if (task) recalcTaskFromHistory(task);
  }
  await mutate(() => {});
  const { showToast } = await import('./components.js');
  showToast('Activity removed');
}

export async function updateHistoryDate(entry, newDate) {
  await mutate(s => {
    const h = s.history.find(e => e === entry);
    if (h) h.date = newDate;
  });
  const task = state.tasks.find(t => t.id === entry.taskId);
  if (task) recalcTaskFromHistory(task);
  await mutate(() => {});
  const { showToast } = await import('./components.js');
  showToast('Date updated');
}
