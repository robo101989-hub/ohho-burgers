export function calculatePackagingConsumption({ rules = [], orderType, orderItems = [], menuItems = [] }) {
  const menuMap = new Map(menuItems.map(item => [item.id, item]));
  const orderItemCount = orderItems.reduce((sum, line) => sum + Math.max(0, Number(line.quantity || 0)), 0);
  const totals = new Map();
  for (const rule of rules) {
    if (rule.active === false || !(rule.order_types || []).includes(orderType)) continue;
    let multiplier = 0;
    if (rule.consumption_type === 'PER_ORDER') multiplier = 1;
    if (rule.consumption_type === 'PER_MENU_ITEM') multiplier = orderItems.filter(line => line.menu_item_id === rule.menu_item_id).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    if (rule.consumption_type === 'PER_MENU_CATEGORY') multiplier = orderItems.filter(line => menuMap.get(line.menu_item_id)?.category_id === rule.menu_category_id).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    if (rule.consumption_type === 'PER_ORDER_SIZE') {
      const tier = orderItemCount === 1 ? 'SMALL' : orderItemCount === 2 ? 'MEDIUM' : orderItemCount >= 3 ? 'LARGE' : null;
      multiplier = tier && rule.order_size_tier === tier ? 1 : 0;
    }
    const used = multiplier * Number(rule.consumption_quantity || 0);
    if (used > 0) totals.set(rule.item_id, (totals.get(rule.item_id) || 0) + used);
  }
  return [...totals].map(([itemId, quantity]) => ({ itemId, quantity }));
}
