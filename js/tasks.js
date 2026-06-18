import { state, mutate } from './store.js';
import { today, addDays, catEmoji } from './utils.js';

export async function completeTask(task, opts = {}) {
  let prev;
  await mutate(s => {
    prev = s.availablePoints;
    const date = opts.date || today();
    const interval = opts.interval || task.defaultInterval;
    task.lastDone = date;
    task.nextDue = addDays(date, interval);
    s.totalPoints += task.pointValue;
    s.availablePoints += task.pointValue;
    s.history.push({
      name: task.name,
      taskId: task.id,
      pts: task.pointValue,
      date,
      type: 'earn',
      catEmoji: catEmoji(s.categories, task.category),
    });
  });
  if (!opts.silent) {
    const { showToast, bumpPoints, triggerConfetti } = await import('./components.js');
    showToast(`✓ Done! +${task.pointValue} pts`);
    bumpPoints();
    if (Math.floor(state.availablePoints / 50) > Math.floor(prev / 50)) {
      triggerConfetti();
    }
  }
}

export async function completeTasks(taskIds, opts = {}) {
  for (const id of taskIds) {
    const t = state.tasks.find(x => x.id === id);
    if (t) await completeTask(t, { ...opts, silent: true });
  }
}

export function recalcTaskFromHistory(task) {
  const remaining = state.history
    .filter(e => e.type === 'earn' && e.taskId === task.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (remaining.length > 0) {
    task.lastDone = remaining[0].date;
    task.nextDue = addDays(remaining[0].date, task.defaultInterval);
  } else {
    task.lastDone = null;
    task.nextDue = today();
  }
}

export async function snoozeTask(task) {
  let wasOverdue;
  await mutate(s => {
    const td = today();
    wasOverdue = task.nextDue < td;
    if (wasOverdue) {
      task.nextDue = td;
    } else {
      task.nextDue = addDays(task.nextDue, 1);
    }
  });
  const { showToast } = await import('./components.js');
  showToast(wasOverdue ? 'Snoozed — reset to today' : 'Snoozed +1 day');
}

export async function saveTask(data, editId) {
  await mutate(s => {
    if (editId) {
      const t = s.tasks.find(x => x.id === editId);
      if (t) Object.assign(t, data);
    } else {
      s.tasks.push({ id: uid(), lastDone: null, ...data });
    }
  });
  const { showToast } = await import('./components.js');
  showToast(editId ? 'Task updated!' : 'Task added!');
}

export async function deleteTask(id) {
  await mutate(s => {
    s.tasks = s.tasks.filter(t => t.id !== id);
  });
  const { showToast } = await import('./components.js');
  showToast('Task deleted');
}

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}
