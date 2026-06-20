import { open, dbGet, dbPut, dbDel, dbClear } from './idb.js';
import { uid, today } from './utils.js';

const FALLBACK_CATS = [
  { name: 'Manteniment', emoji: '💪' }, { name: 'Cuina', emoji: '🍽' },
  { name: 'Bany', emoji: '🚿' }, { name: 'Habitacio', emoji: '🛏' },
  { name: 'General', emoji: '🧹' }, { name: 'Roba', emoji: '👕' },
  { name: 'Altres', emoji: '📦' },
];

const FALLBACK_TASKS = [
  { name: 'Treure basura', category: 'Cuina', defaultInterval: 2, pointValue: 5 },
  { name: 'Rentar plats', category: 'Cuina', defaultInterval: 1, pointValue: 5 },
  { name: 'Repas general (cuina)', category: 'Cuina', defaultInterval: 7, pointValue: 10 },
  { name: 'Netejar marbre', category: 'Cuina', defaultInterval: 3, pointValue: 5 },
  { name: 'Ordenar nevera', category: 'Cuina', defaultInterval: 14, pointValue: 10 },
  { name: 'Ordenar estanteries', category: 'Cuina', defaultInterval: 14, pointValue: 5 },
  { name: 'Netejar bater', category: 'Bany', defaultInterval: 7, pointValue: 5 },
  { name: 'Netejar pica', category: 'Bany', defaultInterval: 7, pointValue: 5 },
  { name: 'Netejar dutxa', category: 'Bany', defaultInterval: 14, pointValue: 10 },
  { name: 'Posar/Estendre rentadora', category: 'Roba', defaultInterval: 4, pointValue: 10 },
  { name: 'Ordenar Armari', category: 'Roba', defaultInterval: 14, pointValue: 10 },
  { name: 'Fregar terra', category: 'General', defaultInterval: 7, pointValue: 10 },
  { name: 'Netejar Rumi', category: 'General', defaultInterval: 2, pointValue: 5 },
  { name: 'Canviar llençols', category: 'Habitacio', defaultInterval: 14, pointValue: 10 },
  { name: 'Netejar escriptori', category: 'Habitacio', defaultInterval: 7, pointValue: 5 },
  { name: 'Treure la pols', category: 'Habitacio', defaultInterval: 14, pointValue: 10 },
  { name: 'Fer exercici', category: 'Manteniment', defaultInterval: 1, pointValue: 10 },
  { name: 'Programar', category: 'Manteniment', defaultInterval: 1, pointValue: 10 },
  { name: 'Dents', category: 'Manteniment', defaultInterval: 1, pointValue: 5 },
  { name: 'Dutxa', category: 'Manteniment', defaultInterval: 2, pointValue: 5 },
  { name: 'Fer tasca pendent', category: 'Manteniment', defaultInterval: 1, pointValue: 5 },
];

const FALLBACK_REWARDS = [
  { id: 'r1', name: 'Kinder', emoji: '🍫', cost: 10 },
  { id: 'r2', name: 'Croissants', emoji: '🥐', cost: 60 },
  { id: 'r3', name: 'Galetes', emoji: '🍪', cost: 60 },
];

export const state = {
  tasks: [],
  categories: [],
  totalPoints: 0,
  availablePoints: 0,
  history: [],
  rewards: [],
  activeCycles: [],
  notificationSubscribed: false,
  scheduled: [],
};

let _saveTimer = null;
let _fileHandle = null;

export async function init() {
  const raw = await dbGet('state', 'current');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      Object.assign(state, parsed);
    } catch (e) { /* use defaults */ }
  }
  if (!state.categories?.length) state.categories = FALLBACK_CATS;
  if (!state.rewards?.length) state.rewards = FALLBACK_REWARDS;
  if (state.activeCycle !== undefined && !state.activeCycles) {
    state.activeCycles = state.activeCycle ? [state.activeCycle] : [];
    delete state.activeCycle;
  }
  if (!Array.isArray(state.activeCycles)) state.activeCycles = [];
  if (!Array.isArray(state.scheduled)) state.scheduled = [];

  try { _fileHandle = await dbGet('meta', 'fileHandle') || null; } catch (e) { _fileHandle = null; }

  return !raw;
}

