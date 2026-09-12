import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { name, phone, orderType, outlet, address, items } = req.body || {};

    const customerName = String(name || "").trim();
    const customerPhone = String(phone || "").trim();
    const outletSlug = String(outlet || "").trim();
    const deliveryAddress = String(address || "").trim();

    if (
      !customerName ||
      !customerPhone ||
      !orderType ||
      !outletSlug ||
      !Array.isArray(items) ||
      !items.length
    ) {
      return res.status(400).json({ error: "Missing required order details" });
    }

    if (
      customerName.length > 100 ||
      customerPhone.length > 30 ||
      outletSlug.length > 100
    ) {
      return res.status(400).json({ error: "Invalid customer or outlet details" });
    }

    if (items.length > 50) {
      return res.status(400).json({ error: "Too many order items" });
    }

    if (items.some(item => !item || typeof item !== "object" || Array.isArray(item))) {
      return res.status(400).json({ error: "Invalid order items" });
    }

    if (!["PICKUP", "DELIVERY"].includes(orderType)) {
      return res.status(400).json({ error: "Invalid order type" });
    }

    if (orderType === "DELIVERY" && !deliveryAddress) {
      return res.status(400).json({ error: "Delivery address is required" });
    }

    if (deliveryAddress.length > 500) {
      return res.status(400).json({ error: "Delivery address is too long" });
    }

    const { data: outletRecord, error: outletError } = await supabase
      .from("outlets")
      .select("id,name,status")
      .eq("slug", outletSlug)
      .eq("status", "ACTIVE")
      .single();

    if (outletError || !outletRecord) {
      return res.status(400).json({ error: "Invalid outlet" });
    }

    const requestedSlugs = items.map(item => String(item.slug || "").trim());

    if (
      requestedSlugs.some(slug => !slug || slug.length > 100) ||
      new Set(requestedSlugs).size !== requestedSlugs.length
    ) {
      return res.status(400).json({ error: "Invalid or duplicate menu items" });
    }

    const { data: menuItems, error: menuError } = await supabase
      .from("menu_items")
      .select("id,name,slug,price,is_available")
      .in("slug", requestedSlugs);

    if (menuError) {
      return res.status(500).json({ error: "Unable to validate menu items" });
    }

    const menuItemIds = menuItems.map(item => item.id);

    const { data: outletMenuItems, error: outletMenuError } = await supabase
      .from("outlet_menu_items")
      .select("menu_item_id,is_available")
      .eq("outlet_id", outletRecord.id)
      .in("menu_item_id", menuItemIds);

    if (outletMenuError) {
      return res.status(500).json({ error: "Unable to validate outlet menu" });
    }

    const outletMenuMap = new Map(
      (outletMenuItems || []).map(item => [item.menu_item_id, item.is_available])
    );

    const menuMap = new Map(menuItems.map(item => [item.slug, item]));

    const orderItems = [];
    let subtotal = 0;
    let totalQuantity = 0;

    for (const item of items) {
      const menuItem = menuMap.get(String(item.slug || "").trim());
      const quantity = Number(item.quantity);

      if (
        !menuItem ||
        !menuItem.is_available ||
        outletMenuMap.get(menuItem.id) !== true ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 99
      ) {
        return res.status(400).json({ error: "Invalid menu item or quantity" });
      }

      totalQuantity += quantity;

      if (totalQuantity > 500) {
        return res.status(400).json({ error: "Too many items in order" });
      }

      const unitPrice = Number(menuItem.price);
      const lineTotal = unitPrice * quantity;

      subtotal += lineTotal;

      orderItems.push({
        menu_item_id: menuItem.id,
        item_name: menuItem.name,
        unit_price: unitPrice,
        quantity,
        line_total: lineTotal
      });
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        name: customerName,
        phone: customerPhone
      })
      .select("id")
      .single();

    if (customerError) {
      return res.status(500).json({ error: "Unable to create customer" });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        outlet_id: outletRecord.id,
        customer_id: customer.id,
        order_type: orderType,
        subtotal,
        delivery_fee: 0,
        discount: 0,
        total: subtotal,
        delivery_address: orderType === "DELIVERY" ? deliveryAddress : null,
        payment_method: "COD",
        payment_status: "PENDING"
      })
      .select("id,order_number,status,total")
      .single();

    if (orderError) {
      await supabase.from("customers").delete().eq("id", customer.id);
      return res.status(500).json({ error: "Unable to create order" });
    }

    const rows = orderItems.map(item => ({
      order_id: order.id,
      ...item
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(rows);

    if (itemsError) {
      await supabase.from("orders").delete().eq("id", order.id);
      await supabase.from("customers").delete().eq("id", customer.id);
      return res.status(500).json({ error: "Unable to save order items" });
    }

    const { error: historyError } = await supabase
      .from("order_status_history")
      .insert({
        order_id: order.id,
        status: "NEW",
        note: "Order placed from OHHO website"
      });

    if (historyError) {
      await supabase.from("orders").delete().eq("id", order.id);
      await supabase.from("customers").delete().eq("id", customer.id);
      return res.status(500).json({ error: "Unable to finalize order" });
    }

    return res.status(201).json({
      success: true,
      order
    });
  } catch {
    return res.status(500).json({ error: "Unexpected server error" });
  }
}
