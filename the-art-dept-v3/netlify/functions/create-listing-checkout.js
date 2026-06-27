const { json, parseBody, requireUser, supabaseAdmin } = require('./_supabase');
const { platformFeeCents, siteUrl, stripe, stripeError } = require('./_stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });

  try {
    const body = parseBody(event);
    const listingId = body.listingId;
    if (!listingId) return json(400, { error: 'Listing ID is required.' });

    const supabase = supabaseAdmin();
    const user = await requireUser(event);

    const { data: listing, error } = await supabase
      .from('listings')
      .select('id, artist_id, title, description, price_cents, currency, image_url, status')
      .eq('id', listingId)
      .single();

    if (error || !listing || listing.status !== 'active') {
      return json(404, { error: 'That listing is not available.' });
    }

    const [{ data: artistStripe }, { data: artistProfile }] = await Promise.all([
      supabase
        .from('artist_payout_accounts')
        .select('stripe_account_id, stripe_payouts_enabled, stripe_charges_enabled, stripe_details_submitted')
        .eq('user_id', listing.artist_id)
        .single(),
      supabase
        .from('profiles')
        .select('display_name')
        .eq('id', listing.artist_id)
        .single()
    ]);

    if (!artistStripe) return json(400, { error: 'The artist must finish payout setup before this can be purchased.' });

    if (!artistStripe.stripe_account_id || !artistStripe.stripe_payouts_enabled || !artistStripe.stripe_charges_enabled || !artistStripe.stripe_details_submitted) {
      return json(400, { error: 'The artist must finish payout setup before this can be purchased.' });
    }

    const stripeClient = stripe();
    const account = await stripeClient.accounts.retrieve(artistStripe.stripe_account_id);
    const transfersReady = account.capabilities && account.capabilities.transfers === 'active';
    if (!account.payouts_enabled || !account.charges_enabled || !account.details_submitted || !transfersReady) {
      return json(400, { error: 'The artist must finish payout setup before this can be purchased.' });
    }

    const fee = platformFeeCents(listing.price_cents);
    const { data: order, error: orderError } = await supabase.from('orders').insert({
      customer_id: user ? user.id : null,
      artist_id: listing.artist_id,
      listing_id: listing.id,
      amount_cents: listing.price_cents,
      platform_fee_cents: fee,
      currency: listing.currency || 'usd',
      status: 'pending'
    }).select('id').single();

    if (orderError || !order) return json(500, { error: 'The order could not be created.' });

    const root = siteUrl(event);
    const session = await stripeClient.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: listing.currency || 'usd',
            unit_amount: listing.price_cents,
            product_data: {
              name: listing.title,
              description: 'The Art Dept listing by ' + (artistProfile ? artistProfile.display_name : 'Artist'),
              images: listing.image_url ? [listing.image_url] : undefined
            }
          },
          quantity: 1
        }
      ],
      payment_intent_data: {
        application_fee_amount: fee,
        transfer_data: {
          destination: artistStripe.stripe_account_id
        },
        metadata: {
          order_id: order.id,
          listing_id: listing.id,
          artist_id: listing.artist_id
        }
      },
      metadata: {
        order_id: order.id,
        listing_id: listing.id,
        artist_id: listing.artist_id
      },
      success_url: root + '/?payment=success&order=' + encodeURIComponent(order.id),
      cancel_url: root + '/?payment=cancelled'
    });

    await supabase.from('orders').update({
      stripe_checkout_session_id: session.id
    }).eq('id', order.id);

    return json(200, { url: session.url });
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 500, { error: stripeError(error) });
  }
};
