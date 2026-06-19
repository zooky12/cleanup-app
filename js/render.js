import { state, reset, mutate } from './store.js';
import { esc, fmtDate, catEmoji, isTemp, today, urgency, diffDays, UCARD, UBADGE, urgencyLabel, groupByCategory } from './utils.js';
import * as sel from './selection.js';
import { A, on } from './events.js';
import {
  renderTaskCard, renderPickerRow, renderEmptyState, renderPointsHero,
  renderCycleProgress, renderGroupedTaskList, renderCategorySection,
  showToast, bumpPoints, triggerConfetti,
} from './components.js';
import { completeTask, snoozeTask, saveTask, deleteTask } from './tasks.js';
import { beginCycle, updateCycle, cancelCycle, addTempTask } from './cycles.js';
import { redeemReward, saveReward, deleteReward, editPoints } from './rewards.js';
import { deleteHistoryEntry, updateHistoryDate } from './history.js';
import { renderCalendar, calPrev, calNext, openCalDay, openTaskCalendar, openCalTaskPicker, calTaskFilter, calYear, calMonth, calAddDate, calAddSelection, confirmCalTasks, resetCalAddDate, resetCalTaskFilter } from './calendar.js';
import { requestPermission } from './notifications.js';
import { shareTasksUrl, shareProfileUrl, exportJson, triggerFileImport } from './sharing.js';

/* ── View routing ── */
export let currentView = 'dashboard';

export function navigate(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const viewEl = document.getElementById('view-' + view);
  if (viewEl) viewEl.classList.add('active');
  const navBtn = document.querySelector(`[data-view="${view}"]`);
  if (navBtn) navBtn.classList.add('active');
  document.getElementById('fab-add-reward').style.display = view === 'rewards' ? 'flex' : 'none';
  currentView = view;
  render();
}

export function render() {
  document.getElementById('header-points').textContent = `⭐ ${state.availablePoints} pts`;
  if (currentView === 'dashboard') renderDashboard();
  if (currentView === 'rewards') renderRewards();
  if (currentView === 'calendar') renderCalendar();
  if (currentView === 'options') renderOptions();
}

/* ── Sheet management ── */
let _returnSheet = null;

export function openSheet(id, { onClose } = {}) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
  if (onClose) _returnSheet = { id, setup: onClose };
}

export function closeSheet(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
  if (_returnSheet && _returnSheet.id === id) {
    const setup = _returnSheet.setup;
    _returnSheet = null;
    setup?.();
  }
}

export function closeSheets() {
  document.querySelectorAll('.overlay').forEach(o => o.classList.remove('open'));
  doneTaskId = null;
  deleteTaskId = null;
  deleteRewardId = null;
  deleteCatName = null;
  editHistoryIdx = null;
  resetCalAddDate();
  editTaskId = null;
  editCatName = null;
  _returnSheet = null;
  _cycleSelection = null;
}

/* ── Dashboard ── */
export function renderDashboard() {
  const el = document.getElementById('dashboard-content');
  if (!el) return;

  const visibleTasks = state.tasks.filter(t => !isTemp(t));
  if (!visibleTasks.length) {
    el.innerHTML = renderEmptyState('🏠', 'No tasks yet.<br>Tap <b>Edit Tasks</b> to add some!') +
      `<button class="manage-cats-btn" data-action="open-task-editor" style="margin-top:12px;">
        <span>📋 Edit Tasks</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>`;
    return;
  }

  const sortedTasks = [...visibleTasks].sort((a, b) => diffDays(a.nextDue) - diffDays(b.nextDue));
  const html = renderGroupedTaskList({
    tasks: sortedTasks,
    categories: state.categories,
    expanded: _dashboardExpanded,
    renderHeader: (cat, tasks, emoji) => {
      const uc = { overdue: 0, today: 0, soon: 0 };
      tasks.forEach(t => {
        const u = urgency(t.nextDue).type;
        if (u in uc) uc[u]++;
      });
      let badges = '';
      if (uc.overdue) badges += `<span class="badge badge-overdue">${uc.overdue} overdue</span>`;
      if (uc.today) badges += `<span class="badge badge-today">${uc.today} today</span>`;
      if (uc.soon) badges += `<span class="badge badge-soon">${uc.soon} tomorrow</span>`;
      return {
        left: `${emoji} ${esc(cat)} <span style="color:var(--g400);font-weight:500;font-size:12px;">(${tasks.length})</span>`,
        right: badges,
      };
    },
    renderRow: (t) => renderTaskCard(t),
  });

  el.innerHTML = html + `<button class="manage-cats-btn" data-action="open-task-editor" style="margin-top:12px;">
    <span>📋 Edit Tasks</span>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
  </button>`;
}

