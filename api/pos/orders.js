import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

function bearerToken(req) {
  const value = req.headers?.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : null;
}

async function requirePosUser(req, res, outletId) {
  const token = bearerToken(req);

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  const { data: authData, error: authError } =
    await supabase.auth.getUser(token);

  if (authError || !authData?.user) {
    res.status(401).json({ error: "Invalid authentication" });
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,role,is_active")
    .eq("id", authData.user.id)
    .single();

  if (
    profileError ||
    !profile ||
    !["ADMIN", "OWNER", "MANAGER", "STAFF"].includes(profile.role) ||
    profile.is_active === false
  ) {
    res.status(403).json({ error: "POS access denied" });
    return null;
  }

  if (profile.role !== "ADMIN") {
    const { data: assignment, error: assignmentError } = await supabase
      .from("outlet_users")
      .select("outlet_id")
      .eq("user_id", profile.id)
      .eq("outlet_id", outletId)
      .maybeSingle();

    if (assignmentError || !assignment) {
      res.status(403).json({ error: "You are not assigned to this outlet" });
      return null;
    }
  }

  return authData.user;
}
export default async function handler(req, res) {
  if (!["POST", "DELETE"].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};

    if (req.method === "DELETE") {
      const token = bearerToken(req);

      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { data: authData, error: authError } =
        await supabase.auth.getUser(token);

      if (authError || !authData?.user) {
        return res.status(401).json({ error: "Invalid authentication" });
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id,role,is_active")
        .eq("id", authData.user.id)
        .single();

      if (
        profileError ||
        !profile ||
        profile.role !== "ADMIN" ||
        profile.is_active === false
      ) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const orderId = String(body.orderId || "").trim();

      if (!orderId) {
        return res.status(400).json({ error: "Order id is required" });
      }

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id,order_number")
        .eq("id", orderId)
        .maybeSingle();

      if (orderError || !order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const { error: deleteError } = await supabase
        .from("orders")
        .delete()
        .eq("id", orderId);

      if (deleteError) {
        console.error("POS order delete error", deleteError);
        return res.status(500).json({ error: "Unable to remove order" });
      }

      return res.status(200).json({
        success: true,
        orderId: order.id,
        orderNumber: order.order_number
      });
    }

    const outletId = String(body.outletId || "").trim();

    if (!outletId) {
      return res.status(400).json({
        error: "Outlet is required"
      });
    }

    const user = await requirePosUser(req, res, outletId);
    if (!user) return;
    const orderType = String(body.orderType || "").trim().toUpperCase();
    const paymentMethod = String(body.paymentMethod || "").trim().toUpperCase();
    const orderSource = String(body.orderSource || "POS").trim().toUpperCase();
    const tableNumber = body.tableNumber == null || body.tableNumber === ""
      ? null
      : Number(body.tableNumber);

    const items = Array.isArray(body.items) ? body.items : [];

    if (!outletId || !items.length) {
      return res.status(400).json({
        error: "Outlet and at least one item are required"
      });
    }

    if (items.length > 50) {
      return res.status(400).json({
        error: "Too many order items"
      });
    }

    if (items.some(item => !item || typeof item !== "object" || Array.isArray(item))) {
      return res.status(400).json({
        error: "Invalid order items"
      });
    }

    if (!["DINE_IN", "TAKEAWAY"].includes(orderType)) {
      return res.status(400).json({
        error: "Invalid order type"
      });
    }

    if (!["POS", "FAMILY_FRIENDS"].includes(orderSource)) {
      return res.status(400).json({
        error: "Invalid order category"
      });
    }

    const expectedPaymentMethods = orderSource === "FAMILY_FRIENDS"
      ? ["COMPLIMENTARY"]
      : ["CASH", "UPI", "CARD"];

    if (!expectedPaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({
        error: "Invalid payment method"
      });
    }

    if (
      orderType === "DINE_IN" &&
      (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 999)
    ) {
      return res.status(400).json({
        error: "A valid table number is required for dine-in orders"
      });
    }

    const { data: outlet, error: outletError } = await supabase
      .from("outlets")
      .select("id,name,status")
      .eq("id", outletId)
      .single();

    if (outletError || !outlet) {
      return res.status(400).json({ error: "Invalid outlet" });
    }

    if (outlet.status !== "ACTIVE") {
      return res.status(400).json({ error: "Outlet is inactive" });
    }

    const requestedIds = items
      .map(item => String(item.menuItemId || "").trim())
      .filter(Boolean);

    if (!requestedIds.length || requestedIds.length !== items.length) {
      return res.status(400).json({
        error: "Invalid menu items"
      });
    }

    const uniqueIds = [...new Set(requestedIds)];

    if (uniqueIds.length !== requestedIds.length) {
      return res.status(400).json({
        error: "Duplicate menu items are not allowed"
      });
    }

    const { data: menuRows, error: menuError } = await supabase
      .from("menu_items")
      .select("id,name,price,is_available")
      .in("id", uniqueIds);

    if (menuError) {
      return res.status(500).json({
        error: "Unable to validate menu items"
      });
    }

    const { data: outletMenuRows, error: outletMenuError } = await supabase
      .from("outlet_menu_items")
      .select("menu_item_id,is_available")
      .eq("outlet_id", outletId)
      .in("menu_item_id", uniqueIds);

    if (outletMenuError) {
      return res.status(500).json({
        error: "Unable to validate outlet menu"
      });
    }

    const menuMap = new Map(
      (menuRows || []).map(item => [item.id, item])
    );

    const outletMenuMap = new Map(
      (outletMenuRows || []).map(item => [item.menu_item_id, item.is_available])
    );

    const orderItems = [];
    let subtotal = 0;
    let totalQuantity = 0;

    for (const requestedItem of items) {
      const menuItemId = String(requestedItem.menuItemId || "").trim();
      const quantity = Number(requestedItem.quantity);
      const menuItem = menuMap.get(menuItemId);

      if (
        !menuItem ||
        !menuItem.is_available ||
        outletMenuMap.get(menuItemId) !== true ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 99
      ) {
        return res.status(400).json({
          error: `Menu item unavailable or invalid: ${menuItem?.name || menuItemId}`
        });
      }

      totalQuantity += quantity;

      if (totalQuantity > 500) {
        return res.status(400).json({
          error: "Too many items in order"
        });
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

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        outlet_id: outlet.id,
        customer_id: null,
        order_type: orderType,
        status: "NEW",
        payment_method: paymentMethod,
        payment_status: "PAID",
        subtotal,
        delivery_fee: 0,
        discount: 0,
        total: subtotal,
        delivery_address: null,
        customer_note: null,
        order_source: orderSource,
        table_number: orderType === "DINE_IN" ? tableNumber : null
      })
      .select("id,order_number,outlet_id,order_type,status,payment_method,payment_status,subtotal,total,table_number,order_source,created_at")
      .single();

    if (orderError) {
      console.error("POS order creation error", orderError);
      return res.status(500).json({
        error: "Unable to create POS order"
      });
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

      console.error("POS order items error", itemsError);
      return res.status(500).json({
        error: "Unable to save POS order items"
      });
    }

    const { error: historyError } = await supabase
      .from("order_status_history")
      .insert({
        order_id: order.id,
        status: "NEW",
        note: `POS order created by ${user.email || user.id}`
      });

    if (historyError) {
      await supabase.from("orders").delete().eq("id", order.id);

      console.error("POS order history error", historyError);
      return res.status(500).json({
        error: "Unable to finalize POS order"
      });
    }

    return res.status(201).json({
      success: true,
      order,
      outlet: {
        id: outlet.id,
        name: outlet.name
      }
    });
  } catch (error) {
    console.error("POS API error", error);
    return res.status(500).json({
      error: "Unexpected server error"
    });
  }
}
