const Stripe = require('stripe');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(name + ' is missing in Netlify environment variables.');
    error.statusCode = 500;
    throw error;
  }
  return value;
}

function stripe() {
  return new Stripe(requiredEnv('STRIPE_SECRET_KEY'));
}

function siteUrl(event) {
  const host = event.headers['x-forwarded-host'] || event.headers['X-Forwarded-Host'] || event.headers.host || event.headers.Host;
  const proto = event.headers['x-forwarded-proto'] || event.headers['X-Forwarded-Proto'] || 'https';
  if (host) return (proto + '://' + host).replace(/\/$/, '');
  const configured = process.env.SITE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL;
  return configured ? configured.replace(/\/$/, '') : 'http://localhost:8888';
}

function amountToCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 1) {
    const error = new Error('Amount must be at least $1.');
    error.statusCode = 400;
    throw error;
  }
  return Math.round(amount * 100);
}

function platformFeeCents(amountCents) {
  const percent = Number(process.env.PLATFORM_FEE_PERCENT || 5);
  return Math.round(amountCents * (percent / 100));
}

function stripeError(error) {
  const message = error && error.message ? error.message : '';
  if (/api key|authentication/i.test(message)) return 'Stripe rejected the secret key. Check STRIPE_SECRET_KEY in Netlify.';
  if (/account|Connect|capabilities|payout/i.test(message)) return 'Stripe payout setup is not finished for this artist.';
  return message || 'Stripe could not complete this request.';
}

module.exports = {
  amountToCents,
  platformFeeCents,
  siteUrl,
  stripe,
  stripeError
};
