import { esc, urgency, fmtDate, catEmoji, today, UCARD } from './utils.js';
import { state } from './store.js';

/* ── Toast ── */
let toastTimer;

export function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ── Points badge bump ── */
export function bumpPoints() {
  const el = document.getElementById('header-points');
  if (!el) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

/* ── Confetti ── */
export function triggerConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const COLS = ['#4f46e5', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'];
  const p = Array.from({ length: 90 }, () => ({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * 40,
    w: Math.random() * 8 + 5,
    h: Math.random() * 5 + 3,
    color: COLS[Math.floor(Math.random() * COLS.length)],
    vx: (Math.random() - 0.5) * 5,
    vy: Math.random() * 3 + 2,
    rot: Math.random() * 360,
    rv: (Math.random() - 0.5) * 12,
  }));
  let f = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    p.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - f / 110);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.rot += p.rv;
    });
    f++;
    if (f < 130) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

/* ── Search highlight ── */
/* ── Not currently used, placeholder ── */

/* ── Badge helpers ── */
export function renderBadge(cls, text) {
  return `<span class="badge ${esc(cls)}">${esc(text)}</span>`;
}

export function renderBadgeRow(task) {
  const u = urgency(task.nextDue);
  let html = '';
  if (u.type === 'overdue') html += renderBadge('badge-overdue', `${Math.abs(u.days)}d overdue`);
  else if (u.type === 'today') html += renderBadge('badge-today', 'Due today');
  else if (u.type === 'soon') html += renderBadge('badge-soon', 'Due tomorrow');
  else html += renderBadge('badge-upcoming', `In ${u.days} days`);
  html += renderBadge('badge-pts', `⭐ ${task.pointValue} pts`);
  return html;
}

/* ── Task card (dashboard mode) ── */
export function renderTaskCard(task) {
  const u = urgency(task.nextDue);
  const last = task.lastDone ? `Last done ${fmtDate(task.lastDone)}` : 'Never done';
  return `
    <div class="task-card ${UCARD[u.type]}">
      <div class="task-name">${esc(task.name)}</div>
      <div class="task-meta">${last}</div>
      <div class="badge-row">${renderBadgeRow(task)}</div>
      <div class="task-actions">
        <button class="btn btn-done" data-action="done" data-id="${task.id}">✓ Done</button>
        <button class="btn btn-snooze" data-action="snooze" data-id="${task.id}">📅 Snooze</button>
      </div>
    </div>`;
}

/* ── Picker row (cycle/calendar mode) ── */
export function renderPickerRow(task, { selected, showUrgency, removable, index } = {}) {
  const urg = showUrgency ? (task.nextDue < today() ? '🔴 ' : task.nextDue === today() ? '🟡 ' : '') : '';
  const checked = selected ? 'checked' : '';
  const order = index ? `<span style="color:var(--g400);font-size:11px;width:16px;">${index}.</span>` : '';
  return `
    <div class="prow">
      <input class="pcb" type="checkbox" ${checked} data-action="toggle-task" data-id="${task.id}">
      ${order}
      <span class="ptn">${urg}${esc(task.name)}</span>
      <span class="ppts">⭐${task.pointValue}</span>
      ${removable ? `<button class="srm" data-action="remove-task" data-id="${task.id}">✕</button>` : ''}
    </div>`;
}

/* ── Empty state ── */
export function renderEmptyState(icon, msg) {
  return `<div class="empty-state"><div class="icon">${icon}</div><p>${msg}</p></div>`;
}

/* ── Points hero ── */
export function renderPointsHero(available, total) {
  return `
    <div class="pts-hero">
      <div class="pts-num" id="pts-num" data-action="start-edit-pts" title="Tap to edit">${available}</div>
      <div class="pts-label">Available Points <span style="opacity:.5;font-size:10px;">(tap to edit)</span></div>
      <div class="pts-sub">Total earned all time: ${total} pts</div>
    </div>`;
}

/* ── Progress bar ── */
export function renderProgressBar(pct) {
  return `
    <div style="height:4px;background:var(--g200);border-radius:2px;margin:6px 0;overflow:hidden;">
      <div style="height:100%;width:${Math.min(100, pct)}%;background:var(--primary);border-radius:2px;transition:width .3s;"></div>
    </div>`;
}

/* ── Category section (collapsible) ── */
export function renderCategorySection(cat, { emoji, expanded, headerLeft, headerRight, body }) {
  return `
    <div class="cat-section">
      <div class="cat-header ${expanded ? 'open' : ''}" data-action="toggle-cat" data-cat="${esc(cat)}">
        <span class="cat-title">${headerLeft}</span>
        <div class="cat-summary">${headerRight || ''}</div>
        <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="cat-body ${expanded ? 'open' : ''}">
        <div class="cat-body-inner">${body}</div>
      </div>
    </div>`;
}

/* ── Grouped task list composer ── */
export function renderGroupedTaskList({
  tasks,
  categories,
  filter,
  expanded,
  renderHeader,
  renderRow,
  extra,
}) {
  const catOrder = new Map(categories.map((c, i) => [c.name, i]));
  const groups = {};

  for (const t of tasks) {
    if (filter && !filter(t)) continue;
    (groups[t.category] || (groups[t.category] = [])).push(t);
  }

  const sortedCats = Object.entries(groups).sort(
    ([a], [b]) => (catOrder.get(a) ?? 999) - (catOrder.get(b) ?? 999)
  );

  let html = '';
  for (const [cat, catTasks] of sortedCats) {
    catTasks.sort((a, b) => a.name.localeCompare(b.name));
    const emoji = catEmoji(state.categories, cat);
    const isOpen = expanded?.[cat] === true;

    const header = renderHeader ? renderHeader(cat, catTasks, emoji, extra) : {
      left: `${emoji} ${esc(cat)} <span style="color:var(--g400);font-weight:500;font-size:12px;">(${catTasks.length})</span>`,
      right: '',
    };

    const body = catTasks.map((t, i) => renderRow ? renderRow(t, i, extra) : '').join('');

    html += renderCategorySection(cat, {
      emoji,
      expanded: isOpen,
      headerLeft: header.left,
      headerRight: header.right,
      body,
    });
  }

  return html;
}

/* ── Cycle progress card ── */
export function renderCycleProgress(cycle) {
  const done = cycle.notifMode === 'simultaneous'
    ? cycle.tasks.filter(t => t.done).length
    : cycle.currentIdx;
  const total = cycle.tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return `
    <div class="cycle-item" style="background:var(--g50);border-radius:var(--rs);padding:10px 12px;margin-bottom:6px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <strong style="font-size:13px;">${esc(cycle.name || 'Cycle')}</strong>
        <span style="font-size:11px;color:var(--g400);">${done}/${total} tasks</span>
      </div>
      ${renderProgressBar(pct)}
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button class="btn btn-danger" style="padding:5px 10px;font-size:11px;" data-action="cancel-cycle" data-id="${cycle.cycleId}">✕ Cancel</button>
        <button class="btn btn-primary" style="padding:5px 10px;font-size:11px;" data-action="edit-cycle" data-id="${cycle.cycleId}">✏️ Edit</button>
      </div>
    </div>`;
}
