import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const tokenFrom = req => (req.headers?.authorization || '').replace(/^Bearer\s+/i, '') || null;

async function requireAdmin(req, res) {
  const token = tokenFrom(req);
  if (!token) { res.status(401).json({ error: 'Sign in to manage reviews.' }); return null; }
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) { res.status(401).json({ error: 'Your session has expired.' }); return null; }
  const { data: profile } = await supabase.from('profiles').select('role,is_active').eq('id', userData.user.id).maybeSingle();
  if (!profile || profile.is_active === false || profile.role !== 'ADMIN') { res.status(403).json({ error: 'Admin access required.' }); return null; }
  return userData.user;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    if (req.method === 'GET') {
      const admin = req.query?.admin === '1' ? await requireAdmin(req, res) : null;
      if (req.query?.admin === '1' && !admin) return;
      let query = supabase.from('customer_reviews').select('id,customer_name,location,review_text,rating,is_visible,created_at').order('created_at', { ascending: false });
      if (!admin) query = query.eq('is_visible', true).limit(6);
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: 'Could not load customer reviews.' });
      if (!admin) res.setHeader('Cache-Control', 'public, s-maxage=60, must-revalidate');
      return res.status(200).json({ reviews: data || [] });
    }

    const user = await requireAdmin(req, res); if (!user) return;
    const body = req.body || {};
    if (req.method === 'POST') {
      const customerName = String(body.customerName || '').trim().slice(0, 80);
      const location = String(body.location || '').trim().slice(0, 100) || null;
      const reviewText = String(body.reviewText || '').trim().slice(0, 600);
      const rating = Number(body.rating ?? 5);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Choose a rating from 1 to 5.' });
      if (customerName.length < 2 || reviewText.length < 10) return res.status(400).json({ error: 'Add a customer name and a review of at least 10 characters.' });
      const { data, error } = await supabase.from('customer_reviews').insert({ customer_name: customerName, location, review_text: reviewText, rating, is_visible: body.isVisible !== false }).select('id,customer_name,location,review_text,rating,is_visible,created_at').single();
      if (error) return res.status(500).json({ error: 'Could not add the review.' });
      return res.status(201).json({ review: data });
    }

    if (req.method === 'DELETE') {
      const id = String(body.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Review ID is required.' });
      const { error } = await supabase.from('customer_reviews').delete().eq('id', id);
      if (error) return res.status(500).json({ error: 'Could not delete the review.' });
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error('Reviews API error', error);
    return res.status(500).json({ error: 'Customer reviews are temporarily unavailable.' });
  }
}
