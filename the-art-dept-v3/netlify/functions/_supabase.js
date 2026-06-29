const { createClient } = require('@supabase/supabase-js');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(name + ' is missing in Netlify environment variables.');
    error.statusCode = 500;
    throw error;
  }
  return value;
}

function supabaseAdmin() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function getUserFromEvent(event) {
  const auth = event.headers.authorization || event.headers.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { user: null, token: '' };

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { user: null, token: '' };
  return { user: data.user, token };
}

async function requireUser(event) {
  const result = await getUserFromEvent(event);
  if (!result.user) {
    const error = new Error('Please sign in first.');
    error.statusCode = 401;
    throw error;
  }
  return result.user;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch (error) {
    const bad = new Error('The request could not be read.');
    bad.statusCode = 400;
    throw bad;
  }
}

module.exports = {
  getUserFromEvent,
  json,
  parseBody,
  requireUser,
  supabaseAdmin
};
