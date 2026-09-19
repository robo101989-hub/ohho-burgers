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
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: "Authentication required" });

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return res.status(401).json({ error: "Invalid authentication" });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role,is_active")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile || profile.is_active === false || profile.role !== "ADMIN") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { data: leads, error } = await supabase
      .from("website_leads")
      .select("id,lead_type,name,email,phone,city,state,investment_range,outlet_format,business_experience,message,status,created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;
    return res.status(200).json({ leads: leads || [] });
  } catch (error) {
    console.error("Unable to load website leads", error);
    return res.status(500).json({ error: "Unable to load enquiries" });
  }
}