let _dashboardExpanded = {};

export function toggleCat(name) {
  _dashboardExpanded[name] = !_dashboardExpanded[name];
  renderDashboard();
}

/* ── Rewards ── */
export function renderRewards() {
  const el = document.getElementById('rewards-content');
  if (!el) return;

  let html = renderPointsHero(state.availablePoints, state.totalPoints);
  html += `<div class="slabel">🍬 Candy Rewards</div>`;

  state.rewards.forEach(r => {
    const can = state.availablePoints >= r.cost;
    html += `
      <div class="reward-card">
        <div class="reward-emoji">${r.emoji}</div>
        <div class="reward-info"><div class="reward-name">${esc(r.name)}</div><div class="reward-cost">⭐ ${r.cost} pts</div></div>
        <div class="reward-actions">
          <button class="btn-redeem" ${can ? '' : 'disabled'} data-action="redeem" data-id="${r.id}">${can ? 'Redeem' : `Need ${r.cost - state.availablePoints} more`}</button>
          <button class="icon-btn icon-btn-edit" data-action="edit-reward" data-id="${r.id}" style="font-size:13px;">✏️</button>
          <button class="icon-btn icon-btn-delete" data-action="delete-reward" data-id="${r.id}" style="font-size:13px;">🗑️</button>
        </div>
      </div>`;
  });

  html += `
    <div class="slabel" style="margin-top:20px;">🔄 Cycle</div>
    <div style="background:var(--g100);border-radius:var(--r);padding:14px 16px;box-shadow:var(--sh);margin-bottom:8px;">
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" data-action="begin-cycle" style="flex:1;justify-content:center;">▶ Begin cycle</button>
      </div>
      <div id="active-cycles-list" style="margin-top:10px;"></div>
    </div>`;

  el.innerHTML = html;

  const cyclesEl = document.getElementById('active-cycles-list');
  if (cyclesEl) {
    cyclesEl.innerHTML = state.activeCycles.map(c => renderCycleProgress(c)).join('');
  }
}

/* ── Options ── */
export function renderOptions() {
  const el = document.getElementById('options-content');
  if (!el) return;

  let html = `
    <div class="slabel" style="margin-top:4px;">💾 Backup</div>
    <div style="background:var(--g100);border-radius:var(--r);padding:14px 16px;box-shadow:var(--sh);margin-bottom:8px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:2px;">📤 Export data</div>
      <div style="font-size:12px;color:var(--g500);margin-bottom:10px;">Save everything — tasks, rewards, points and history — to a JSON file.</div>
      <button class="btn btn-primary" style="width:100%;justify-content:center;padding:10px;" data-action="export-json">Download JSON backup</button>
    </div>
    <div style="background:var(--g100);border-radius:var(--r);padding:14px 16px;box-shadow:var(--sh);margin-bottom:8px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:2px;">📥 Import data</div>
      <div style="font-size:12px;color:var(--g500);margin-bottom:10px;">Restore from a previously exported JSON file.</div>
      <button class="btn btn-primary" style="width:100%;justify-content:center;padding:10px;" data-action="import-json">Choose JSON file</button>
    </div>`;

  if (state.history.length) {
    const recent = [...state.history].reverse().slice(0, 30);
    html += `<div class="slabel" style="margin-top:20px;">📋 Recent Activity</div>`;
    html += recent.map((h, di) => {
      const origIdx = state.history.length - 1 - di;
      return `
      <div class="history-item">
        <div class="hdot ${h.type}"></div>
        <div class="hname">${h.catEmoji && h.type === 'earn' ? h.catEmoji + ' ' : ''}${esc(h.name)}</div>
        <div class="hpts ${h.type}">${h.type === 'redeem' ? '−' : '+'}${h.pts} pts</div>
        <div class="hdate">${fmtDate(h.date)}</div>
        ${h.type === 'earn' ? `<button class="icon-btn icon-btn-edit" data-action="edit-history-date" data-idx="${origIdx}" style="width:28px;height:28px;font-size:12px;">✏️</button>` : ''}
        <button class="icon-btn icon-btn-delete" data-action="delete-history" data-idx="${origIdx}" style="width:28px;height:28px;font-size:12px;">🗑️</button>
      </div>`;
    }).join('');
  }

  html += `
    <div class="slabel" style="margin-top:20px;">🔔 Notifications</div>
    <div style="background:var(--g100);border-radius:var(--r);padding:14px 16px;box-shadow:var(--sh);margin-bottom:8px;">
      <div style="font-size:12px;color:var(--g500);margin-bottom:10px;">Fires a real 1-task cycle notification using your first task. Tap Done on the notification — if the task completes and points update, notifications are working.</div>
      <button class="btn btn-primary" style="width:100%;justify-content:center;padding:10px;" data-action="test-notification">🔔 Send Test Notification</button>
    </div>`;

  html += `
    <div class="danger-zone" style="margin-top:20px;">
      <h3>⚠️ Danger Zone</h3>
      <p style="font-size:12px;color:var(--g700);margin-bottom:12px;">Clears all data and resets to the defaults in <code>data.json</code>.</p>
      <button class="btn btn-danger" style="width:100%;justify-content:center;padding:10px;" data-action="open-clear">🗑 Reset all data to defaults</button>
    </div>`;

  el.innerHTML = html;
}

