export function calculateStaffConsumption(rules = [], staffCount = 0) {
  const count = Number(staffCount);
  if (!Number.isInteger(count) || count <= 0) return [];
  return rules
    .filter(rule => rule.active !== false && Number(rule.quantity_per_staff) > 0)
    .map(rule => ({
      itemId: rule.item_id,
      quantity: Number(rule.quantity_per_staff) * (rule.consumption_basis === 'PER_SESSION' ? 1 : count)
    }));
}
