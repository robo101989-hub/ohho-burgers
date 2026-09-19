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
  if (!["POST", "PATCH", "DELETE"].includes(req.method)) {
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

    if (req.method === "PATCH") {
      const orderId = String(body.orderId || "").trim();
      const requestedItems = Array.isArray(body.items) ? body.items : [];

      if (!orderId || !requestedItems.length || requestedItems.length > 50) {
        return res.status(400).json({ error: "Order and at least one valid item are required" });
      }

      if (requestedItems.some(item => !item || typeof item !== "object" || Array.isArray(item))) {
        return res.status(400).json({ error: "Invalid order items" });
      }

      const { data: existingOrder, error: existingOrderError } = await supabase
        .from("orders")
        .select("id,outlet_id,status,subtotal,total,order_number,token_number,created_at")
        .eq("id", orderId)
        .maybeSingle();

      if (existingOrderError || !existingOrder) {
        return res.status(404).json({ error: "Order not found" });
      }

      const user = await requirePosUser(req, res, existingOrder.outlet_id);
      if (!user) return;

      if (["COMPLETED", "CANCELLED"].includes(existingOrder.status)) {
        return res.status(409).json({ error: "Completed or cancelled orders cannot be edited" });
      }

      const { data: outlet, error: outletError } = await supabase
        .from("outlets")
        .select("id,status,current_session_started_at")
        .eq("id", existingOrder.outlet_id)
        .single();

      if (outletError || !outlet || outlet.status !== "ACTIVE") {
        return res.status(409).json({ error: "This outlet session is closed" });
      }

      if (
        !outlet.current_session_started_at ||
        new Date(existingOrder.created_at).getTime() < new Date(outlet.current_session_started_at).getTime()
      ) {
        return res.status(409).json({ error: "Previous-session orders cannot be edited" });
      }

      const requestedIds = requestedItems
        .map(item => String(item.menuItemId || "").trim())
        .filter(Boolean);
      const uniqueIds = [...new Set(requestedIds)];

      if (!requestedIds.length || uniqueIds.length !== requestedItems.length) {
        return res.status(400).json({ error: "Invalid or duplicate menu items" });
      }

      const [{ data: menuRows, error: menuError }, { data: outletMenuRows, error: outletMenuError }] = await Promise.all([
        supabase
          .from("menu_items")
          .select("id,name,price,is_available")
          .in("id", uniqueIds),
        supabase
          .from("outlet_menu_items")
          .select("menu_item_id,is_available")
          .eq("outlet_id", existingOrder.outlet_id)
          .in("menu_item_id", uniqueIds)
      ]);

      if (menuError || outletMenuError) {
        return res.status(500).json({ error: "Unable to validate menu items" });
      }

      const menuMap = new Map((menuRows || []).map(item => [item.id, item]));
      const outletMenuMap = new Map(
        (outletMenuRows || []).map(item => [item.menu_item_id, item.is_available])
      );
      const nextItems = [];
      let subtotal = 0;
      let totalQuantity = 0;

      for (const requestedItem of requestedItems) {
        const menuItemId = String(requestedItem.menuItemId || "").trim();
        const quantity = Number(requestedItem.quantity);
        const menuItem = menuMap.get(menuItemId);

        if (
          !menuItem ||
          menuItem.is_available !== true ||
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
          return res.status(400).json({ error: "Too many items in order" });
        }

        const unitPrice = Number(menuItem.price);
        const lineTotal = unitPrice * quantity;
        subtotal += lineTotal;
        nextItems.push({
          order_id: existingOrder.id,
          menu_item_id: menuItem.id,
          item_name: menuItem.name,
          unit_price: unitPrice,
          quantity,
          line_total: lineTotal
        });
      }

      const { data: previousItems, error: previousItemsError } = await supabase
        .from("order_items")
        .select("order_id,menu_item_id,item_name,unit_price,quantity,line_total")
        .eq("order_id", existingOrder.id);

      if (previousItemsError) {
        return res.status(500).json({ error: "Unable to prepare the order update" });
      }

      const { error: deleteItemsError } = await supabase
        .from("order_items")
        .delete()
        .eq("order_id", existingOrder.id);

      if (deleteItemsError) {
        return res.status(500).json({ error: "Unable to update order items" });
      }

      const { error: insertItemsError } = await supabase
        .from("order_items")
        .insert(nextItems);

      if (insertItemsError) {
        if (previousItems?.length) await supabase.from("order_items").insert(previousItems);
        console.error("POS order edit item error", insertItemsError);
        return res.status(500).json({ error: "Unable to save the edited items" });
      }

      const { data: updatedOrder, error: updateOrderError } = await supabase
        .from("orders")
        .update({ subtotal, total: subtotal })
        .eq("id", existingOrder.id)
        .select("id,order_number,token_number,outlet_id,status,subtotal,total")
        .single();

      if (updateOrderError || !updatedOrder) {
        await supabase.from("order_items").delete().eq("order_id", existingOrder.id);
        if (previousItems?.length) await supabase.from("order_items").insert(previousItems);
        return res.status(500).json({ error: "Unable to recalculate the order total" });
      }

      const { error: historyError } = await supabase
        .from("order_status_history")
        .insert({
          order_id: existingOrder.id,
          status: existingOrder.status,
          note: `POS order items edited by ${user.email || user.id}`
        });

      if (historyError) console.error("Unable to record POS order edit history", historyError);

      return res.status(200).json({
        success: true,
        order: {
          ...updatedOrder,
          database_order_number: updatedOrder.order_number,
          order_number: updatedOrder.token_number || updatedOrder.order_number
        },
        items: nextItems
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
    const customerName = String(body.customerName || "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100);
    const customerPhone = String(body.customerPhone || "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 20);
    const spinRewardCode = String(body.spinRewardCode || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "");

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

    if (customerPhone && !/^[0-9+()\-\s]{7,20}$/.test(customerPhone)) {
      return res.status(400).json({
        error: "Enter a valid mobile number or leave it blank"
      });
    }

    const { data: outlet, error: outletError } = await supabase
      .from("outlets")
      .select("id,name,status,current_session_started_at")
      .eq("id", outletId)
      .single();

    if (outletError || !outlet) {
      return res.status(400).json({ error: "Invalid outlet" });
    }

    if (outlet.status !== "ACTIVE") {
      return res.status(400).json({ error: "Outlet is inactive" });
    }

    if (!outlet.current_session_started_at) {
      return res.status(400).json({ error: "Start the outlet sales session before placing an order" });
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

    const [sessionCountResult, latestTokenResult] = await Promise.all([
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("outlet_id", outlet.id)
        .gte("created_at", outlet.current_session_started_at),
      supabase
        .from("orders")
        .select("token_number")
        .eq("outlet_id", outlet.id)
        .gte("created_at", outlet.current_session_started_at)
        .not("token_number", "is", null)
        .order("token_number", { ascending: false })
        .limit(1)
    ]);

    if (sessionCountResult.error || latestTokenResult.error) {
      console.error(
        "POS session order number error",
        sessionCountResult.error || latestTokenResult.error
      );
      return res.status(500).json({ error: "Unable to assign the session order number" });
    }

    const sessionOrderNumber = Math.max(
      Number(sessionCountResult.count || 0),
      Number(latestTokenResult.data?.[0]?.token_number || 0)
    ) + 1;
    const customerNote = customerName || customerPhone
      ? JSON.stringify({ customerName, customerPhone })
      : null;

    let spinReward = null;
    let spinDiscount = 0;
    if (spinRewardCode) {
      const { data: reward, error: rewardError } = await supabase
        .from("spin_rewards")
        .select("id,code,label,reward_type,reward_value,status,expires_at")
        .eq("outlet_id", outlet.id)
        .eq("code", spinRewardCode)
        .maybeSingle();
      if (rewardError || !reward || reward.status !== "ISSUED") return res.status(400).json({ error: "Spin & Win reward is not available" });
      if (new Date(reward.expires_at).getTime() < Date.now()) {
        await supabase.from("spin_rewards").update({ status: "EXPIRED" }).eq("id", reward.id).eq("status", "ISSUED");
        return res.status(400).json({ error: "Spin & Win reward has expired" });
      }
      if (reward.reward_type === "PERCENT") spinDiscount = Math.round((subtotal * Number(reward.reward_value || 0)) / 100);
      if (reward.reward_type === "FLAT") spinDiscount = Number(reward.reward_value || 0);
      spinDiscount = Math.max(0, Math.min(subtotal, spinDiscount));
      spinReward = reward;
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
        discount: spinDiscount,
        total: Math.max(0, subtotal - spinDiscount),
        delivery_address: null,
        customer_note: customerNote,
        order_source: orderSource,
        table_number: orderType === "DINE_IN" ? tableNumber : null,
        token_number: sessionOrderNumber
      })
      .select("id,order_number,token_number,outlet_id,order_type,status,payment_method,payment_status,subtotal,total,table_number,customer_note,order_source,created_at")
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

    if (spinReward) {
      const { data: redeemed, error: redeemError } = await supabase
        .from("spin_rewards")
        .update({ status: "REDEEMED", redeemed_at: new Date().toISOString(), redeemed_order_id: order.id })
        .eq("id", spinReward.id)
        .eq("status", "ISSUED")
        .select("id")
        .maybeSingle();
      if (redeemError || !redeemed) {
        await supabase.from("orders").delete().eq("id", order.id);
        return res.status(409).json({ error: "This Spin & Win reward was just used. Please create the order again." });
      }
    }

    return res.status(201).json({
      success: true,
      order: {
        ...order,
        database_order_number: order.order_number,
        order_number: order.token_number,
        customer_name: customerName,
        customer_phone: customerPhone,
        spin_reward: spinReward ? { code: spinReward.code, label: spinReward.label, discount: spinDiscount } : null
      },
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
