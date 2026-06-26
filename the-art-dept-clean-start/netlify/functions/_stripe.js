const Stripe = require('stripe');

const headers = {
  'Content-Type': 'application/json'
};

function json(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body)
  };
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !key.startsWith('sk_')) {
    const error = new Error('Stripe is not connected. Add STRIPE_SECRET_KEY in Netlify environment variables.');
    error.statusCode = 500;
    throw error;
  }
  return new Stripe(key);
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch (error) {
    const badJson = new Error('Request body was not valid JSON.');
    badJson.statusCode = 400;
    throw badJson;
  }
}

function requireText(value, label) {
  if (!value || typeof value !== 'string' || !value.trim()) {
    const error = new Error(label + ' is required.');
    error.statusCode = 400;
    throw error;
  }
  return value.trim();
}

function amountToCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0.5) {
    const error = new Error('Amount must be at least $0.50.');
    error.statusCode = 400;
    throw error;
  }
  return Math.round(amount * 100);
}

function siteUrl(event) {
  const configured = process.env.SITE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (configured) return configured.replace(/\/$/, '');
  const host = event.headers && (event.headers.host || event.headers.Host);
  const proto = event.headers && (event.headers['x-forwarded-proto'] || event.headers['X-Forwarded-Proto']);
  return host ? (proto || 'https') + '://' + host : 'http://localhost:8888';
}

function friendlyStripeError(error) {
  const message = error && error.message ? error.message : 'Stripe request failed.';
  if (/api key|authentication/i.test(message)) {
    return 'Stripe rejected the key. Check STRIPE_SECRET_KEY in Netlify.';
  }
  if (/platform-profile|responsibilities|losses|connect\/platform|onboard onto Connect|platform setup/i.test(message)) {
    return 'Stripe Connect needs one more platform setup step before artists can onboard.';
  }
  if (/permission|access/i.test(message)) {
    return 'Stripe rejected this request. Check that the secret key belongs to this Stripe account and has the right permissions.';
  }
  if (/connected account|account/i.test(message)) {
    return 'Stripe could not access that connected artist account. Clear the saved account and start onboarding again.';
  }
  return 'Stripe is not ready yet. Check your Stripe setup and try again.';
}

function handleError(error) {
  console.error(error);
  return json(error.statusCode || error.status || 500, {
    error: friendlyStripeError(error)
  });
}

module.exports = {
  amountToCents,
  getStripe,
  handleError,
  json,
  parseBody,
  requireText,
  siteUrl
};