/* ── Task / Category / Reward editor state ── */
let editTaskId = null;
let editCatName = null;
let editRewardId = null;
let deleteTaskId = null;
let deleteRewardId = null;
let deleteCatName = null;
let doneTaskId = null;
let doneInt = 7;
let editHistoryIdx = null;

/* ── Done sheet ── */
export function openDoneSheet(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  doneTaskId = id;
  doneInt = t.defaultInterval;
  document.getElementById('done-task-name').textContent = '✓ ' + t.name;
  document.getElementById('done-pts').textContent = '+' + t.pointValue;
  document.getElementById('int-val').textContent = doneInt;
  openSheet('done-overlay');
}

export function confirmDone() {
  const t = state.tasks.find(x => x.id === doneTaskId);
  if (!t) return;
  completeTask(t, { interval: doneInt }).then(() => {
    closeSheets();
    render();
  });
}

/* ── Cycle builder state ── */
let _cycleSelection = null;
let _pendingTempTasks = [];
let _pendingCycleId = null;
let _reopenPendingAfterSave = false;

/* ── Task editor ── */
export function populateCatSelect(selectedVal) {
  const sel = document.getElementById('f-cat');
  if (!sel) return;
  sel.innerHTML = state.categories.map(c =>
    `<option value="${esc(c.name)}" ${c.name === selectedVal ? 'selected' : ''}>${c.emoji} ${esc(c.name)}</option>`
  ).join('');
}

export function openTaskEditor(taskId) {
  editTaskId = taskId || null;
  document.getElementById('task-form-title').textContent = taskId ? 'Edit Task' : 'Add Task';
  if (taskId) {
    const t = state.tasks.find(x => x.id === taskId);
    if (t) {
      populateCatSelect(t.category);
      document.getElementById('f-name').value = t.name;
      document.getElementById('f-interval').value = t.defaultInterval;
      document.getElementById('f-pts').value = t.pointValue;
      document.getElementById('f-nextdue').value = t.nextDue;
      openSheet('task-form-overlay');
      return;
    }
  }
  populateCatSelect(state.categories[0]?.name || '');
  document.getElementById('f-name').value = '';
  document.getElementById('f-interval').value = '7';
  document.getElementById('f-pts').value = '10';
  document.getElementById('f-nextdue').value = today();
  openSheet('task-form-overlay');
  setTimeout(() => document.getElementById('f-name')?.focus(), 300);
}

export function saveTaskForm() {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { showToast('Please enter a task name'); return; }
  const data = {
    name,
    category: document.getElementById('f-cat').value,
    defaultInterval: Math.max(1, parseInt(document.getElementById('f-interval').value) || 7),
    pointValue: Math.max(1, parseInt(document.getElementById('f-pts').value) || 10),
    nextDue: document.getElementById('f-nextdue').value || today(),
  };
  saveTask(data, editTaskId).then(() => {
    closeSheet('task-form-overlay');
    if (_reopenPendingAfterSave) {
      _reopenPendingAfterSave = false;
      setTimeout(() => openCycleBuilder(), 100);
    } else {
      render();
    }
  });
}

