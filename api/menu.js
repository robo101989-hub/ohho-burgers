import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

/** Public, read-only menu for the customer website. */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const [{ data: categories, error: categoryError }, { data: items, error: itemError }] = await Promise.all([
      supabase
        .from("menu_categories")
        .select("id,name,display_order")
        .eq("active", true)
        .order("display_order", { ascending: true }),
      supabase
        .from("menu_items")
        .select("category_id,name,description,price,image_url,is_veg,display_order")
        .eq("is_available", true)
        .eq("is_archived", false)
        .order("display_order", { ascending: true })
    ]);

    if (categoryError || itemError) {
      throw categoryError || itemError;
    }

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ categories: categories || [], items: items || [] });
  } catch (error) {
    return res.status(500).json({ error: "Unable to load the menu right now." });
  }
}
