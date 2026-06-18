export function today() {
  return new Date().toISOString().split('T')[0];
}

export function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

export function diffDays(dateStr) {
  const a = new Date(today() + 'T12:00:00');
  const b = new Date(dateStr + 'T12:00:00');
  return Math.round((b - a) / 86400000);
}

export function urgency(nextDue) {
  const d = diffDays(nextDue);
  if (d < 0) return { type: 'overdue', days: d };
  if (d === 0) return { type: 'today', days: d };
  if (d === 1) return { type: 'soon', days: d };
  return { type: 'upcoming', days: d };
}

export function urgencyLabel(u) {
  if (u.type === 'overdue') return `${Math.abs(u.days)}d overdue`;
  if (u.type === 'today') return 'Due today';
  if (u.type === 'soon') return 'Due tomorrow';
  return `In ${u.days} days`;
}

export function fmtDate(dateStr) {
  if (!dateStr) return 'Never';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function catEmoji(categories, name) {
  if (name === '__temp__') return '⚡';
  const c = categories.find(x => x.name === name);
  return c ? c.emoji : '📦';
}

export function isTemp(task) {
  return task.category === '__temp__';
}

export function groupByCategory(tasks, categories, filter) {
  const catOrder = new Map(categories.map((c, i) => [c.name, i]));
  const groups = {};

  for (const t of tasks) {
    if (filter && !filter(t)) continue;
    (groups[t.category] || (groups[t.category] = [])).push(t);
  }

  const sorted = Object.entries(groups).sort(
    ([a], [b]) => (catOrder.get(a) ?? 999) - (catOrder.get(b) ?? 999)
  );

  for (const [, ts] of sorted) {
    ts.sort((a, b) => a.name.localeCompare(b.name));
  }

  return sorted;
}

export const UCARD = {
  overdue: 'overdue',
  today: 'due-today',
  soon: 'due-soon',
  upcoming: 'upcoming',
};

export const UBADGE = {
  overdue: 'badge-overdue',
  today: 'badge-today',
  soon: 'badge-soon',
  upcoming: 'badge-upcoming',
};
