import { state, mutate } from './store.js';
import { esc, fmtDate, catEmoji, isTemp, today } from './utils.js';
import { completeTask, recalcTaskFromHistory } from './tasks.js';
import { showToast, triggerConfetti } from './components.js';

const CAL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CAL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export let calYear = new Date().getFullYear();
export let calMonth = new Date().getMonth();
export let calTaskFilter = null;
export let calAddDate = null;
export const calAddSelection = new Set();

export function resetCalAddDate()    { calAddDate = null; }
export function resetCalTaskFilter() { calTaskFilter = null; }

export function buildDayMap(taskName) {
  const map = {};
  state.history
    .filter(h => h.type === 'earn' && (!taskName || h.name === taskName))
    .forEach(h => {
      (map[h.date] = map[h.date] || []).push(h);
    });
  return map;
}

export function renderCalendar() {
  const el = document.getElementById('calendar-content');
  if (!el) return;

  const dayMap = buildDayMap(calTaskFilter);
  const todayStr = today();
  const firstDay = new Date(calYear, calMonth, 1);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  let startDow = firstDay.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;

  let html = '';

  if (calTaskFilter) {
    html += `<button class="cal-back" data-action="all-done-filter">← All tasks</button>`;
    html += `<div class="cal-task-name">📅 ${esc(calTaskFilter)}</div>`;
  }

  html += `
    <div class="cal-header">
      <button class="cal-arrow" data-action="cal-prev">‹</button>
      <div class="cal-title">${CAL_MONTHS[calMonth]} ${calYear}</div>
      <button class="cal-arrow" data-action="cal-next">›</button>
    </div>
    <div class="cal-grid">`;

  CAL_DAYS.forEach(d => { html += `<div class="cal-dh">${d}</div>`; });
  for (let i = 0; i < startDow; i++) html += `<div class="cal-day empty"></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const entries = dayMap[dateStr] || [];
    const count = entries.length;
    const isToday = dateStr === todayStr;
    let cls = calTaskFilter
      ? (count > 0 ? 'ct' : 'c0')
      : (count === 0 ? 'c0' : count === 1 ? 'c1' : count === 2 ? 'c2' : count === 3 ? 'c3' : 'c4');
    if (isToday) cls += ' today';
    html += `<div class="cal-day ${cls}" data-action="cal-day" data-date="${dateStr}">${day}${count > 0 ? `<span class="cal-count">${count}</span>` : ''}</div>`;
  }

  html += `</div>`;

  if (!calTaskFilter) {
    html += `
      <div class="cal-legend">
        <span style="font-size:11px;color:var(--g500);margin-right:2px;">Tasks done:</span>
        <div class="cal-legend-item"><div class="cal-legend-swatch" style="background:var(--g100);"></div>0</div>
        <div class="cal-legend-item"><div class="cal-legend-swatch" style="background:#0a2e1c;"></div>1</div>
        <div class="cal-legend-item"><div class="cal-legend-swatch" style="background:#14532d;"></div>2</div>
        <div class="cal-legend-item"><div class="cal-legend-swatch" style="background:#15803d;"></div>3</div>
        <div class="cal-legend-item"><div class="cal-legend-swatch" style="background:#22c55e;"></div>4+</div>
      </div>`;
  }

  el.innerHTML = html;
}

export function calPrev() {
  if (calMonth === 0) { calMonth = 11; calYear--; }
  else calMonth--;
  renderCalendar();
}

export function calNext() {
  if (calMonth === 11) { calMonth = 0; calYear++; }
  else calMonth++;
  renderCalendar();
}

export function openCalDay(dateStr) {
  const entries = state.history.filter(h => h.type === 'earn' && h.date === dateStr);
  const [y, m, d] = dateStr.split('-');
  document.getElementById('cal-day-date').textContent = `${d}/${m}/${y.slice(2)}`;
  calAddDate = dateStr;

  if (entries.length) {
    document.getElementById('cal-day-tasks').innerHTML = entries.map(h => {
      const task = state.tasks.find(t => t.id === h.taskId || t.name === h.name);
      const emoji = h.catEmoji || (task ? catEmoji(state.categories, task.category) : '');
      return `<div class="cal-day-task" data-action="task-cal-filter" data-name="${esc(h.name).replace(/"/g, '&quot;')}">
        <div class="cal-day-task-name">${emoji ? emoji + ' ' : ''}${esc(h.name)}</div>
        <div class="cal-day-task-pts">+${h.pts} pts</div>
        <div class="cal-day-task-arrow">📅</div>
      </div>`;
    }).join('');
  } else {
    document.getElementById('cal-day-tasks').innerHTML = '<div style="text-align:center;padding:20px;color:var(--g400);font-size:13px;">No tasks done on this day.</div>';
  }

  document.getElementById('cal-day-overlay').classList.add('open');
}

export async function openTaskCalendar(name) {
  calTaskFilter = name;
  document.getElementById('cal-day-overlay')?.classList.remove('open');
  document.getElementById('cal-add-task-overlay')?.classList.remove('open');
  const { currentView, navigate } = await import('./render.js');
  if (currentView !== 'calendar') navigate('calendar');
  else renderCalendar();
}

export function openCalTaskPicker(dateStr) {
  if (!dateStr) { showToast('No date selected'); return; }
  const [y, m, d] = dateStr.split('-');
  document.getElementById('cal-add-date-label').textContent = `${d}/${m}/${y.slice(2)}`;

  const el = document.getElementById('cal-add-task-list');
  if (!el) return;

  const sorted = [...state.tasks.filter(t => !isTemp(t))].sort((a, b) => a.name.localeCompare(b.name));
  if (!sorted.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--g400);font-size:13px;">No tasks available.</div>';
    document.getElementById('cal-add-task-overlay').classList.add('open');
    return;
  }

  const catOrder = new Map(state.categories.map((c, i) => [c.name, i]));
  const groups = {};
  sorted.forEach(t => { (groups[t.category] || (groups[t.category] = [])).push(t); });
  const catKeys = Object.keys(groups).sort((a, b) => (catOrder.get(a) ?? 999) - (catOrder.get(b) ?? 999));

  let html = '';
  catKeys.forEach(cat => {
    html += `<div style="margin-bottom:4px;"><div style="font-size:12px;font-weight:700;color:var(--g400);padding:6px 4px;">${catEmoji(state.categories, cat)} ${esc(cat)}</div>`;
    groups[cat].forEach(t => {
      const ch = calAddSelection.has(t.id) ? 'checked' : '';
      html += `<div class="prow"><input class="pcb" type="checkbox" ${ch} data-action="toggle-task" data-id="${t.id}">
        <span class="ptn">${esc(t.name)}</span><span class="ppts">⭐${t.pointValue}</span></div>`;
    });
    html += `</div>`;
  });

  el.innerHTML = html;
  document.getElementById('cal-add-task-overlay').classList.add('open');
}

export async function confirmCalTasks(selection, dateStr) {
  if (!selection.size || !dateStr) return;
  const prev = state.availablePoints;

  for (const id of selection) {
    const t = state.tasks.find(x => x.id === id);
    if (t) {
      await completeTask(t, { date: dateStr, silent: true });
      recalcTaskFromHistory(t);
    }
  }

  await mutate(() => {}, { immediate: true });

  document.getElementById('cal-add-task-overlay').classList.remove('open');
  openCalDay(dateStr);
  const { render } = await import('./render.js');
  render();
  showToast(`✓ ${selection.size} task(s) added`);
  if (Math.floor(state.availablePoints / 50) > Math.floor(prev / 50)) triggerConfetti();
}
