export function createSelection({ onChange } = {}) {
  let _ids = new Set();
  let _order = [];

  return {
    toggle(id) {
      if (_ids.has(id)) {
        _ids.delete(id);
        _order = _order.filter(x => x !== id);
      } else {
        _ids.add(id);
        if (!_order.includes(id)) _order.push(id);
      }
      onChange?.();
    },

    remove(id) {
      _ids.delete(id);
      _order = _order.filter(x => x !== id);
      onChange?.();
    },

    has(id) {
      return _ids.has(id);
    },

    get items() {
      return _order.filter(id => _ids.has(id));
    },

    get size() {
      return _ids.size;
    },

    reorder(newOrder) {
      _order = newOrder.filter(id => _ids.has(id));
      onChange?.();
    },

    set(ids) {
      _ids = new Set(ids);
      _order = [...ids];
      onChange?.();
    },

    clear() {
      _ids.clear();
      _order = [];
      onChange?.();
    },
  };
}
