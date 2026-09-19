import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

function safeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function bearerToken(req) {
  const value = req.headers?.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : null;
}

async function requireOutletManager(req, res, outletId = null) {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
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
    !["ADMIN", "OWNER"].includes(profile.role) ||
    profile.is_active === false
  ) {
    res.status(403).json({ error: "Admin or Owner access required" });
    return null;
  }

  if (profile.role === "OWNER" && outletId) {
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

  return { user: authData.user, profile };
}

export default async function handler(req, res) {
  if (!["GET", "POST", "PATCH"].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};

    const requestedOutletId = String(body.id || "").trim() || null;
    const auth = await requireOutletManager(req, res, requestedOutletId);
    if (!auth) return;

    const { user, profile } = auth;

    if (req.method === "GET") {
      let query = supabase
        .from("outlets")
        .select("id,name,slug,address,phone,opening_time,closing_time,maps_url,zomato_url,swiggy_url,status,created_at,updated_at")
        .order("created_at", { ascending: true });

      if (profile.role === "OWNER") {
        const { data: assignments, error: assignmentError } = await supabase
          .from("outlet_users")
          .select("outlet_id")
          .eq("user_id", profile.id);

        if (assignmentError) {
          return res.status(500).json({ error: "Unable to load outlet access" });
        }

        const outletIds = (assignments || []).map(row => row.outlet_id);

        if (!outletIds.length) {
          return res.status(200).json({ outlets: [] });
        }

        query = query.in("id", outletIds);
      }

      const { data, error } = await query;

      if (error) return res.status(500).json({ error: "Unable to load outlets" });
      return res.status(200).json({ outlets: data || [] });
    }

    if (req.method === "POST") {
      if (profile.role !== "ADMIN") {
        return res.status(403).json({ error: "Only Admin can create outlets" });
      }

      const name = String(body.name || "").trim();
      const slug = String(body.slug || name).trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const address = String(body.address || "").trim();
      const phone = String(body.phone || "").trim() || null;
      const openingTime = String(body.openingTime || "17:00");
      const closingTime = String(body.closingTime || "01:00");

      if (!name || !slug || !address) {
        return res.status(400).json({ error: "Name, slug and address are required" });
      }

      const { data: outlet, error: outletError } = await supabase
        .from("outlets")
        .insert({
          name,
          slug,
          address,
          phone,
          opening_time: openingTime,
          closing_time: closingTime,
          maps_url: safeUrl(body.mapsUrl),
          zomato_url: safeUrl(body.zomatoUrl),
          swiggy_url: safeUrl(body.swiggyUrl),
          status: body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE"
        })
        .select("id,name,slug,address,phone,opening_time,closing_time,maps_url,zomato_url,swiggy_url,status,created_at,updated_at")
        .single();

      if (outletError) {
        const duplicate = outletError.code === "23505";
        return res.status(duplicate ? 409 : 500).json({
          error: duplicate ? "An outlet with this name or slug already exists" : "Unable to create outlet"
        });
      }

      const { data: menuItems, error: menuError } = await supabase
        .from("menu_items")
        .select("id")
        .order("display_order", { ascending: true });

      if (menuError) {
        await supabase.from("outlets").delete().eq("id", outlet.id);
        return res.status(500).json({ error: "Unable to prepare outlet menu" });
      }

      if (menuItems?.length) {
        const rows = menuItems.map(item => ({
          outlet_id: outlet.id,
          menu_item_id: item.id,
          is_available: true
        }));

        const { error: menuLinkError } = await supabase
          .from("outlet_menu_items")
          .insert(rows);

        if (menuLinkError) {
          await supabase.from("outlets").delete().eq("id", outlet.id);
          return res.status(500).json({ error: "Unable to configure outlet menu" });
        }
      }

      return res.status(201).json({
        success: true,
        outlet,
        menuItemsConfigured: menuItems?.length || 0,
        createdBy: user.id
      });
    }

    const id = String(body.id || "").trim();
    if (!id) return res.status(400).json({ error: "Outlet id is required" });

    if (profile.role === "OWNER") {
      const { data: assignment, error: assignmentError } = await supabase
        .from("outlet_users")
        .select("outlet_id")
        .eq("user_id", profile.id)
        .eq("outlet_id", id)
        .maybeSingle();

      if (assignmentError || !assignment) {
        return res.status(403).json({ error: "You are not assigned to this outlet" });
      }
    }

    const { data: currentOutlet, error: currentOutletError } = await supabase
      .from("outlets")
      .select("id,status,current_session_started_at,updated_at")
      .eq("id", id)
      .single();

    if (currentOutletError || !currentOutlet) {
      return res.status(404).json({ error: "Outlet not found" });
    }

    const updates = {};
    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.address !== undefined) updates.address = String(body.address).trim();
    if (body.phone !== undefined) updates.phone = String(body.phone).trim() || null;
    if (body.openingTime !== undefined) updates.opening_time = String(body.openingTime);
    if (body.closingTime !== undefined) updates.closing_time = String(body.closingTime);
    if (body.mapsUrl !== undefined) updates.maps_url = safeUrl(body.mapsUrl);
    if (body.zomatoUrl !== undefined) updates.zomato_url = safeUrl(body.zomatoUrl);
    if (body.swiggyUrl !== undefined) updates.swiggy_url = safeUrl(body.swiggyUrl);
    if (body.status !== undefined) {
      if (!["ADMIN", "OWNER"].includes(profile.role)) {
        return res.status(403).json({ error: "Admin or Owner access required" });
      }

      const nextStatus = body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
      const now = new Date().toISOString();

      if (currentOutlet.status !== nextStatus) {
        if (nextStatus === "ACTIVE") {
          updates.current_session_started_at = now;
        } else {
          const openedAt =
            currentOutlet.current_session_started_at ||
            currentOutlet.updated_at ||
            now;

          const { data: sessionOrders, error: sessionOrdersError } = await supabase
            .from("orders")
            .select("id,total,payment_method,payment_status,status,created_at")
            .eq("outlet_id", id)
            .gte("created_at", openedAt)
            .lt("created_at", now);

          if (sessionOrdersError) {
            console.error("Unable to load session orders", sessionOrdersError);
            return res.status(500).json({ error: "Unable to close outlet sales session" });
          }

          const saleOrders = (sessionOrders || []).filter(order =>
            order.payment_status === "PAID" &&
            order.status !== "CANCELLED"
          );

          const orderIds = saleOrders.map(order => order.id);
          let itemCount = 0;

          if (orderIds.length) {
            const { data: itemRows, error: itemRowsError } = await supabase
              .from("order_items")
              .select("order_id,quantity")
              .in("order_id", orderIds);

            if (itemRowsError) {
              console.error("Unable to load session order items", itemRowsError);
              return res.status(500).json({ error: "Unable to close outlet sales session" });
            }

            itemCount = (itemRows || []).reduce(
              (sum, item) => sum + Number(item.quantity || 0),
              0
            );
          }

          const totals = saleOrders.reduce(
            (acc, order) => {
              const amount = Number(order.total || 0);
              acc.gross += amount;
              if (order.payment_method === "CASH") acc.cash += amount;
              if (order.payment_method === "UPI") acc.upi += amount;
              if (order.payment_method === "CARD") acc.card += amount;
              return acc;
            },
            { gross: 0, cash: 0, upi: 0, card: 0 }
          );

          const { error: reportError } = await supabase
            .from("outlet_sales_reports")
            .upsert(
              {
                outlet_id: id,
                opened_at: openedAt,
                closed_at: now,
                order_count: saleOrders.length,
                item_count: itemCount,
                gross_sales: totals.gross,
                cash_sales: totals.cash,
                upi_sales: totals.upi,
                card_sales: totals.card
              },
              { onConflict: "outlet_id,opened_at" }
            );

          if (reportError) {
            console.error("Unable to archive outlet sales report", reportError);
            return res.status(500).json({ error: "Unable to archive outlet sales report" });
          }

          updates.current_session_started_at = null;
        }
      }

      updates.status = nextStatus;
    }
    updates.updated_at = new Date().toISOString();

    const { data: outlet, error } = await supabase
      .from("outlets")
      .update(updates)
      .eq("id", id)
      .select("id,name,slug,address,phone,opening_time,closing_time,maps_url,zomato_url,swiggy_url,status,created_at,updated_at")
      .single();

    if (error || !outlet) return res.status(404).json({ error: "Outlet not found" });
    return res.status(200).json({ success: true, outlet });
  } catch (error) {
    console.error("Outlet API error", error);
    return res.status(500).json({ error: "Unexpected server error" });
  }
}
