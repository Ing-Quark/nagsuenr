// api/create-executive.js
// Vercel Serverless Function — Executive Account Creation (Server-Side)
//
// Stored variables required on Vercel:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Safe transactional creation of Supabase auth account + executives DB record.

const ALLOWED_ROLES = [
  'chapter_admin', 'president', 'vice_president',
  'pro', 'financial_sec', 'secretary', 'welfare', 'organizing_sec'
];

export default async function handler(req, res) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;

  if (!serviceKey || !supabaseUrl) {
    return res.status(503).json({
      error: 'Server not configured. Add SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL to Vercel env vars.'
    });
  }

  const { email, tempPassword, fullName, role, universityId } = req.body || {};

  // Validation
  if (!email || !tempPassword || !fullName || !role || !universityId) {
    return res.status(400).json({ error: 'Missing required fields: email, tempPassword, fullName, role, universityId.' });
  }

  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Allowed: ${ALLOWED_ROLES.join(', ')}` });
  }

  try {
    // Step 1 — Create Supabase Auth user
    const authRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password: tempPassword,
        email_confirm: true  // auto-verify email address
      })
    });

    const authData = await authRes.json();

    if (!authRes.ok || !authData.id) {
      return res.status(400).json({ error: authData.message || 'Failed to create auth user.' });
    }

    const authUserId = authData.id;

    // Step 2 — Insert executive record into executives table
    const execRes = await fetch(`${supabaseUrl}/rest/v1/executives`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        auth_user_id: authUserId,
        university_id: universityId,
        full_name: fullName,
        email,
        role,
        is_active: true
      })
    });

    const execData = await execRes.json();

    if (!execRes.ok) {
      // Rollback: delete the auth user we just created to prevent orphaned accounts
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${authUserId}`, {
        method: 'DELETE',
        headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
      });
      return res.status(500).json({ error: 'Failed to create executive database record. Auth user rolled back.' });
    }

    const exec = Array.isArray(execData) ? execData[0] : execData;

    return res.status(200).json({
      success: true,
      authUserId,
      execId: exec.id,
      email,
      tempPassword  // returned once so admin can share it
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
