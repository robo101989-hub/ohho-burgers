import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ROLES = ['ADMIN', 'OWNER', 'MANAGER', 'STAFF'];
const OUTLET_REQUIRED_ROLES = ['OWNER', 'MANAGER', 'STAFF'];

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

async function requireAdmin(req, res) {
  const token = bearerToken(req);

  if (!token) {
    res.status(401).json({ error: 'Missing authorization token.' });
    return null;
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(token);

  if (userError || !userData?.user) {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', userData.user.id)
    .single();

  if (
    profileError ||
    profile?.role !== 'ADMIN' ||
    profile?.is_active === false
  ) {
    res.status(403).json({ error: 'Admin access required.' });
    return null;
  }

  return userData.user;
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRole(value) {
  const role = cleanText(value).toUpperCase();
  return ROLES.includes(role) ? role : null;
}

function normalizeOutletIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter(id => typeof id === 'string')
      .map(id => id.trim())
      .filter(Boolean)
  )];
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function getStaff() {
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, name, phone, role, is_active, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (profilesError) throw profilesError;

  const { data: assignments, error: assignmentsError } =
    await supabase
      .from('outlet_users')
      .select('user_id, outlet_id');

  if (assignmentsError) throw assignmentsError;

  const staff = await Promise.all(
    (profiles || []).map(async profile => {
      const { data: authData, error: authError } =
        await supabase.auth.admin.getUserById(profile.id);

      if (authError) {
        console.error('Unable to load staff email:', profile.id, authError);
      }

      return {
        ...profile,
        email: authData?.user?.email || null,
        outlet_ids: (assignments || [])
          .filter(row => row.user_id === profile.id)
          .map(row => row.outlet_id)
      };
    })
  );

  return staff;
}
async function validateOutlets(outletIds) {
  if (!outletIds.length) return;

  const { data, error } = await supabase
    .from('outlets')
    .select('id')
    .in('id', outletIds);

  if (error) throw error;

  const validIds = new Set((data || []).map(outlet => outlet.id));

  if (validIds.size !== outletIds.length) {
    const invalid = outletIds.filter(id => !validIds.has(id));
    const error = new Error(`Invalid outlet assignment: ${invalid.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
}

async function replaceOutletAssignments(userId, outletIds) {
  const { error: deleteError } = await supabase
    .from('outlet_users')
    .delete()
    .eq('user_id', userId);

  if (deleteError) throw deleteError;

  if (!outletIds.length) return;

  const rows = outletIds.map(outletId => ({
    user_id: userId,
    outlet_id: outletId
  }));

  const { error: insertError } = await supabase
    .from('outlet_users')
    .insert(rows);

  if (insertError) throw insertError;
}

async function createStaff(body) {
  const name = cleanText(body?.name);
  const phone = cleanText(body?.phone);
  const email = cleanText(body?.email).toLowerCase();
  const password = typeof body?.password === 'string' ? body.password : '';
  const role = normalizeRole(body?.role);
  const outletIds = normalizeOutletIds(body?.outlet_ids);

  if (!name) {
    const error = new Error('Full name is required.');
    error.statusCode = 400;
    throw error;
  }

  if (!validateEmail(email)) {
    const error = new Error('A valid login email is required.');
    error.statusCode = 400;
    throw error;
  }

  if (password.length < 8) {
    const error = new Error('Temporary password must be at least 8 characters.');
    error.statusCode = 400;
    throw error;
  }

  if (!role) {
    const error = new Error('Invalid staff role.');
    error.statusCode = 400;
    throw error;
  }

  if (OUTLET_REQUIRED_ROLES.includes(role) && !outletIds.length) {
    const error = new Error('Select at least one outlet for this role.');
    error.statusCode = 400;
    throw error;
  }

  await validateOutlets(outletIds);

  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

  if (authError) {
    if (
      authError.message?.toLowerCase().includes('already') ||
      authError.code === 'email_exists'
    ) {
      const error = new Error('An account with this email already exists.');
      error.statusCode = 409;
      throw error;
    }

    throw authError;
  }

  const userId = authData?.user?.id;

  if (!userId) {
    throw new Error('Staff account was created without a user ID.');
  }

  try {
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        name,
        phone: phone || null,
        role,
        is_active: true
      });

    if (profileError) throw profileError;

    await replaceOutletAssignments(userId, outletIds);

    return {
      id: userId,
      name,
      phone: phone || null,
      role,
      is_active: true,
      outlet_ids: outletIds
    };
  } catch (error) {
    await supabase.auth.admin.deleteUser(userId);
    throw error;
  }
}

async function updateStaff(body) {
  const id = cleanText(body?.id);
  const name = cleanText(body?.name);
  const phone = cleanText(body?.phone);
  const role = normalizeRole(body?.role);
  const outletIds = normalizeOutletIds(body?.outlet_ids);
  const isActive =
    typeof body?.is_active === 'boolean' ? body.is_active : true;

  if (!id) {
    const error = new Error('Staff member ID is required.');
    error.statusCode = 400;
    throw error;
  }

  if (!name) {
    const error = new Error('Full name is required.');
    error.statusCode = 400;
    throw error;
  }

  if (!role) {
    const error = new Error('Invalid staff role.');
    error.statusCode = 400;
    throw error;
  }

  if (OUTLET_REQUIRED_ROLES.includes(role) && !outletIds.length) {
    const error = new Error('Select at least one outlet for this role.');
    error.statusCode = 400;
    throw error;
  }

  await validateOutlets(outletIds);

  const { data: existing, error: existingError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', id)
    .single();

  if (existingError || !existing) {
    const error = new Error('Staff member not found.');
    error.statusCode = 404;
    throw error;
  }

  if (existing.id === body?.admin_id) {
    const error = new Error('You cannot modify your own administrator account here.');
    error.statusCode = 400;
    throw error;
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      name,
      phone: phone || null,
      role,
      is_active: isActive,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (profileError) throw profileError;

  await replaceOutletAssignments(id, outletIds);

  return {
    id,
    name,
    phone: phone || null,
    role,
    is_active: isActive,
    outlet_ids: outletIds
  };
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === 'GET') {
      const staff = await getStaff();
      return res.status(200).json({ staff });
    }

    if (req.method === 'POST') {
      const staff = await createStaff(req.body || {});
      return res.status(201).json({ staff });
    }

    if (req.method === 'PATCH') {
      const staff = await updateStaff({
        ...(req.body || {}),
        admin_id: admin.id
      });

      return res.status(200).json({ staff });
    }

    return res.status(405).json({
      error: 'Method not allowed.'
    });
  } catch (error) {
    console.error('Staff API error:', error);

    return res.status(error?.statusCode || 500).json({
      error: error?.message || 'Internal server error.'
    });
  }
}
