const CACHE_NAME = "cleanup-v2";
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon.svg", "./data.json"];

const VAPID_PUBLIC_KEY = "BEGiBNfVeFivNRT9QhdpL0FkC-5jWBaRhLxEDovNb83hRLlwIYPciA4HO_Er2D_4o0i4YFo4GJom3X4ap_qkYOg";
const PUSH_SERVER = ""; // ← Set to your Deno Deploy URL after deployment

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
});

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("cleanup_idb", 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("state")) db.createObjectStore("state");
      if (!db.objectStoreNames.contains("cycle")) db.createObjectStore("cycle");
      if (!db.objectStoreNames.contains("pending_ops")) db.createObjectStore("pending_ops", { autoIncrement: true });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getFromIDB(store, key) {
  try {
    const db = await openIDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => { resolve(req.result); db.close(); };
      req.onerror = () => { resolve(null); db.close(); };
    });
  } catch { return null; }
}

async function putToIDB(store, key, val) {
  try {
    const db = await openIDB();
    await new Promise((resolve) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(val, key);
      tx.oncomplete = () => { resolve(); db.close(); };
    });
  } catch {}
}

async function delFromIDB(store, key) {
  try {
    const db = await openIDB();
    await new Promise((resolve) => {
      const tx = db.transaction(store, "readwrite");
      if (key) tx.objectStore(store).delete(key);
      else tx.objectStore(store).clear();
      tx.oncomplete = () => { resolve(); db.close(); };
    });
  } catch {}
}

self.addEventListener("push", (e) => {
  e.waitUntil(handlePush());
});

async function handlePush() {
  let cycles = await getFromIDB("cycle", "active");
  if (typeof cycles === "string") { try { cycles = JSON.parse(cycles); } catch(e) { cycles = null; } }
  if (cycles && cycles.length) return;

  const lastDate = await getFromIDB("meta", "lastReminderDate");
  const today = new Date().toISOString().split("T")[0];
  if (lastDate === today) return;

  const raw = await getFromIDB("state", "current");
  if (!raw) return;
  const state = JSON.parse(raw);

  if (!state.tasks?.length) return;

  const overdue = state.tasks.filter((t) => t.nextDue < today);
  const dueToday = state.tasks.filter((t) => t.nextDue === today);
  if (!overdue.length && !dueToday.length) return;

  let body;
  if (overdue.length && dueToday.length) body = `⚠ ${overdue.length} overdue · ${dueToday.length} due today`;
  else if (overdue.length) body = `⚠ ${overdue.length} overdue`;
  else body = `📋 ${dueToday.length} due today`;

  const allDue = [...overdue, ...dueToday].sort((a, b) => a.nextDue.localeCompare(b.nextDue)).slice(0, 3);
  if (allDue.length) {
    body += "\n" + allDue.map((t) => t.name).join(", ");
  }

  self.registration.showNotification("CleanUp", {
    body,
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: "daily-reminder",
    requireInteraction: true,
    actions: [
      { action: "configure", title: "📋 Configure cycle" },
      { action: "dismiss", title: "🔕 Later" },
    ],
    data: { type: "daily-reminder", timestamp: Date.now() },
  });

  await putToIDB("meta", "lastReminderDate", today);
}

self.addEventListener("notificationclick", (e) => {
  const action = e.action;
  const data = e.notification.data || {};
  const tag = e.notification.tag;
  e.notification.close();

  if (action === "dismiss") return;

  if (action === "configure") {
    e.waitUntil((async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of clients) {
        if (c.url.startsWith(self.location.origin)) {
          await c.focus();
          c.postMessage({ type: "navigate", view: "pending" });
          return;
        }
      }
      clients.openWindow("./?view=pending");
    })());
    return;
  }

  if (action === "done") {
    e.waitUntil(cycleDone(data));
    return;
  }

  if (action === "snooze") {
    e.waitUntil(cycleSnooze(data));
    return;
  }

  e.waitUntil(openOrFocus("./"));
});

async function openOrFocus(url) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of clients) {
    if (c.url.startsWith(self.location.origin)) {
      await c.focus();
      return;
    }
  }
  return self.clients.openWindow(url);
}

async function getCycles() {
  let raw = await getFromIDB("cycle", "active");
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch(e) { return []; } }
  return Array.isArray(raw) ? raw : [];
}

async function saveCycles(cycles) {
  if (cycles.length) await putToIDB("cycle", "active", JSON.stringify(cycles));
  else await delFromIDB("cycle", "active");
}

function findCycle(cycles, cycleId) {
  return cycles.find(c => c.cycleId === cycleId);
}

