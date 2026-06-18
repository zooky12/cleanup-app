export function enableDragReorder(container, onReorder) {
  let dragIdx = -1;
  let clone = null;
  let startY = 0;
  let active = false;

  function items() {
    return [...container.querySelectorAll('[data-drag-idx]')];
  }

  function py(e) {
    return (e.touches ? e.touches[0] : e).clientY;
  }

  function others() {
    return items().filter(el => parseInt(el.dataset.dragIdx) !== dragIdx);
  }

  function start(e, item) {
    dragIdx = parseInt(item.dataset.dragIdx);
    startY = py(e);
    active = true;
    item.classList.add('dragging');
    const r = item.getBoundingClientRect();
    clone = item.cloneNode(true);
    Object.assign(clone.style, {
      position: 'fixed',
      top: r.top + 'px',
      left: r.left + 'px',
      width: r.width + 'px',
      zIndex: 9999,
      opacity: 0.9,
      margin: '0',
      boxShadow: '0 8px 28px rgba(0,0,0,.22)',
      pointerEvents: 'none',
    });
    document.body.appendChild(clone);
  }

  function move(e) {
    if (!clone || !active) return;
    e.preventDefault();
    const dy = py(e) - startY;
    const r = items()[dragIdx]?.getBoundingClientRect();
    if (!r) return;
    clone.style.top = r.top + dy + 'px';
    others().forEach(el => el.classList.remove('drag-over'));
    const y = py(e);
    for (const el of others()) {
      const br = el.getBoundingClientRect();
      if (y < br.top + br.height * 0.5) {
        el.classList.add('drag-over');
        break;
      }
    }
  }

  function end(e) {
    if (!clone || !active) return;
    active = false;
    const y = (e.changedTouches ? e.changedTouches[0] : e).clientY;
    let insertOrigIdx = null;
    for (const el of others()) {
      const br = el.getBoundingClientRect();
      if (y < br.top + br.height * 0.5) {
        insertOrigIdx = parseInt(el.dataset.dragIdx);
        break;
      }
    }
    onReorder(dragIdx, insertOrigIdx);
    clone.remove();
    clone = null;
    items().forEach(el => el.classList.remove('dragging', 'drag-over'));
    document.removeEventListener('mousemove', handleMove);
    document.removeEventListener('mouseup', handleEnd);
  }

  const handleMove = e => move(e);
  const handleEnd = e => end(e);

  container.addEventListener('touchstart', e => {
    const item = e.target.closest('[data-drag-handle]')?.closest('[data-drag-idx]');
    if (!item) return;
    e.preventDefault();
    start(e, item);
  }, { passive: false });

  container.addEventListener('touchmove', move, { passive: false });
  container.addEventListener('touchend', end);

  container.addEventListener('mousedown', e => {
    const item = e.target.closest('[data-drag-handle]')?.closest('[data-drag-idx]');
    if (!item) return;
    start(e, item);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
  });

  return () => {
    // dispose — not needed for now
  };
}
