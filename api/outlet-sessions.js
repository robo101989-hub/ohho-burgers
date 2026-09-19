import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

function bearerToken(req) {
  const value = req.headers?.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : null;
}

async function requireOperator(req, res, outletId = null) {
  const token = bearerToken(req);
  if (!token) { res.status(401).json({ error: "Authentication required" }); return null; }
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) { res.status(401).json({ error: "Invalid authentication" }); return null; }
  const { data: profile, error: profileError } = await supabase.from("profiles").select("id,role,is_active").eq("id", authData.user.id).single();
  if (profileError || !profile || !["ADMIN", "OWNER"].includes(profile.role) || profile.is_active === false) {
    res.status(403).json({ error: "Admin or Owner access required" }); return null;
  }
  if (profile.role === "OWNER" && outletId) {
    const { data: assignment, error } = await supabase.from("outlet_users").select("outlet_id").eq("user_id", profile.id).eq("outlet_id", outletId).maybeSingle();
    if (error || !assignment) { res.status(403).json({ error: "You are not assigned to this outlet" }); return null; }
  }
  return { user: authData.user, profile };
}

function summarizeOrders(orders) {
  const summary = { paid_order_count: 0, complimentary_order_count: 0, gross_sales: 0, cash_sales: 0, upi_sales: 0, card_sales: 0, complimentary_value: 0 };
  for (const order of orders || []) {
    if (order.status === "CANCELLED") continue;
    const total = Number(order.total || 0);
    if (order.order_source === "FAMILY_FRIENDS") { summary.complimentary_order_count += 1; summary.complimentary_value += Number(order.subtotal || 0); continue; }
    summary.paid_order_count += 1; summary.gross_sales += total;
    if (order.payment_method === "CASH") summary.cash_sales += total;
    if (order.payment_method === "UPI") summary.upi_sales += total;
    if (order.payment_method === "CARD") summary.card_sales += total;
  }
  return summary;
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method not allowed" });
  const body = req.body || {};
  const requestedOutletId = String(req.method === "GET" ? req.query?.outletId || "" : body.outletId || "").trim() || null;
  const auth = await requireOperator(req, res, requestedOutletId);
  if (!auth) return;

  if (req.method === "GET") {
    let outletIds = requestedOutletId ? [requestedOutletId] : null;
    if (auth.profile.role === "OWNER" && !outletIds) {
      const { data: assignments, error } = await supabase.from("outlet_users").select("outlet_id").eq("user_id", auth.profile.id);
      if (error) return res.status(500).json({ error: "Unable to load outlet access" });
      outletIds = (assignments || []).map(row => row.outlet_id);
    }
    if (outletIds && !outletIds.length) return res.status(200).json({ sessions: [] });
    let query = supabase.from("outlet_sales_sessions").select("id,outlet_id,opened_at,closed_at,paid_order_count,complimentary_order_count,gross_sales,cash_sales,upi_sales,card_sales,complimentary_value").order("opened_at", { ascending: false });
    if (outletIds) query = query.in("outlet_id", outletIds);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: "Unable to load sales sessions" });
    const latest = new Map();
    for (const session of data || []) if (!latest.has(session.outlet_id)) latest.set(session.outlet_id, session);
    return res.status(200).json({ sessions: [...latest.values()] });
  }

  const outletId = String(body.outletId || "").trim();
  const action = String(body.action || "").trim().toUpperCase();
  if (!outletId || !["OPEN", "CLOSE"].includes(action)) return res.status(400).json({ error: "Outlet and a valid action are required" });
  const { data: outlet, error: outletError } = await supabase.from("outlets").select("id,name,status").eq("id", outletId).single();
  if (outletError || !outlet) return res.status(404).json({ error: "Outlet not found" });
  if (outlet.status !== "ACTIVE") return res.status(400).json({ error: "Activate the outlet before opening POS" });
  const { data: openSession, error: openError } = await supabase.from("outlet_sales_sessions").select("id,outlet_id,opened_at,closed_at,paid_order_count,complimentary_order_count,gross_sales,cash_sales,upi_sales,card_sales,complimentary_value").eq("outlet_id", outletId).is("closed_at", null).maybeSingle();
  if (openError) return res.status(500).json({ error: "Unable to check the sales session" });
  if (action === "OPEN") {
    if (openSession) return res.status(200).json({ success: true, session: openSession, alreadyOpen: true });
    const { data: session, error } = await supabase.from("outlet_sales_sessions").insert({ outlet_id: outletId, opened_by: auth.user.id }).select("id,outlet_id,opened_at,closed_at,paid_order_count,complimentary_order_count,gross_sales,cash_sales,upi_sales,card_sales,complimentary_value").single();
    if (error) return res.status(500).json({ error: "Unable to open the POS sales session" });
    return res.status(201).json({ success: true, session, outlet });
  }
  if (!openSession) return res.status(400).json({ error: "This outlet does not have an open POS sales session" });
  const closedAt = new Date().toISOString();
  const { data: orders, error: ordersError } = await supabase.from("orders").select("status,payment_method,order_source,subtotal,total").eq("outlet_id", outletId).gte("created_at", openSession.opened_at).lt("created_at", closedAt);
  if (ordersError) return res.status(500).json({ error: "Unable to calculate sales" });
  const summary = summarizeOrders(orders);
  const { data: session, error: closeError } = await supabase.from("outlet_sales_sessions").update({ ...summary, closed_at: closedAt, closed_by: auth.user.id }).eq("id", openSession.id).select("id,outlet_id,opened_at,closed_at,paid_order_count,complimentary_order_count,gross_sales,cash_sales,upi_sales,card_sales,complimentary_value").single();
  if (closeError) return res.status(500).json({ error: "Unable to close the POS sales session" });
  return res.status(200).json({ success: true, session, outlet });
}
