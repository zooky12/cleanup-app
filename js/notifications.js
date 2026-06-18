import { state, mutate } from './store.js';

const VAPID_PUBLIC_KEY = 'BEGiBNfVeFivNRT9QhdpL0FkC-5jWBaRhLxEDovNb83hRLlwIYPciA4HO_Er2D_4o0i4YFo4GJom3X4ap_qkYOg';
const PUSH_SERVER = '';

function urlB64ToUint8Array(b64) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

export async function requestPermission() {
  if (!('Notification' in window)) {
    const { showToast } = await import('./components.js');
    showToast('Notifications not supported');
    return;
  }
  if (Notification.permission === 'granted') {
    await subscribe();
    return;
  }
  if (Notification.permission === 'denied') {
    const { showToast } = await import('./components.js');
    showToast('Notifications blocked. Enable in browser settings.');
    return;
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    await subscribe();
  } else {
    const { showToast } = await import('./components.js');
    showToast('Notification permission denied');
  }
}

export async function subscribe() {
  if (!('serviceWorker' in navigator) || !VAPID_PUBLIC_KEY || !PUSH_SERVER) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const res = await fetch(PUSH_SERVER + '/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });
    if (res.ok) {
      await mutate(s => { s.notificationSubscribed = true; });
      const { showToast } = await import('./components.js');
      showToast('Notifications enabled!');
    }
  } catch (e) {
    const { showToast } = await import('./components.js');
    showToast('Could not subscribe: ' + e.message);
  }
}

export async function unsubscribe() {
  // Not fully implemented — would need a PUSH_SERVER DELETE endpoint
}
