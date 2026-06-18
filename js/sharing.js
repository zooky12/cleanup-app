import { state, reset, mutate } from './store.js';
import { esc, today, uid } from './utils.js';

function b64enc(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
}

function b64dec(s) {
  const json = atob(s);
  const bytes = Uint8Array.from(json, c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function copyUrl(url) {
  navigator.clipboard.writeText(url).catch(() => prompt('Copy this link:', url));
}

export function shareTasksUrl() {
  const payload = {
    tasks: state.tasks.map(t => ({
      name: t.name,
      category: t.category,
      defaultInterval: t.defaultInterval,
      pointValue: t.pointValue,
    })),
    categories: state.categories,
  };
  copyUrl(location.origin + location.pathname + '?import=' + b64enc(payload));
  import('./components.js').then(({ showToast }) => showToast('✓ Task list link copied!'));
}

export function shareProfileUrl() {
  const payload = {
    tasks: state.tasks,
    categories: state.categories,
    rewards: state.rewards,
    availablePoints: state.availablePoints,
    totalPoints: state.totalPoints,
    history: state.history.slice(-100),
  };
  copyUrl(location.origin + location.pathname + '?profile=' + b64enc(payload));
  import('./components.js').then(({ showToast }) => showToast('✓ Full profile link copied!'));
}

export function checkImportParam() {
  const params = new URLSearchParams(location.search);

  const profEncoded = params.get('profile');
  if (profEncoded) {
    try {
      const p = b64dec(profEncoded);
      const summary = `📋 ${(p.tasks || []).length} tasks<br>
📁 ${(p.categories || []).length} categories<br>
🍬 ${(p.rewards || []).length} rewards<br>
⭐ ${p.availablePoints || 0} available points`;

      document.getElementById('profile-import-summary').innerHTML = summary;
      document.getElementById('confirm-profile-import').onclick = async () => {
        await mutate(s => {
          s.tasks = p.tasks || [];
          s.categories = p.categories || [];
          s.rewards = p.rewards || [];
          s.availablePoints = p.availablePoints || 0;
          s.totalPoints = p.totalPoints || 0;
          s.history = p.history || [];
        }, { immediate: true });
        document.getElementById('profile-import-overlay').classList.remove('open');
        history.replaceState({}, '', location.pathname);
        const { showToast } = await import('./components.js');
        showToast('✓ Profile imported!');
        const { render } = await import('./render.js');
        render();
      };
      document.getElementById('cancel-profile-import').onclick = () => {
        document.getElementById('profile-import-overlay').classList.remove('open');
        history.replaceState({}, '', location.pathname);
      };
      document.getElementById('profile-import-overlay').classList.add('open');
    } catch (e) {
      console.warn('Profile import error', e);
    }
    return;
  }

  const encoded = params.get('import');
  if (!encoded) return;

  try {
    const raw = b64dec(encoded);
    const tasks = Array.isArray(raw) ? raw : (raw.tasks || []);
    const cats = Array.isArray(raw) ? [] : (raw.categories || []);
    if (!tasks.length) return;

    const catNote = cats.length ? ` and ${cats.length} categor${cats.length > 1 ? 'ies' : 'y'}` : '';
    document.getElementById('import-desc').textContent =
      `Someone shared ${tasks.length} task${tasks.length > 1 ? 's' : ''}${catNote} with you:`;
    document.getElementById('import-preview').innerHTML = tasks
      .map(t => `• ${esc(t.name)} <span style="color:var(--g400)">(${esc(t.category)}, every ${t.defaultInterval}d, ⭐${t.pointValue}pts)</span>`)
      .join('<br>');

    const doImport = async (replace) => {
      const t = today();
      await mutate(s => {
        if (replace) s.tasks = [];
        tasks.forEach(d => {
          if (!s.tasks.find(x => x.name === d.name)) {
            s.tasks.push({
              id: uid(),
              name: d.name,
              category: d.category,
              defaultInterval: d.defaultInterval,
              pointValue: d.pointValue,
              nextDue: t,
              lastDone: null,
            });
          }
        });
        cats.forEach(c => {
          if (!s.categories.find(x => x.name === c.name)) s.categories.push(c);
        });
      });
      document.getElementById('import-overlay').classList.remove('open');
      history.replaceState({}, '', location.pathname);
      const { showToast } = await import('./components.js');
      showToast('✓ Imported!');
      const { render } = await import('./render.js');
      render();
    };

    document.getElementById('confirm-import-add').onclick = () => doImport(false);
    document.getElementById('confirm-import-replace').onclick = () => doImport(true);
    document.getElementById('cancel-import').onclick = () => {
      document.getElementById('import-overlay').classList.remove('open');
      history.replaceState({}, '', location.pathname);
    };
    document.getElementById('import-overlay').classList.add('open');
  } catch (e) {
    console.warn('Import error', e);
  }
}

export function exportJson() {
  const payload = {
    tasks: state.tasks,
    categories: state.categories,
    rewards: state.rewards,
    availablePoints: state.availablePoints,
    totalPoints: state.totalPoints,
    history: state.history,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cleanup-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  import('./components.js').then(({ showToast }) => showToast('✓ Backup downloaded!'));
}

export function triggerFileImport() {
  document.getElementById('json-import-input').click();
}

export function handleImportedFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.tasks || !Array.isArray(data.tasks)) {
        import('./components.js').then(({ showToast }) => showToast('Invalid backup file'));
        return;
      }
      document.getElementById('json-import-summary').innerHTML =
        `📋 ${data.tasks.length} tasks<br>
📁 ${(data.categories || []).length} categories<br>
🍬 ${(data.rewards || []).length} rewards<br>
⭐ ${data.availablePoints || 0} available points<br>
📜 ${(data.history || []).length} history entries`;

      document.getElementById('confirm-json-import').onclick = async () => {
        await mutate(s => {
          s.tasks = data.tasks || [];
          s.categories = data.categories || [];
          s.rewards = data.rewards || [];
          s.availablePoints = data.availablePoints || 0;
          s.totalPoints = data.totalPoints || 0;
          s.history = data.history || [];
        }, { immediate: true });
        document.getElementById('json-import-overlay').classList.remove('open');
        const { showToast } = await import('./components.js');
        showToast('✓ Data imported!');
        const { render } = await import('./render.js');
        render();
      };
      document.getElementById('cancel-json-import').onclick = () => {
        document.getElementById('json-import-overlay').classList.remove('open');
      };
      document.getElementById('json-import-overlay').classList.add('open');
    } catch (err) {
      import('./components.js').then(({ showToast }) => showToast('Could not read file'));
    }
  };
  reader.readAsText(file);
}
