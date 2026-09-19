import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const MAX_LENGTHS = {
  name: 100,
  email: 254,
  phone: 30,
  city: 100,
  state: 100,
  investment: 100,
  outletFormat: 100,
  experience: 500,
  message: 2000
};

function clean(value, limit) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const leadType = body.type === "FRANCHISE" ? "FRANCHISE" : "CONTACT";
    const name = clean(body.name, MAX_LENGTHS.name);
    const email = clean(body.email, MAX_LENGTHS.email).toLowerCase();
    const phone = clean(body.phone, MAX_LENGTHS.phone);
    const message = clean(body.message, MAX_LENGTHS.message);

    if (!name || !email || !validEmail(email) || (leadType === "FRANCHISE" && !phone) || (leadType === "CONTACT" && !message)) {
      return res.status(400).json({ error: "Please complete the required fields with a valid email address." });
    }

    const { error } = await supabase.from("website_leads").insert({
      lead_type: leadType,
      name,
      email,
      phone: phone || null,
      city: clean(body.city, MAX_LENGTHS.city) || null,
      state: clean(body.state, MAX_LENGTHS.state) || null,
      investment_range: clean(body.investment, MAX_LENGTHS.investment) || null,
      outlet_format: clean(body.outletFormat, MAX_LENGTHS.outletFormat) || null,
      business_experience: clean(body.experience, MAX_LENGTHS.experience) || null,
      message: message || null
    });

    if (error) {
      console.error("Unable to save website lead", error);
      return res.status(500).json({ error: "We could not send your message right now. Please try again shortly." });
    }

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error("Website lead request failed", error);
    return res.status(500).json({ error: "We could not send your message right now. Please try again shortly." });
  }
}
