const {
  amountToCents,
  getStripe,
  handleError,
  json,
  parseBody,
  requireText,
  siteUrl
} = require('./_stripe');

async function getStore() {
  const blobs = await import('@netlify/blobs');
  return blobs.getStore('artist-listings');
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });

  try {
    const stripe = getStripe();
    const body = parseBody(event);
    const listingId = requireText(body.listingId, 'Listing ID');
    const root = siteUrl(event);
    const store = await getStore();
    const listing = await store.get('listing-' + listingId, { type: 'json' });

    if (!listing) {
      return json(404, { error: 'That listing could not be found.' });
    }

    const connectedAccountId = requireText(listing.connectedAccountId, 'Connected artist account ID');
    const amountInCents = amountToCents(listing.price);

    const account = await stripe.accounts.retrieve(connectedAccountId);
    const transfersReady = account.capabilities && account.capabilities.transfers === 'active';
    if (!account.details_submitted || !account.payouts_enabled || !transfersReady) {
      return json(400, {
        error: 'The artist must finish Stripe payout setup before this listing can be purchased.'
      });
    }

    const platformFee = Math.round(amountInCents * 0.05);
    const imageList = listing.image ? [listing.image] : undefined;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: body.customerEmail || undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountInCents,
            product_data: {
              name: listing.title,
              description: listing.artist + ' on The Art Dept',
              images: imageList
            }
          },
          quantity: 1
        }
      ],
      metadata: {
        listingId: listing.id,
        artist: listing.artist,
        title: listing.title
      },
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: connectedAccountId
        },
        metadata: {
          listingId: listing.id,
          artist: listing.artist,
          title: listing.title
        }
      },
      success_url: root + '/payment-success.html?listing_id=' + encodeURIComponent(listing.id) + '&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: root + '/#store'
    });

    return json(200, {
      url: session.url
    });
  } catch (error) {
    return handleError(error);
  }
};
