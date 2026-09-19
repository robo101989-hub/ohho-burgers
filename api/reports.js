import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

function bearerToken(req) {
  const value = req.headers?.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : null;
}

function validIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function requireAdmin(req, res) {
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
    .select("role,is_active")
    .eq("id", authData.user.id)
    .single();

  if (
    profileError ||
    !profile ||
    profile.role !== "ADMIN" ||
    profile.is_active === false
  ) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }

  return authData.user;
}

export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireAdmin(req, res);
    if (!user) return;

    const body = req.body || {};
    if (body.preserveSalesData !== true) {
      return res.status(400).json({ error: "Sales-data preservation confirmation required" });
    }

    const start = body.start ? validIsoDate(body.start) : null;
    const end = body.end ? validIsoDate(body.end) : new Date().toISOString();
    const outletId = String(body.outletId || "").trim() || null;

    if ((body.start && !start) || (body.end && !end)) {
      return res.status(400).json({ error: "Invalid report date range" });
    }

    let query = supabase
      .from("outlet_sales_reports")
      .delete()
      .lt("closed_at", end);

    if (start) query = query.gte("closed_at", start);
    if (outletId) query = query.eq("outlet_id", outletId);

    const { data, error } = await query.select("id");
    if (error) {
      console.error("Unable to clear report logs", error);
      return res.status(500).json({ error: "Unable to clear report logs" });
    }

    return res.status(200).json({
      success: true,
      deletedReportCount: (data || []).length,
      salesDataPreserved: true
    });
  } catch (error) {
    console.error("Report API error", error);
    return res.status(500).json({ error: "Unexpected server error" });
  }
}
