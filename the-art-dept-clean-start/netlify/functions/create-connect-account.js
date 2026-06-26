const {
  getStripe,
  handleError,
  json,
  parseBody,
  requireText,
  siteUrl
} = require('./_stripe');

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });

  try {
    const stripe = getStripe();
    const body = parseBody(event);
    const displayName = requireText(body.displayName, 'Artist name');
    const email = requireText(body.email, 'Artist email');
    const root = siteUrl(event);

    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email,
      business_profile: {
        name: displayName,
        url: root
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true }
      }
    });

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: root + '/stripe-start.html?refresh=1&account=' + encodeURIComponent(account.id),
      return_url: root + '/stripe-return.html?account=' + encodeURIComponent(account.id),
      type: 'account_onboarding'
    });

    return json(200, {
      accountId: account.id,
      onboardingUrl: accountLink.url
    });
  } catch (error) {
    return handleError(error);
  }
};
