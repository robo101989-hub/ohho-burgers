export function recipeUsageType(recipe) {
  return recipe.usage_type || (recipe.is_packaging ? 'TAKEAWAY_DELIVERY' : 'FOOD');
}

export function recipeAppliesToOrder(recipe, orderType) {
  const usageType = recipeUsageType(recipe);
  if (usageType === 'FOOD') return true;
  if (usageType === 'DINE_IN') return orderType === 'DINE_IN';
  return usageType === 'TAKEAWAY_DELIVERY' && ['TAKEAWAY', 'DELIVERY', 'PICKUP'].includes(orderType);
}

export function calculateRecipeConsumption({ recipes = [], orderItems = [], orderType = 'TAKEAWAY' }) {
  const totals = new Map();
  for (const orderItem of orderItems) {
    for (const recipe of recipes) {
      if (recipe.menu_item_id !== orderItem.menu_item_id || !recipeAppliesToOrder(recipe, orderType)) continue;
      const quantity = Number(recipe.base_quantity || 0) * Number(orderItem.quantity || 0);
      if (quantity > 0) totals.set(recipe.inventory_item_id, (totals.get(recipe.inventory_item_id) || 0) + quantity);
    }
  }
  return [...totals.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
}
