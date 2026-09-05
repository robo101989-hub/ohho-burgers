import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { name, phone, orderType, outlet, address, items } = req.body || {};

    if (!name || !phone || !orderType || !outlet || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: "Missing required order details" });
    }

    if (!["PICKUP", "DELIVERY"].includes(orderType)) {
      return res.status(400).json({ error: "Invalid order type" });
    }

    if (orderType === "DELIVERY" && !address) {
      return res.status(400).json({ error: "Delivery address is required" });
    }

    const { data: outletRecord, error: outletError } = await supabase
      .from("outlets")
      .select("id,name")
      .eq("slug", outlet)
      .single();

    if (outletError || !outletRecord) {
      return res.status(400).json({ error: "Invalid outlet" });
    }

    const requestedSlugs = items.map(item => String(item.slug || "").trim()).filter(Boolean);

    const { data: menuItems, error: menuError } = await supabase
      .from("menu_items")
      .select("id,name,price,is_available")
      .in("slug", requestedSlugs);

    if (menuError) {
      return res.status(500).json({ error: "Unable to validate menu items" });
    }

    const menuMap = new Map(menuItems.map(item => [item.slug, item]));

    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
      const menuItem = menuMap.get(String(item.slug || "").trim());
      const quantity = Number(item.quantity);

      if (!menuItem || !menuItem.is_available || !Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ error: "Invalid menu item or quantity" });
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
        name: String(name).trim(),
        phone: String(phone).trim()
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
        delivery_address: orderType === "DELIVERY" ? String(address).trim() : null,
        payment_method: "COD",
        payment_status: "PENDING"
      })
      .select("id,order_number,status,total")
      .single();

    if (orderError) {
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
      return res.status(500).json({ error: "Unable to save order items" });
    }

    await supabase.from("order_status_history").insert({
      order_id: order.id,
      status: "NEW",
      note: "Order placed from OHHO website"
    });

    return res.status(201).json({
      success: true,
      order
    });
  } catch {
    return res.status(500).json({ error: "Unexpected server error" });
  }
}
