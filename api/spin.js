import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const DEFAULT_PRIZES = [
  { label: '5% OFF', type: 'PERCENT', value: 5 },
  { label: '10% OFF', type: 'PERCENT', value: 10 },
  { label: '₹20 OFF', type: 'FLAT', value: 20 }
];

const tokenFrom = req => (req.headers?.authorization || '').replace(/^Bearer\s+/i, '') || null;
const cleanCode = value => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
const publicPrize = prize => ({ label: String(prize.label || 'OHHO REWARD').slice(0, 40), type: prize.type, value: Number(prize.value || 0) });
function cleanPrizes(value) {
  if (!Array.isArray(value)) return DEFAULT_PRIZES;
  const prizes = value.map(item => ({
    label: String(item?.label || '').trim().slice(0, 40),
    type: ['PERCENT', 'FLAT', 'FREE_ITEM'].includes(item?.type) ? item.type : 'PERCENT',
    value: Math.max(0, Math.min(1000, Number(item?.value || 0)))
  })).filter(item => item.label && (item.type === 'FREE_ITEM' || item.value > 0));
  return prizes.length ? prizes : DEFAULT_PRIZES;
}
async function staff(req, res, outletId, adminOnly = false) {
  const token = tokenFrom(req);
  if (!token) { res.status(401).json({ error: 'Sign in to use POS rewards.' }); return null; }
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) { res.status(401).json({ error: 'Your session has expired.' }); return null; }
  const { data: profile } = await supabase.from('profiles').select('id,role,is_active').eq('id', userData.user.id).maybeSingle();
  if (!profile || profile.is_active === false || !['ADMIN', 'OWNER', 'MANAGER', 'STAFF'].includes(profile.role)) { res.status(403).json({ error: 'POS access denied.' }); return null; }
  if (adminOnly && profile.role !== 'ADMIN') { res.status(403).json({ error: 'Admin access required.' }); return null; }
  if (outletId && profile.role !== 'ADMIN') {
    const { data: assignment } = await supabase.from('outlet_users').select('outlet_id').eq('user_id', profile.id).eq('outlet_id', outletId).maybeSingle();
    if (!assignment) { res.status(403).json({ error: 'This outlet is not assigned to you.' }); return null; }
  }
  return { user: userData.user, profile };
}
async function getOutlet(slug) {
  const { data } = await supabase.from('outlets').select('id,name,slug,status').eq('slug', String(slug || '').trim().toLowerCase()).maybeSingle();
  return data;
}
async function getSettings(outletId) {
  const { data } = await supabase.from('outlet_spin_settings').select('enabled,prizes').eq('outlet_id', outletId).maybeSingle();
  return { enabled: data?.enabled !== false, prizes: cleanPrizes(data?.prizes) };
}
function rewardCode() { return `OHHO-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`; }

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (req.query?.action === 'settings') {
        const auth = await staff(req, res, null, true); if (!auth) return;
        const [{ data: outlets, error: outletError }, { data: settings, error: settingsError }] = await Promise.all([
          supabase.from('outlets').select('id,name,slug').order('created_at', { ascending: true }),
          supabase.from('outlet_spin_settings').select('outlet_id,enabled,prizes')
        ]);
        if (outletError || settingsError) return res.status(500).json({ error: 'Could not load Spin & Win settings.' });
        return res.status(200).json({ outlets: outlets || [], settings: (settings || []).map(item => ({ ...item, prizes: cleanPrizes(item.prizes) })) });
      }
      const outlet = await getOutlet(req.query?.outlet);
      if (!outlet || outlet.status !== 'ACTIVE') return res.status(404).json({ error: 'Spin & Win is not active at this outlet.' });
      const settings = await getSettings(outlet.id);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ outlet: { name: outlet.name, slug: outlet.slug }, enabled: settings.enabled, prizes: settings.prizes.map(publicPrize) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body || {};
    const action = String(body.action || 'spin').toLowerCase();

    if (action === 'spin') {
      const outlet = await getOutlet(body.outlet);
      const deviceKey = String(body.deviceKey || '').trim().slice(0, 120);
      if (!outlet || outlet.status !== 'ACTIVE' || !deviceKey) return res.status(400).json({ error: 'Choose an active OHHO outlet to spin.' });
      const settings = await getSettings(outlet.id);
      if (!settings.enabled) return res.status(403).json({ error: 'Spin & Win is paused at this cart.' });
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data: existing } = await supabase.from('spin_rewards').select('code,label,reward_type,reward_value,status,expires_at').eq('outlet_id', outlet.id).eq('device_key', deviceKey).gte('issued_at', today.toISOString()).order('issued_at', { ascending: false }).limit(1).maybeSingle();
      if (existing) return res.status(409).json({ error: 'You have already spun today.', reward: { code: existing.code, label: existing.label, type: existing.reward_type, value: Number(existing.reward_value), status: existing.status, expiresAt: existing.expires_at } });
      const prize = settings.prizes[Math.floor(Math.random() * settings.prizes.length)];
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      let reward = null;
      for (let attempt = 0; attempt < 3 && !reward; attempt += 1) {
        const { data, error } = await supabase.from('spin_rewards').insert({ outlet_id: outlet.id, code: rewardCode(), device_key: deviceKey, label: prize.label, reward_type: prize.type, reward_value: prize.value, expires_at: expiresAt }).select('code,label,reward_type,reward_value,expires_at').maybeSingle();
        if (!error) reward = data;
      }
      if (!reward) return res.status(500).json({ error: 'Could not create your reward. Please try once more.' });
      return res.status(201).json({ reward: { code: reward.code, label: reward.label, type: reward.reward_type, value: Number(reward.reward_value), expiresAt: reward.expires_at } });
    }

    if (action === 'verify') {
      const outletId = String(body.outletId || '').trim();
      if (!outletId) return res.status(400).json({ error: 'Select an outlet first.' });
      if (!await staff(req, res, outletId)) return;
      const { data: reward } = await supabase.from('spin_rewards').select('code,label,reward_type,reward_value,status,expires_at').eq('outlet_id', outletId).eq('code', cleanCode(body.code)).maybeSingle();
      if (!reward || reward.status !== 'ISSUED') return res.status(404).json({ error: 'This reward is not available.' });
      if (new Date(reward.expires_at).getTime() < Date.now()) return res.status(410).json({ error: 'This reward has expired.' });
      return res.status(200).json({ reward: { code: reward.code, label: reward.label, type: reward.reward_type, value: Number(reward.reward_value), expiresAt: reward.expires_at } });
    }

    if (action === 'settings') {
      const outletId = String(body.outletId || '').trim();
      const auth = await staff(req, res, outletId, true); if (!auth) return;
      const { data, error } = await supabase.from('outlet_spin_settings').upsert({ outlet_id: outletId, enabled: body.enabled !== false, prizes: cleanPrizes(body.prizes), updated_at: new Date().toISOString(), updated_by: auth.user.id }, { onConflict: 'outlet_id' }).select('enabled,prizes').single();
      if (error) return res.status(500).json({ error: 'Could not save Spin & Win settings.' });
      return res.status(200).json({ settings: { enabled: data.enabled, prizes: cleanPrizes(data.prizes) } });
    }
    return res.status(400).json({ error: 'Unknown Spin & Win action.' });
  } catch (error) {
    console.error('Spin API error', error);
    return res.status(500).json({ error: 'Spin & Win is temporarily unavailable.' });
  }
}