export async function save() {
  clearTimeout(_saveTimer);
  return new Promise(resolve => {
    _saveTimer = setTimeout(async () => {
      await _writeIdb();
      resolve();
    }, 100);
  });
}

export async function saveImmediate() {
  clearTimeout(_saveTimer);
  await _writeIdb();
}

async function _writeIdb() {
  try {
    const db = await open();
    const tx = db.transaction(['state', 'cycle'], 'readwrite');
    tx.objectStore('state').put(JSON.stringify(state), 'current');
    if (state.activeCycles.length) {
      tx.objectStore('cycle').put(JSON.stringify(state.activeCycles), 'active');
    } else {
      tx.objectStore('cycle').delete('active');
    }
    await new Promise(r => { tx.oncomplete = r; tx.onerror = r; });
  } catch (e) {
    console.warn('IDB write failed', e);
  }
  _writeFile().catch(() => {});
}

async function _writeFile() {
  if (!_fileHandle) return;
  try {
    const writable = await _fileHandle.createWritable();
    await writable.write(JSON.stringify(state, null, 2));
    await writable.close();
  } catch (e) {
    console.warn('File backup write failed', e.name);
  }
}

export async function linkBackupFile() {
  if (!window.showSaveFilePicker) return { ok: false, reason: 'not-supported' };
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'cleanup-backup.json',
      types: [{ description: 'JSON backup', accept: { 'application/json': ['.json'] } }],
    });
    _fileHandle = handle;
    await dbPut('meta', 'fileHandle', handle);
    await _writeFile();
    return { ok: true, filename: handle.name };
  } catch (e) {
    if (e.name === 'AbortError') return { ok: false, reason: 'cancelled' };
    return { ok: false, reason: 'error' };
  }
}

export async function unlinkBackupFile() {
  _fileHandle = null;
  await dbDel('meta', 'fileHandle');
}

export function fileBackupStatus() {
  return { linked: !!_fileHandle, filename: _fileHandle?.name || null };
}

export async function mutate(fn, { immediate = false } = {}) {
  fn(state);
  if (immediate) await saveImmediate();
  else await save();
}

export async function seed() {
  let cats = FALLBACK_CATS;
  let tasks = FALLBACK_TASKS;
  let rewards = FALLBACK_REWARDS;

  try {
    const res = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
    if (res.ok) {
      const d = await res.json();
      cats = d.categories || cats;
      tasks = d.tasks || tasks;
      rewards = d.rewards || rewards;
    }
  } catch (e) { /* use fallbacks */ }

  const t = today();
  state.categories = cats;
  state.tasks = tasks.map(d => ({
    id: uid(),
    name: d.name,
    category: d.category,
    defaultInterval: d.defaultInterval,
    pointValue: d.pointValue,
    nextDue: t,
    lastDone: null,
  }));
  state.rewards = rewards.map(r => ({ ...r, id: r.id || uid() }));
  await saveImmediate();
}

export async function reset() {
  state.tasks = [];
  state.categories = [];
  state.totalPoints = 0;
  state.availablePoints = 0;
  state.history = [];
  state.rewards = [];
  state.activeCycles = [];
  state.scheduled = [];
  try {
    const db = await open();
    const tx = db.transaction(['state', 'cycle', 'pending_ops', 'meta'], 'readwrite');
    tx.objectStore('state').clear();
    tx.objectStore('cycle').clear();
    tx.objectStore('pending_ops').clear();
    tx.objectStore('meta').clear();
    await new Promise(r => { tx.oncomplete = r; tx.onerror = r; });
  } catch (e) { /* ok */ }
  await seed();
}
