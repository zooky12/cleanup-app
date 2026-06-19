export const A = {
  DONE: 'done',
  SNOOZE: 'snooze',
  CONFIRM_DONE: 'confirm-done',
  TOGGLE_CAT: 'toggle-cat',
  TOGGLE_TASK: 'toggle-task',
  REMOVE_TASK: 'remove-task',
  CLOSE_SHEETS: 'close-sheets',
  OPEN_TASK_EDITOR: 'open-task-editor',
  EDIT_TASK: 'edit-task',
  DELETE_TASK: 'delete-task',
  CONFIRM_DELETE_TASK: 'confirm-delete-task',
  SAVE_TASK: 'save-task',
  ADD_TASK: 'add-task',
  REDEEM: 'redeem',
  EDIT_REWARD: 'edit-reward',
  DELETE_REWARD: 'delete-reward',
  CONFIRM_DELETE_REWARD: 'confirm-delete-reward',
  SAVE_REWARD: 'save-reward',
  BEGIN_CYCLE: 'begin-cycle',
  CANCEL_CYCLE: 'cancel-cycle',
  EDIT_CYCLE: 'edit-cycle',
  ADD_MORE_TO_CYCLE: 'add-more-to-cycle',
  ADD_TEMP_TASK: 'add-temp-task',
  CAL_DAY: 'cal-day',
  CAL_PREV: 'cal-prev',
  CAL_NEXT: 'cal-next',
  CAL_ADD_COMPLETION: 'cal-add-completion',
  CONFIRM_CAL_ADD: 'confirm-cal-add',
  OPEN_CATS: 'open-cats',
  ADD_CAT: 'add-cat',
  EDIT_CAT: 'edit-cat',
  DELETE_CAT: 'delete-cat',
  CONFIRM_DELETE_CAT: 'confirm-delete-cat',
  SAVE_CAT: 'save-cat',
  OPEN_CLEAR: 'open-clear',
  CONFIRM_CLEAR: 'confirm-clear',
  EXPORT_JSON: 'export-json',
  IMPORT_JSON: 'import-json',
  SHARE_TASKS: 'share-tasks',
  SHARE_PROFILE: 'share-profile',
  START_EDIT_PTS: 'start-edit-pts',
  NOTIF_REQUEST: 'notif-request',
  DELETE_HISTORY: 'delete-history',
  CONFIRM_DEL_HISTORY: 'confirm-del-history',
  EDIT_HISTORY_DATE: 'edit-history-date',
  CONFIRM_EDIT_HIST_DATE: 'confirm-edit-hist-date',
  CANCEL_IMPORT: 'cancel-import',
  CONFIRM_IMPORT_ADD: 'confirm-import-add',
  CONFIRM_IMPORT_REPLACE: 'confirm-import-replace',
  CONFIRM_PROFILE_IMPORT: 'confirm-profile-import',
  CONFIRM_JSON_IMPORT: 'confirm-json-import',
  ALL_DONE_FILTER: 'all-done-filter',
  TASK_CAL_FILTER: 'task-cal-filter',
  NAV_DASHBOARD: 'nav-dashboard',
  NAV_CALENDAR: 'nav-calendar',
  NAV_REWARDS: 'nav-rewards',
  NAV_OPTIONS: 'nav-options',
  TEST_NOTIFICATION: 'test-notification',
};

const _handlers = new Map();

export function on(action, handler) {
  if (!_handlers.has(action)) _handlers.set(action, []);
  const list = _handlers.get(action);
  if (!list.includes(handler)) list.push(handler);
}

export function off(action, handler) {
  const list = _handlers.get(action);
  if (list) _handlers.set(action, list.filter(h => h !== handler));
}

export function dispatch(action, el, e) {
  const list = _handlers.get(action);
  if (list) {
    for (const handler of list) {
      handler(el, e);
    }
  }
}

export function init() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    e._trigger = el;
    dispatch(action, el, e);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      dispatch(A.CLOSE_SHEETS, null, e);
    }
  });
}