async function cycleDone(data) {
  const cycles = await getCycles();
  const cycle = findCycle(cycles, data.cycleId);
  if (!cycle || !cycle.tasks[data.taskIndex]) return;

  const task = cycle.tasks[data.taskIndex];

  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  let pageAlive = false;
  for (const c of clients) {
    if (c.url.startsWith(self.location.origin)) {
      c.postMessage({ type: "task-action", taskId: task.taskId, taskName: task.name, pointValue: task.pointValue, catEmoji: task.catEmoji||'', action: "done", cycleId: cycle.cycleId, taskIndex: data.taskIndex });
      pageAlive = true;
      break;
    }
  }

  if (!pageAlive) {
    await putToIDB("pending_ops", undefined, {
      taskId: task.taskId, taskName: task.name, pointValue: task.pointValue, catEmoji: task.catEmoji||'', action: "done", time: Date.now(), taskIndex: data.taskIndex,
    });
  }

  if (cycle.notifMode === 'simultaneous') {
    task.done = true;
    if (cycle.tasks.every(t => t.done)) {
      const remaining = cycles.filter(c => c.cycleId !== cycle.cycleId);
      await saveCycles(remaining);
      self.registration.showNotification("🎉 All done!", {
        body: `Completed ${cycle.tasks.length} tasks. Well done!`,
        icon: "/icon.svg",
        tag: `cycle-complete-${cycle.cycleId}`,
        data: { type: "cycle-complete", cycleId: cycle.cycleId, count: cycle.tasks.length },
      });
      for (const c of clients) {
        if (c.url.startsWith(self.location.origin)) {
          c.postMessage({ type: "cycle-complete", cycleId: cycle.cycleId, count: cycle.tasks.length });
          break;
        }
      }
    } else {
      await saveCycles(cycles);
    }
  } else {
    cycle.currentIdx++;
    await advanceCycle(cycle, cycles);
  }
}

async function cycleSnooze(data) {
  const cycles = await getCycles();
  const cycle = findCycle(cycles, data.cycleId);
  if (!cycle || !cycle.tasks[data.taskIndex]) return;

  if (cycle.notifMode === 'simultaneous') {
    return;
  }

  const task = cycle.tasks[cycle.currentIdx];

  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  let pageAlive = false;
  for (const c of clients) {
    if (c.url.startsWith(self.location.origin)) {
      c.postMessage({ type: "task-action", taskId: task.taskId, taskName: task.name, pointValue: task.pointValue, action: "snooze", cycleId: cycle.cycleId });
      pageAlive = true;
      break;
    }
  }

  if (!pageAlive) {
    await putToIDB("pending_ops", undefined, {
      taskId: task.taskId, taskName: task.name, pointValue: task.pointValue, action: "snooze", time: Date.now(),
    });
  }

  cycle.currentIdx++;
  await advanceCycle(cycle, cycles);
}

async function advanceCycle(cycle, cycles) {
  if (cycle.currentIdx >= cycle.tasks.length) {
    const remaining = cycles.filter(c => c.cycleId !== cycle.cycleId);
    await saveCycles(remaining);
    self.registration.showNotification("🎉 All done!", {
      body: `Completed ${cycle.tasks.length} tasks. Well done!`,
      icon: "/icon.svg",
      tag: `cycle-complete-${cycle.cycleId}`,
      data: { type: "cycle-complete", cycleId: cycle.cycleId, count: cycle.tasks.length },
    });
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clients) {
      if (c.url.startsWith(self.location.origin)) {
        c.postMessage({ type: "cycle-complete", cycleId: cycle.cycleId, count: cycle.tasks.length });
        break;
      }
    }
    return;
  }

  await saveCycles(cycles);

  const next = cycle.tasks[cycle.currentIdx];
  const emoji = next.catEmoji || "";
  const title = `Task ${cycle.currentIdx + 1}/${cycle.tasks.length}`;
  const body = `${emoji} ${next.name} · ⭐ ${next.pointValue} pts`;
  self.registration.showNotification(title, {
    body,
    icon: "/icon.svg",
    tag: `cycle-task-${cycle.cycleId}`,
    requireInteraction: true,
    actions: [
      { action: "done", title: "✓ Done" },
      { action: "snooze", title: "📅 Snooze +1d" },
    ],
    data: { type: "cycle-task", cycleId: cycle.cycleId, taskIndex: cycle.currentIdx },
  });
}

self.addEventListener("pushsubscriptionchange", (e) => {
  if (!PUSH_SERVER || !VAPID_PUBLIC_KEY) return;
  e.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: VAPID_PUBLIC_KEY,
    }).then((sub) =>
      fetch(PUSH_SERVER + "/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      }).catch(() => {})
    ).catch(() => {})
  );
});
