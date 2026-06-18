const DB_NAME = 'cleanup_idb';
const DB_VERSION = 1;

let _db = null;

export async function open() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
      if (!db.objectStoreNames.contains('cycle')) db.createObjectStore('cycle');
      if (!db.objectStoreNames.contains('pending_ops')) db.createObjectStore('pending_ops', { autoIncrement: true });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function dbGet(store, key) {
  const db = await open();
  return new Promise(resolve => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function dbGetAll(store) {
  const db = await open();
  return new Promise(resolve => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve([]);
  });
}

export async function dbPut(store, key, val) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbDel(store, key) {
  const db = await open();
  return new Promise(resolve => {
    const tx = db.transaction(store, 'readwrite');
    if (key) tx.objectStore(store).delete(key);
    else tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
  });
}

export async function dbClear(store) {
  return dbDel(store, null);
}
