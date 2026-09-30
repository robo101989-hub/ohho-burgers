export function calculatePackagingConsumption({ rules = [], orderType, orderItems = [], menuItems = [] }) {
  const menuMap = new Map(menuItems.map(item => [item.id, item]));
  const orderItemCount = orderItems.reduce((sum, line) => sum + Math.max(0, Number(line.quantity || 0)), 0);
  const tierRank = { SMALL: 1, MEDIUM: 2, LARGE: 3 };
  const rankTier = rank => rank >= 3 ? 'LARGE' : rank === 2 ? 'MEDIUM' : 'SMALL';
  const totals = new Map();
  for (const rule of rules) {
    if (rule.active === false || !(rule.order_types || []).includes(orderType)) continue;
    let multiplier = 0;
    if (rule.consumption_type === 'PER_ORDER') multiplier = 1;
    if (rule.consumption_type === 'PER_MENU_ITEM') multiplier = orderItems.filter(line => line.menu_item_id === rule.menu_item_id).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    if (rule.consumption_type === 'PER_MENU_CATEGORY') multiplier = orderItems.filter(line => menuMap.get(line.menu_item_id)?.category_id === rule.menu_category_id).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    if (rule.consumption_type === 'PER_ORDER_SIZE' && !rule.packaging_group) {
      const tier = orderItemCount === 1 ? 'SMALL' : orderItemCount === 2 ? 'MEDIUM' : orderItemCount >= 3 ? 'LARGE' : null;
      multiplier = tier && rule.order_size_tier === tier ? 1 : 0;
    }
    if (['MINIMUM_ITEM_SIZE','MINIMUM_CATEGORY_SIZE'].includes(rule.consumption_type)) continue;
    const used = multiplier * Number(rule.consumption_quantity || 0);
    if (used > 0) totals.set(rule.item_id, (totals.get(rule.item_id) || 0) + used);
  }
  const groups = [...new Set(rules.filter(rule => rule.active !== false && rule.packaging_group && rule.consumption_type === 'PER_ORDER_SIZE' && (rule.order_types || []).includes(orderType)).map(rule => rule.packaging_group))];
  for (const group of groups) {
    const matchingMinimums = rules.filter(rule => rule.active !== false && rule.packaging_group === group && ['MINIMUM_ITEM_SIZE','MINIMUM_CATEGORY_SIZE'].includes(rule.consumption_type) && (rule.order_types || []).includes(orderType)).map(rule => {
      const matchingQuantity = orderItems.reduce((sum, line) => {
        const menu = menuMap.get(line.menu_item_id);
        const match = rule.consumption_type === 'MINIMUM_ITEM_SIZE' ? line.menu_item_id === rule.menu_item_id : menu?.category_id === rule.menu_category_id;
        return sum + (match ? Math.max(0, Number(line.quantity || 0)) : 0);
      }, 0);
      return { rule, matchingQuantity };
    }).filter(row => row.matchingQuantity > 0);
    const minimumRank = Math.max(0, ...matchingMinimums.map(({ rule }) => tierRank[rule.order_size_tier] || 0));
    const groupRules = rules.filter(rule => rule.active !== false && rule.packaging_group === group && rule.consumption_type === 'PER_ORDER_SIZE' && (rule.order_types || []).includes(orderType));
    const qualifyingTier = groupRules
      .filter(rule => Number(rule.minimum_order_item_count || 1) <= orderItemCount)
      .sort((a, b) => tierRank[b.order_size_tier] - tierRank[a.order_size_tier])[0]?.order_size_tier;
    const smallestTier = groupRules.sort((a, b) => tierRank[a.order_size_tier] - tierRank[b.order_size_tier])[0]?.order_size_tier;
    const chosenTier = rankTier(Math.max(tierRank[qualifyingTier || smallestTier] || 1, minimumRank));
    const chosen = rules.find(rule => rule.active !== false && rule.packaging_group === group && rule.consumption_type === 'PER_ORDER_SIZE' && rule.order_size_tier === chosenTier && (rule.order_types || []).includes(orderType));
    if (!chosen) continue;
    const minimumQuantity = orderItems.reduce((sum, line) => {
      const menu = menuMap.get(line.menu_item_id);
      const perItemMinimum = Math.max(0, ...matchingMinimums.filter(({ rule }) => rule.consumption_type === 'MINIMUM_ITEM_SIZE' ? line.menu_item_id === rule.menu_item_id : menu?.category_id === rule.menu_category_id).map(({ rule }) => Number(rule.consumption_quantity || 0)));
      return sum + perItemMinimum * Math.max(0, Number(line.quantity || 0));
    }, 0);
    const used = Math.max(Number(chosen.consumption_quantity || 0), minimumQuantity);
    if (used > 0) totals.set(chosen.item_id, (totals.get(chosen.item_id) || 0) + used);
  }
  return [...totals].map(([itemId, quantity]) => ({ itemId, quantity }));
}
