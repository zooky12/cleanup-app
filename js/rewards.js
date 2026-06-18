import { state, mutate } from './store.js';
import { today, uid } from './utils.js';

export async function redeemReward(reward) {
  if (state.availablePoints < reward.cost) return;
  await mutate(s => {
    s.availablePoints -= reward.cost;
    s.history.push({
      name: reward.name,
      pts: reward.cost,
      date: today(),
      type: 'redeem',
    });
  });
  const { showToast, triggerConfetti } = await import('./components.js');
  triggerConfetti();
  showToast(`🎉 Enjoy your ${reward.name}!`);
}

export async function saveReward(data, editId) {
  await mutate(s => {
    if (editId) {
      const r = s.rewards.find(x => x.id === editId);
      if (r) Object.assign(r, data);
    } else {
      s.rewards.push({ id: uid(), ...data });
    }
  });
  const { showToast } = await import('./components.js');
  showToast(editId ? 'Reward updated!' : 'Reward added!');
}

export async function deleteReward(id) {
  await mutate(s => {
    s.rewards = s.rewards.filter(r => r.id !== id);
  });
  const { showToast } = await import('./components.js');
  showToast('Reward deleted');
}

export async function editPoints(newValue) {
  await mutate(s => {
    const diff = newValue - s.availablePoints;
    s.availablePoints = Math.max(0, newValue);
    if (diff !== 0) {
      s.history.push({
        name: 'Manual adjustment',
        pts: Math.abs(diff),
        date: today(),
        type: diff >= 0 ? 'earn' : 'redeem',
      });
    }
  });
}
