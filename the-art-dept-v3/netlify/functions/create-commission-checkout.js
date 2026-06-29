const { json, parseBody, requireUser, supabaseAdmin } = require('./_supabase');
const { platformFeeCents, processingFeeCents, siteUrl, stripe, stripeError } = require('./_stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });

  try {
    const body = parseBody(event);
    const requestId = body.requestId;
    if (!requestId) return json(400, { error: 'Commission request ID is required.' });

    const user = await requireUser(event);
    const supabase = supabaseAdmin();

    const { data: request, error: requestError } = await supabase
      .from('commission_requests')
      .select('id, customer_id, artist_id, title, budget_cents, quoted_cents, payment_status, status')
      .eq('id', requestId)
      .single();

    if (requestError || !request) return json(404, { error: 'Commission request not found.' });
    if (request.customer_id !== user.id) return json(403, { error: 'This commission request belongs to another customer.' });
    if (!request.artist_id) return json(400, { error: 'An artist must accept this request before payment.' });
    if (request.status === 'declined' || request.status === 'completed') return json(400, { error: 'This commission request is not payable.' });
    if (request.payment_status === 'paid') return json(400, { error: 'This commission is already paid.' });

    const amountCents = Number(request.quoted_cents || request.budget_cents || 0);
    if (!Number.isFinite(amountCents) || amountCents < 100) return json(400, { error: 'The commission amount must be at least $1.' });

    const [{ data: artistStripe }, { data: artistProfile }] = await Promise.all([
      supabase
        .from('artist_payout_accounts')
        .select('stripe_account_id, stripe_payouts_enabled, stripe_charges_enabled, stripe_details_submitted')
        .eq('user_id', request.artist_id)
        .single(),
      supabase
        .from('profiles')
        .select('display_name')
        .eq('id', request.artist_id)
        .single()
    ]);

    if (!artistStripe || !artistStripe.stripe_account_id || !artistStripe.stripe_payouts_enabled || !artistStripe.stripe_charges_enabled || !artistStripe.stripe_details_submitted) {
      return json(400, { error: 'The artist must finish payout setup before this commission can be paid.' });
    }

    const stripeClient = stripe();
    const account = await stripeClient.accounts.retrieve(artistStripe.stripe_account_id);
    const transfersReady = account.capabilities && account.capabilities.transfers === 'active';
    if (!account.payouts_enabled || !account.charges_enabled || !account.details_submitted || !transfersReady) {
      return json(400, { error: 'The artist must finish payout setup before this commission can be paid.' });
    }

    const fee = platformFeeCents(amountCents);
    const processingFee = processingFeeCents(amountCents, fee);
    const customerTotal = amountCents + fee + processingFee;
    const platformFeeLabel = String(Number(process.env.PLATFORM_FEE_PERCENT || 5)) + '% marketplace fee that helps operate The Art Department.';

    const { data: order, error: orderError } = await supabase.from('orders').insert({
      customer_id: user.id,
      artist_id: request.artist_id,
      listing_id: null,
      commission_request_id: request.id,
      amount_cents: amountCents,
      platform_fee_cents: fee,
      currency: 'usd',
      status: 'pending'
    }).select('id').single();

    if (orderError || !order) return json(500, { error: 'The commission order could not be created. Make sure commission-workflow-upgrade.sql has been run.' });

    const lineItems = [
      {
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: 'Commission: ' + request.title,
            description: 'The Art Department commission by ' + (artistProfile ? artistProfile.display_name : 'Artist')
          }
        },
        quantity: 1
      }
    ];

    if (fee > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          unit_amount: fee,
          product_data: {
            name: 'The Art Department platform service fee',
            description: platformFeeLabel
          }
        },
        quantity: 1
      });
    }

    if (processingFee > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          unit_amount: processingFee,
          product_data: {
            name: 'Payment processing',
            description: 'Estimated card processing coverage.'
          }
        },
        quantity: 1
      });
    }

    const root = siteUrl(event);
    const session = await stripeClient.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      payment_intent_data: {
        application_fee_amount: fee + processingFee,
        transfer_data: {
          destination: artistStripe.stripe_account_id
        },
        metadata: {
          order_id: order.id,
          commission_request_id: request.id,
          artist_id: request.artist_id,
          artist_amount_cents: String(amountCents),
          platform_fee_cents: String(fee),
          processing_fee_cents: String(processingFee),
          customer_total_cents: String(customerTotal)
        }
      },
      metadata: {
        order_id: order.id,
        commission_request_id: request.id,
        artist_id: request.artist_id,
        artist_amount_cents: String(amountCents),
        platform_fee_cents: String(fee),
        processing_fee_cents: String(processingFee),
        customer_total_cents: String(customerTotal)
      },
      success_url: root + '/?payment=success&session_id={CHECKOUT_SESSION_ID}&order=' + encodeURIComponent(order.id),
      cancel_url: root + '/?payment=cancelled'
    });

    await Promise.all([
      supabase.from('orders').update({
        stripe_checkout_session_id: session.id
      }).eq('id', order.id),
      supabase.from('commission_requests').update({
        quoted_cents: amountCents,
        payment_status: 'requested',
        payment_order_id: order.id,
        status: 'quoted'
      }).eq('id', request.id)
    ]);

    return json(200, { url: session.url });
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 500, { error: stripeError(error) });
  }
};
