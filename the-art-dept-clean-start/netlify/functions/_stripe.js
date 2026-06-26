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
  if (/Connect|account/i.test(message)) {
    return message;
  }
  return message;
}

function handleError(error) {
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
