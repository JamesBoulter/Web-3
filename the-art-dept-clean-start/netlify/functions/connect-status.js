const {
  getStripe,
  handleError,
  json,
  parseBody,
  requireText
} = require('./_stripe');

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });

  try {
    const stripe = getStripe();
    const body = parseBody(event);
    const accountId = requireText(body.accountId, 'Connected account ID');
    const account = await stripe.accounts.retrieve(accountId);

    return json(200, {
      accountId: account.id,
      chargesEnabled: !!account.charges_enabled,
      payoutsEnabled: !!account.payouts_enabled,
      detailsSubmitted: !!account.details_submitted,
      cardPayments: account.capabilities && account.capabilities.card_payments,
      transfers: account.capabilities && account.capabilities.transfers,
      ready: !!account.details_submitted && !!account.payouts_enabled && account.capabilities && account.capabilities.transfers === 'active'
    });
  } catch (error) {
    return handleError(error);
  }
};