/* ── Cycle builder ── */
export function openCycleBuilder(cycleId) {
  _cycleSelection = _cycleSelection || sel.createSelection({ onChange: () => {} });
  _cycleSelection.clear();
  _pendingTempTasks = [];
  _pendingCycleId = cycleId || null;
  document.getElementById('cycle-name-input').value = '';
  document.getElementById('cycle-notif-list').checked = false;

  if (cycleId) {
    const cycle = state.activeCycles.find(c => c.cycleId === cycleId);
    if (cycle) {
      cycle.tasks.forEach(t => {
        if (t.taskId) _cycleSelection.toggle(t.taskId);
      });
      document.getElementById('cycle-name-input').value = cycle.name || '';
      document.getElementById('cycle-notif-list').checked = cycle.notifMode === 'simultaneous';
    }
  }

  renderCycleBuilder();
  openSheet('pending-overlay');
}

export function renderCycleBuilder() {
  const catsEl = document.getElementById('pending-cats');
  if (!catsEl) return;

  let html = '';

  const catOrder = new Map(state.categories.map((c, i) => [c.name, i]));
  const groups = {};
  state.categories.forEach(c => {
    const catTasks = state.tasks.filter(t => t.category === c.name);
    if (catTasks.length) {
      (groups[c.name] = groups[c.name] || []).push(...catTasks);
    }
  });

  const sortedCats = Object.entries(groups).sort(
    ([a], [b]) => (catOrder.get(a) ?? 999) - (catOrder.get(b) ?? 999)
  );

  for (const [cat, catTasks] of sortedCats) {
    catTasks.sort((a, b) => a.name.localeCompare(b.name));
    const selCount = catTasks.filter(t => _cycleSelection?.has(t.id)).length;
    const isOpen = _cycleExpanded[cat] === true;
    const catTasksHtml = catTasks.map(t => {
      const urg = t.nextDue < today() ? '🔴 ' : t.nextDue === today() ? '🟡 ' : '';
      const ch = _cycleSelection?.has(t.id) ? 'checked' : '';
      return `<div class="prow"><input class="pcb" type="checkbox" ${ch} data-action="toggle-task" data-id="${t.id}">
        <span class="ptn">${urg}${esc(t.name)}</span><span class="ppts">⭐${t.pointValue}</span></div>`;
    }).join('');

    html += renderCategorySection(cat, {
      emoji: catEmoji(state.categories, cat),
      expanded: isOpen,
      headerLeft: `${catEmoji(state.categories, cat)} ${esc(cat)} <span style="color:var(--g400);font-size:11px;">(${selCount}/${catTasks.length})</span>`,
      headerRight: '',
      body: catTasksHtml,
    });
  }

  catsEl.innerHTML = html;

  const sEl = document.getElementById('pending-slist');
  const siEl = document.getElementById('pending-sitems');
  if (_cycleSelection && _cycleSelection.size) {
    sEl.style.display = 'block';
    siEl.innerHTML = _cycleSelection.items.map((id, i) => {
      let t = state.tasks.find(x => x.id === id);
      if (!t) t = _pendingTempTasks.find(x => x.id === id);
      if (!t) return '';
      return `<div class="srow" data-drag-idx="${i}">
        <span style="color:var(--g400);font-size:11px;width:16px;">${i + 1}.</span>
        <span class="snm">${esc(t.name)}</span><span class="spt">⭐${t.pointValue}</span>
        <button class="srm" data-action="remove-task" data-id="${id}">✕</button>
      </div>`;
    }).join('');
  } else {
    sEl.style.display = 'none';
  }

  const count = _cycleSelection?.size || 0;
  document.getElementById('pending-count').textContent = count ? `(${count} selected) ` : '';
  const btn = document.getElementById('begin-cycle-btn');
  const label = _pendingCycleId ? 'Update cycle' : 'Begin cycle';
  btn.textContent = `▶ ${label}${count ? ` (${count})` : ''}`;
}

let _cycleExpanded = {};

export function toggleCycleCat(name) {
  _cycleExpanded[name] = !_cycleExpanded[name];
  renderCycleBuilder();
}

