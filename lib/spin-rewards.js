export const DEFAULT_PRIZES = [
  { label: '5% OFF', type: 'PERCENT', value: 5 },
  { label: '10% OFF', type: 'PERCENT', value: 10 },
  { label: '₹20 OFF', type: 'FLAT', value: 20 },
  { label: '₹30 OFF', type: 'FLAT', value: 30 }
];
export const NO_REWARD = { label: 'Better luck next time', type: 'NONE', value: 0 };
export function normalizePrize(prize) {
  const type = prize?.type;
  if (type === 'NONE' || /better luck/i.test(prize?.label || '')) return { ...NO_REWARD };
  if (type === 'FREE_ITEM') {
    const menuItemId = String(prize.menuItemId || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(menuItemId)) throw new Error('Choose a menu item for every free reward.');
    return { type, value: 0, menuItemId, category: ['FOOD', 'COLD_DRINK', 'BEVERAGE'].includes(prize.category) ? prize.category : 'FOOD', label: String(prize.label || 'Free item').slice(0, 80) };
  }
  const value = Number(prize?.value);
  if (!['PERCENT', 'FLAT'].includes(type) || !Number.isFinite(value) || value <= 0 || value > (type === 'PERCENT' ? 100 : 100000)) throw new Error('Enter a percentage from 1 to 100, or a positive discount amount.');
  return { type, value, label: type === 'PERCENT' ? `${value}% OFF` : `₹${value} OFF` };
}
export function cleanPrizes(prizes) {
  return DEFAULT_PRIZES.map((fallback, index) => {
    try { return normalizePrize(prizes?.[index] || fallback); } catch { return { ...NO_REWARD }; }
  });
}
// Shared clockwise order. Each slice is centred at index * 60°, with zero at the pointer.
export function wheelSlots(prizes) { return [prizes[0], NO_REWARD, prizes[1], prizes[2], NO_REWARD, prizes[3]]; }
export function wheelRotation(segment, previous = 0) {
  if (!Number.isInteger(segment) || segment < 0 || segment > 5) throw new Error('Invalid wheel result');
  const target = (360 - segment * 60) % 360;
  return previous + 1800 + ((target - previous % 360 + 360) % 360);
}
export function rewardDiscount(reward, lines, subtotal) {
  if (!reward) return 0;
  const type = reward.type || reward.reward_type;
  const value = Number(reward.value ?? reward.reward_value ?? 0);
  let discount = 0;
  if (type === 'PERCENT') discount = Math.round(subtotal * Math.min(100, value) / 100);
  if (type === 'FLAT') discount = value;
  if (type === 'FREE_ITEM') {
    const id = reward.menuItemId || reward.reward_details?.menuItemId;
    const line = lines.find(item => (item.menu_item_id || item.menuItemId || item.id) === id && item.quantity > 0);
    if (!id || !line) throw new Error(`Add the free reward item to the order: ${reward.label}.`);
    discount = Number(line.unit_price ?? line.price);
  }
  return Math.max(0, Math.min(subtotal, discount));
}
