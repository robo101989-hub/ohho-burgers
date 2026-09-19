import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

function bearerToken(req) {
  const value = req.headers?.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : null;
}

export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const orderId = String((req.body || {}).orderId || "").trim();
  if (!orderId || (req.body || {}).confirmation !== "REMOVE_ORDER") {
    return res.status(400).json({ error: "Choose an order and confirm its removal" });
  }

  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: "Authentication required" });

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) {
    return res.status(401).json({ error: "Invalid authentication" });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile || profile.role !== "ADMIN" || profile.is_active === false) {
    return res.status(403).json({ error: "Admin access required" });
  }

  const { data: removedOrder, error: removeError } = await supabase
    .from("orders")
    .delete()
    .eq("id", orderId)
    .select("id,order_number")
    .maybeSingle();

  if (removeError) {
    return res.status(500).json({ error: "Unable to remove this order" });
  }
  if (!removedOrder) {
    return res.status(404).json({ error: "Order was not found or was already removed" });
  }

  return res.status(200).json({ removed: removedOrder });
}