export function beginCycleAction() {
  if (!_cycleSelection || !_cycleSelection.size) {
    showToast('Select at least one task');
    return;
  }
  const notifMode = document.getElementById('cycle-notif-list').checked ? 'simultaneous' : 'individual';
  const name = document.getElementById('cycle-name-input').value.trim() || 'Cycle';

  if (_pendingCycleId) {
    updateCycle(_pendingCycleId, {
      name,
      notifMode,
      taskIds: _cycleSelection.items,
    }).then(() => {
      closeSheets();
      render();
    });
  } else {
    beginCycle({
      name,
      notifMode,
      taskIds: _cycleSelection.items,
    }).then(() => {
      closeSheets();
      render();
    });
  }

  _cycleSelection = null;
}

/* ── Event wiring ── */
export function initEvents() {
  // ── Navigation ──
  on(A.NAV_DASHBOARD, () => navigate('dashboard'));
  on(A.NAV_CALENDAR, () => navigate('calendar'));
  on(A.NAV_REWARDS, () => navigate('rewards'));
  on(A.NAV_OPTIONS, () => navigate('options'));

  // ── Close sheets ──
  on(A.CLOSE_SHEETS, (el) => {
    closeSheets();
  });

  // ── Dashboard done / snooze ──
  on(A.DONE, (el) => openDoneSheet(el.dataset.id));
  on(A.SNOOZE, (el) => {
    const t = state.tasks.find(x => x.id === el.dataset.id);
    if (t) snoozeTask(t).then(() => render());
  });
  on(A.CONFIRM_DONE, () => confirmDone());

  // ── Interval stepper ──
  document.getElementById('int-minus')?.addEventListener('click', () => {
    if (doneInt > 1) { doneInt--; document.getElementById('int-val').textContent = doneInt; }
  });
  document.getElementById('int-plus')?.addEventListener('click', () => {
    doneInt++; document.getElementById('int-val').textContent = doneInt;
  });

  // ── Category toggling (dashboard) ──
  on(A.TOGGLE_CAT, (el) => {
    const name = el.dataset.cat;
    if (currentView === 'dashboard') toggleCat(name);
    else if (document.getElementById('pending-overlay')?.classList.contains('open')) toggleCycleCat(name);
  });

  // ── Task picker toggling (cycle/calendar) ──
  on(A.TOGGLE_TASK, (el) => {
    const id = el.dataset.id;
    if (document.getElementById('pending-overlay')?.classList.contains('open')) {
      if (_cycleSelection) {
        _cycleSelection.toggle(id);
        renderCycleBuilder();
      }
    } else if (document.getElementById('cal-add-task-overlay')?.classList.contains('open')) {
      if (el.checked) calAddSelection.add(id);
      else calAddSelection.delete(id);
    }
  });

  // ── Cycle: remove task from order ──
  on(A.REMOVE_TASK, (el) => {
    const id = el.dataset.id;
    if (_cycleSelection) {
      _cycleSelection.remove(id);
      const tempIdx = _pendingTempTasks.findIndex(t => t.id === id);
      if (tempIdx !== -1) {
        state.tasks = state.tasks.filter(t => t.id !== id);
        _pendingTempTasks.splice(tempIdx, 1);
      }
      renderCycleBuilder();
    }
  });

  // ── Cycle: begin / update ──
  on(A.BEGIN_CYCLE, () => openCycleBuilder());
  on(A.EDIT_CYCLE, (el) => openCycleBuilder(el.dataset.id));
  on(A.CANCEL_CYCLE, (el) => cancelCycle(el.dataset.id).then(() => render()));

  document.getElementById('begin-cycle-btn')?.addEventListener('click', () => beginCycleAction());
  document.getElementById('cancel-pending-btn')?.addEventListener('click', () => {
    _pendingTempTasks.forEach(t => { state.tasks = state.tasks.filter(x => x.id !== t.id); });
    _cycleSelection = null;
    _pendingTempTasks = [];
    closeSheets();
    render();
  });

  // ── Add temp task ──
  on(A.ADD_TEMP_TASK, () => {
    const name = document.getElementById('temp-task-name')?.value.trim();
    if (!name) { showToast('Enter a task name'); return; }
    const pts = Math.max(1, parseInt(document.getElementById('temp-task-pts')?.value) || 5);
    const task = addTempTask(name, pts);
    _pendingTempTasks.push(task);
    if (_cycleSelection) _cycleSelection.toggle(task.id);
    document.getElementById('temp-task-name').value = '';
    renderCycleBuilder();
  });

  // ── Add more tasks (from cycle builder → task form → back) ──
  on(A.ADD_MORE_TO_CYCLE, () => {
    _reopenPendingAfterSave = true;
    closeSheets();
    openTaskEditor();
  });

  // ── Task editor ──
  on(A.OPEN_TASK_EDITOR, () => openTaskEditor());
  on(A.EDIT_TASK, (el) => openTaskEditor(el.dataset.id));
  document.getElementById('save-task-btn')?.addEventListener('click', () => saveTaskForm());
  document.getElementById('cancel-task-btn')?.addEventListener('click', () => closeSheet('task-form-overlay'));

  // ── Delete task ──
  on(A.DELETE_TASK, (el) => {
    deleteTaskId = el.dataset.id;
    openSheet('delete-task-overlay');
  });
  on(A.CONFIRM_DELETE_TASK, () => {
    if (deleteTaskId) deleteTask(deleteTaskId).then(() => { closeSheets(); render(); });
  });
  document.getElementById('cancel-delete-task')?.addEventListener('click', () => closeSheet('delete-task-overlay'));

  // ── Calendar ──
  on(A.CAL_PREV, () => calPrev());
  on(A.CAL_NEXT, () => calNext());
  on(A.CAL_DAY, (el) => openCalDay(el.dataset.date));
  on(A.TASK_CAL_FILTER, (el) => openTaskCalendar(el.dataset.name));
  on(A.ALL_DONE_FILTER, () => {
    resetCalTaskFilter();
    render();
  });
  on(A.CAL_ADD_COMPLETION, () => {
    if (calAddDate) openCalTaskPicker(calAddDate);
  });
  on(A.CONFIRM_CAL_ADD, () => {
    if (calAddDate) {
      confirmCalTasks(calAddSelection, calAddDate);
      calAddSelection.clear();
    }
  });
  document.getElementById('cancel-cal-add-btn')?.addEventListener('click', () => closeSheet('cal-add-task-overlay'));
  document.getElementById('cal-day-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeSheet('cal-day-overlay');
  });

  // ── Rewards ──
  on(A.REDEEM, (el) => {
    const r = state.rewards.find(x => x.id === el.dataset.id);
    if (r) redeemReward(r).then(() => render());
  });
  on(A.EDIT_REWARD, (el) => {
    const r = state.rewards.find(x => x.id === el.dataset.id);
    if (!r) return;
    editRewardId = r.id;
    document.getElementById('reward-form-title').textContent = 'Edit Reward';
    document.getElementById('rf-emoji').value = r.emoji;
    document.getElementById('rf-name').value = r.name;
    document.getElementById('rf-cost').value = r.cost;
    openSheet('reward-form-overlay');
  });
  on(A.DELETE_REWARD, (el) => {
    deleteRewardId = el.dataset.id;
    openSheet('delete-reward-overlay');
  });
  on(A.CONFIRM_DELETE_REWARD, () => {
    if (deleteRewardId) deleteReward(deleteRewardId).then(() => { closeSheets(); render(); });
  });
  document.getElementById('cancel-delete-reward')?.addEventListener('click', () => closeSheet('delete-reward-overlay'));
  document.getElementById('fab-add-reward')?.addEventListener('click', () => {
    editRewardId = null;
    document.getElementById('reward-form-title').textContent = 'Add Reward';
    document.getElementById('rf-emoji').value = '🎁';
    document.getElementById('rf-name').value = '';
    document.getElementById('rf-cost').value = '50';
    openSheet('reward-form-overlay');
    setTimeout(() => document.getElementById('rf-name')?.focus(), 300);
  });
  document.getElementById('save-reward-btn')?.addEventListener('click', () => {
    const name = document.getElementById('rf-name').value.trim();
    if (!name) { showToast('Please enter a reward name'); return; }
    const data = {
      emoji: document.getElementById('rf-emoji').value.trim() || '🎁',
      name,
      cost: Math.max(1, parseInt(document.getElementById('rf-cost').value) || 50),
    };
    saveReward(data, editRewardId).then(() => { closeSheets(); render(); });
  });
  document.getElementById('cancel-reward-btn')?.addEventListener('click', () => closeSheet('reward-form-overlay'));

  // ── Category management ──
  on(A.OPEN_CATS, () => {
    renderCatsList();
    openSheet('cats-overlay');
  });
  on(A.ADD_CAT, () => {
    editCatName = null;
    document.getElementById('cat-form-title').textContent = 'Add Category';
    document.getElementById('cf-emoji').value = '📦';
    document.getElementById('cf-name').value = '';
    openSheet('cat-form-overlay');
    setTimeout(() => document.getElementById('cf-name')?.focus(), 300);
  });
  on(A.EDIT_CAT, (el) => {
    const name = el.dataset.name;
    const c = state.categories.find(x => x.name === name);
    if (!c) return;
    editCatName = name;
    document.getElementById('cat-form-title').textContent = 'Edit Category';
    document.getElementById('cf-emoji').value = c.emoji;
    document.getElementById('cf-name').value = c.name;
    openSheet('cat-form-overlay');
  });
  on(A.DELETE_CAT, (el) => {
    const name = el.dataset.name;
    deleteCatName = name;
    const taskCount = state.tasks.filter(t => t.category === name).length;
    document.getElementById('delete-cat-desc').textContent =
      taskCount > 0
        ? `"${name}" has ${taskCount} task${taskCount > 1 ? 's' : ''} assigned to it. Those tasks will be moved to "Other".`
        : `"${name}" has no tasks assigned. It will be permanently removed.`;
    openSheet('delete-cat-overlay');
  });
  document.getElementById('save-cat-btn')?.addEventListener('click', () => {
    const name = document.getElementById('cf-name').value.trim();
    if (!name) { showToast('Please enter a category name'); return; }
    const emoji = document.getElementById('cf-emoji').value.trim() || '📦';
    mutate(s => {
      if (editCatName) {
        s.tasks.forEach(t => { if (t.category === editCatName) t.category = name; });
        const c = s.categories.find(x => x.name === editCatName);
        if (c) { c.name = name; c.emoji = emoji; }
        if (_dashboardExpanded[editCatName] !== undefined) {
          _dashboardExpanded[name] = _dashboardExpanded[editCatName];
          delete _dashboardExpanded[editCatName];
        }
      } else {
        if (s.categories.find(x => x.name === name)) { showToast('Category already exists'); return; }
        s.categories.push({ name, emoji });
      }
    }).then(() => {
      closeSheet('cat-form-overlay');
      renderCatsList();
      render();
    });
  });
  document.getElementById('cancel-cat-btn')?.addEventListener('click', () => closeSheet('cat-form-overlay'));
  document.getElementById('confirm-delete-cat')?.addEventListener('click', () => {
    mutate(s => {
      const fallback = s.categories.find(c => c.name !== deleteCatName)?.name || 'Other';
      s.tasks.forEach(t => { if (t.category === deleteCatName) t.category = fallback; });
      s.categories = s.categories.filter(c => c.name !== deleteCatName);
      if (fallback === 'Other' && !s.categories.find(c => c.name === 'Other')) {
        s.categories.push({ name: 'Other', emoji: '📦' });
      }
      delete _dashboardExpanded[deleteCatName];
    }).then(() => {
      closeSheet('delete-cat-overlay');
      renderCatsList();
      render();
      showToast('Category deleted');
    });
  });
  document.getElementById('cancel-delete-cat')?.addEventListener('click', () => closeSheet('delete-cat-overlay'));

  document.getElementById('close-cats-btn')?.addEventListener('click', () => closeSheet('cats-overlay'));

  // ── History ──
  on(A.DELETE_HISTORY, (el) => {
    const idx = parseInt(el.dataset.idx);
    const h = state.history[idx];
    if (!h) return;
    editHistoryIdx = idx;
    document.getElementById('del-hist-name').textContent = h.name;
    document.getElementById('del-hist-pts').textContent = (h.type === 'redeem' ? '+' : '−') + h.pts;
    document.getElementById('del-hist-date').textContent = fmtDate(h.date);
    openSheet('del-history-overlay');
  });
  on(A.CONFIRM_DEL_HISTORY, () => {
    if (editHistoryIdx === null) return;
    const h = state.history[editHistoryIdx];
    if (h) deleteHistoryEntry(h).then(() => { closeSheets(); render(); });
  });
  document.getElementById('cancel-del-history')?.addEventListener('click', () => closeSheet('del-history-overlay'));

  on(A.EDIT_HISTORY_DATE, (el) => {
    const idx = parseInt(el.dataset.idx);
    const h = state.history[idx];
    if (!h || h.type !== 'earn') return;
    editHistoryIdx = idx;
    document.getElementById('edit-hist-date-input').value = h.date;
    openSheet('edit-history-date-overlay');
  });
  document.getElementById('confirm-edit-hist-date')?.addEventListener('click', () => {
    if (editHistoryIdx === null) return;
    const newDate = document.getElementById('edit-hist-date-input').value;
    if (!newDate) { showToast('Select a date'); return; }
    const h = state.history[editHistoryIdx];
    if (h) updateHistoryDate(h, newDate).then(() => { closeSheets(); render(); });
  });
  document.getElementById('cancel-edit-hist-date')?.addEventListener('click', () => closeSheet('edit-history-date-overlay'));

  // ── Points editing ──
  on(A.START_EDIT_PTS, (el) => {
    const numEl = document.getElementById('pts-num');
    if (!numEl) return;
    const input = document.createElement('input');
    input.className = 'pts-edit';
    input.type = 'number';
    input.value = state.availablePoints;
    input.min = '0';
    numEl.replaceWith(input);
    input.focus();
    input.select();
    function commit() {
      const val = Math.max(0, parseInt(input.value) || 0);
      editPoints(val).then(() => render());
    }
    input.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') render(); });
    input.addEventListener('blur', commit);
  });

  // ── Notifications ──
  on(A.NOTIF_REQUEST, () => requestPermission());
  on(A.TEST_NOTIFICATION, async () => {
    if (Notification.permission !== 'granted') {
      showToast('Enable notifications first');
      return;
    }
    const tasks = state.tasks.filter(t => !isTemp(t));
    if (!tasks.length) { showToast('Add a task first'); return; }
    await beginCycle({ name: 'Test', notifMode: 'individual', taskIds: [tasks[0].id] });
  });

  // ── Sharing ──
  on(A.SHARE_TASKS, () => shareTasksUrl());
  on(A.SHARE_PROFILE, () => shareProfileUrl());
  on(A.EXPORT_JSON, () => exportJson());
  on(A.IMPORT_JSON, () => triggerFileImport());
  document.getElementById('json-import-input')?.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
      import('./sharing.js').then(m => {
        m.handleImportedFile(file);
        this.value = '';
      });
    }
  });
  // Import overlay buttons are wired in sharing.js checkImportParam

  // ── Clear all ──
  on(A.OPEN_CLEAR, () => openSheet('clear-overlay'));
  on(A.CONFIRM_CLEAR, async () => {
    closeSheets();
    showToast('Resetting…');
    await reset();
    showToast('✓ Reset to defaults');
    render();
  });
  document.getElementById('cancel-clear')?.addEventListener('click', () => closeSheet('clear-overlay'));

  // ── Backdrop clicks — close overlays ──
  document.querySelectorAll('.overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeSheet(overlay.id);
    });
  });
}

