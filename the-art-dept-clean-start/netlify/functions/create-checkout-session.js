const {
  amountToCents,
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
    const connectedAccountId = requireText(body.connectedAccountId, 'Connected artist account ID');
    const artistName = requireText(body.artistName || 'Artist', 'Artist name');
    const amountInCents = amountToCents(body.amount);
    const root = siteUrl(event);

    const account = await stripe.accounts.retrieve(connectedAccountId);
    const transfersReady = account.capabilities && account.capabilities.transfers === 'active';
    if (!account.details_submitted || !account.payouts_enabled || !transfersReady) {
      return json(400, {
        error: 'The artist must finish Stripe onboarding before checkout can collect a deposit.'
      });
    }

    const platformFee = Math.round(amountInCents * 0.05);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: body.customerEmail || undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountInCents,
            product_data: {
              name: 'Commission deposit for ' + artistName,
              description: '30% deposit through The Art Dept'
            }
          },
          quantity: 1
        }
      ],
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: connectedAccountId
        }
      },
      success_url: root + '/payment-success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: root + '/#request'
    });

    return json(200, {
      url: session.url
    });
  } catch (error) {
    return handleError(error);
  }
};
