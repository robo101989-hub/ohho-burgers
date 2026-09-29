import { randomInt, randomBytes } from 'node:crypto';
import { cleanPrizes, normalizePrize, wheelSlots } from '../lib/spin-rewards.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const tokenFrom = req => (req.headers?.authorization || '').replace(/^Bearer\s+/i, '') || null;
const cleanCode = value => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
const noReward = prize => prize?.type === 'NONE' || /better luck/i.test(prize?.label || '');
const publicReward = reward => ({ code: reward.code, label: reward.label, type: reward.reward_type, value: Number(reward.reward_value), ...reward.reward_details, status: reward.status, expiresAt: reward.expires_at });
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
  const { data, error } = await supabase.from('outlet_spin_settings').select('enabled,prizes,minimum_order').eq('outlet_id', outletId).maybeSingle();
  if (error) throw new Error('Could not load reward settings');
  return { enabled: data?.enabled !== false, prizes: cleanPrizes(data?.prizes), minimumOrder: Math.max(0, Number(data?.minimum_order || 0)) };
}
function rewardCode() { return `OHHO-${randomBytes(5).toString('hex').toUpperCase()}`; }

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (req.query?.action === 'settings') {
        const auth = await staff(req, res, null, true); if (!auth) return;
        const [{ data: outlets, error: outletError }, { data: settings, error: settingsError }, { data: history, error: historyError }] = await Promise.all([
          supabase.from('outlets').select('id,name,slug').order('created_at', { ascending: true }),
          supabase.from('outlet_spin_settings').select('outlet_id,enabled,prizes,minimum_order'),
          supabase.from('spin_rewards').select('code,label,status,issued_at,expires_at,redeemed_at,outlets(name)').order('issued_at', { ascending: false }).limit(100)
        ]);
        if (outletError || settingsError || historyError) return res.status(500).json({ error: 'Could not load Spin & Win settings.' });
        return res.status(200).json({ outlets: outlets || [], settings: (settings || []).map(item => ({ ...item, prizes: cleanPrizes(item.prizes) })), history: history || [] });
      }
      const outlet = await getOutlet(req.query?.outlet);
      if (!outlet || outlet.status !== 'ACTIVE') return res.status(404).json({ error: 'Spin & Win is not active at this outlet.' });
      const settings = await getSettings(outlet.id);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ outlet: { name: outlet.name, slug: outlet.slug }, enabled: settings.enabled, prizes: settings.prizes, slots: wheelSlots(settings.prizes), minimumOrder: settings.minimumOrder });
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
      const indiaDate = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
      const today = new Date(`${indiaDate}T00:00:00+05:30`);
      const { data: existing, error: existingError } = await supabase.from('spin_rewards').select('code,label,reward_type,reward_value,reward_details,status,expires_at').eq('outlet_id', outlet.id).eq('device_key', deviceKey).gte('issued_at', today.toISOString()).order('issued_at', { ascending: false }).limit(1).maybeSingle();
      if (existingError) return res.status(503).json({ error: 'Could not check your previous spin. Please try again.' });
      if (existing) {
        if (noReward(existing)) return res.status(409).json({ error: 'You have already spun today.', outcome: 'NO_REWARD', reused: true });
        return res.status(409).json({ error: 'You have already spun today.', outcome: 'REWARD', reused: true, reward: publicReward(existing) });
      }
      const slots = wheelSlots(settings.prizes);
      const segment = randomInt(slots.length);
      const prize = slots[segment];
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      if (noReward(prize)) {
        const { error } = await supabase.from('spin_rewards').insert({ outlet_id: outlet.id, code: rewardCode(), device_key: deviceKey, label: prize.label, reward_type: 'FREE_ITEM', reward_value: 0, status: 'REDEEMED', expires_at: expiresAt, redeemed_at: new Date().toISOString() });
        if (error) return res.status(500).json({ error: 'Could not record this spin. Please try again.' });
        return res.status(201).json({ outcome: 'NO_REWARD', segment, slots });
      }
      let reward = null;
      for (let attempt = 0; attempt < 3 && !reward; attempt += 1) {
        const { data, error } = await supabase.from('spin_rewards').insert({ outlet_id: outlet.id, code: rewardCode(), device_key: deviceKey, label: prize.label, reward_type: prize.type, reward_value: prize.value, reward_details: prize.type === 'FREE_ITEM' ? { menuItemId: prize.menuItemId, category: prize.category } : {}, expires_at: expiresAt }).select('code,label,reward_type,reward_value,reward_details,expires_at').maybeSingle();
        if (!error) reward = data;
      }
      if (!reward) return res.status(500).json({ error: 'Could not create your reward. Please try once more.' });
      return res.status(201).json({ outcome: 'REWARD', segment, slots, reward: { ...publicReward(reward), minimumOrder: settings.minimumOrder } });
    }

    if (action === 'verify') {
      const outletId = String(body.outletId || '').trim();
      if (!outletId) return res.status(400).json({ error: 'Select an outlet first.' });
      if (!await staff(req, res, outletId)) return;
      const orderSubtotal = Math.max(0, Number(body.orderSubtotal || 0));
      const settings = await getSettings(outletId);
      if (settings.minimumOrder > 0 && orderSubtotal < settings.minimumOrder) {
        return res.status(400).json({ error: `Spin & Win requires a minimum order of ₹${settings.minimumOrder.toFixed(0)}.` });
      }
      const { data: reward } = await supabase.from('spin_rewards').select('code,label,reward_type,reward_value,reward_details,status,expires_at').eq('outlet_id', outletId).eq('code', cleanCode(body.code)).maybeSingle();
      if (!reward || reward.status !== 'ISSUED') return res.status(404).json({ error: 'This reward is not available.' });
      if (new Date(reward.expires_at).getTime() < Date.now()) return res.status(410).json({ error: 'This reward has expired.' });
      return res.status(200).json({ reward: { ...publicReward(reward), minimumOrder: settings.minimumOrder } });
    }

    if (action === 'settings') {
      const allOutlets = body.allOutlets === true;
      const outletId = String(body.outletId || '').trim();
      const auth = await staff(req, res, allOutlets ? null : outletId, true); if (!auth) return;
      let prizes;
      try {
        if (!Array.isArray(body.prizes) || body.prizes.length !== 4) throw new Error('Configure all four reward cards.');
        prizes = body.prizes.map(normalizePrize);
      } catch (error) { return res.status(400).json({ error: error.message }); }
      const minimumOrder = Math.max(0, Math.min(100000, Number(body.minimumOrder || 0)));
      if (!Number.isFinite(minimumOrder)) return res.status(400).json({ error: 'Enter a valid minimum order.' });
      let outletIds = [outletId];
      if (allOutlets) {
        const { data: outlets, error: outletError } = await supabase.from('outlets').select('id').order('created_at', { ascending: true });
        if (outletError) return res.status(500).json({ error: 'Could not load outlets for Spin & Win settings.' });
        outletIds = (outlets || []).map(outlet => outlet.id);
      }
      if (!outletIds.length || outletIds.some(id => !id)) return res.status(400).json({ error: 'Choose an outlet to save Spin & Win settings.' });
      for (const prize of prizes.filter(item => item.type === 'FREE_ITEM')) {
        const { data: item } = await supabase.from('menu_items').select('id,name,is_available').eq('id', prize.menuItemId).maybeSingle();
        const { data: availability } = await supabase.from('outlet_menu_items').select('outlet_id').eq('menu_item_id', prize.menuItemId).eq('is_available', true).in('outlet_id', outletIds);
        if (!item?.is_available || new Set((availability || []).map(row => row.outlet_id)).size !== outletIds.length) return res.status(400).json({ error: 'The free item must be available at every selected outlet. Choose one outlet or another item.' });
        prize.label = `Free ${item.name}`;
      }
      const values = outletIds.map(id => ({ outlet_id: id, enabled: body.enabled !== false, prizes, minimum_order: minimumOrder, updated_at: new Date().toISOString(), updated_by: auth.user.id }));
      const { data, error } = await supabase.from('outlet_spin_settings').upsert(values, { onConflict: 'outlet_id' }).select('outlet_id,enabled,prizes,minimum_order');
      if (error) return res.status(500).json({ error: 'Could not save Spin & Win settings.' });
      return res.status(200).json({ settings: (data || []).map(item => ({ ...item, prizes: cleanPrizes(item.prizes), minimumOrder: Number(item.minimum_order || 0) })) });
    }
    return res.status(400).json({ error: 'Unknown Spin & Win action.' });
  } catch (error) {
    console.error('Spin API error', error);
    return res.status(500).json({ error: 'Spin & Win is temporarily unavailable.' });
  }
}