function renderCatsList() {
  const el = document.getElementById('cats-list');
  if (!el) return;
  if (!state.categories.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--g400);font-size:13px;">No categories yet.</div>';
    return;
  }
  el.innerHTML = state.categories.map((c, i) => {
    const taskCount = state.tasks.filter(t => t.category === c.name).length;
    return `
      <div class="list-item" data-drag-idx="${i}">
        <div class="drag-handle" data-drag-handle>⠿</div>
        <div style="font-size:24px;flex-shrink:0;">${c.emoji}</div>
        <div class="list-item-info">
          <div class="list-item-name">${esc(c.name)}</div>
          <div class="list-item-sub">${taskCount} task${taskCount !== 1 ? 's' : ''}</div>
        </div>
        <div class="list-item-actions">
          <button class="icon-btn icon-btn-edit" data-action="edit-cat" data-name="${esc(c.name)}">✏️</button>
          <button class="icon-btn icon-btn-delete" data-action="delete-cat" data-name="${esc(c.name)}">🗑️</button>
        </div>
      </div>`;
  }).join('');

  import('./drag.js').then(drag => {
    drag.enableDragReorder(el, (fromIdx, toIdx) => {
      const cats = [...state.categories];
      const [moved] = cats.splice(fromIdx, 1);
      if (toIdx === null) cats.push(moved);
      else cats.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, moved);
      state.categories = cats;
      mutate(() => {}).then(() => {
        renderCatsList();
        render();
      });
    });
  });
}
