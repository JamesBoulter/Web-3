const { cancelOtherPendingOrdersForPaidOrder, cancelPendingOrderIfPaidDuplicateExists } = require('./_orders');
const { json, requireUser, supabaseAdmin } = require('./_supabase');
const { stripe, stripeError } = require('./_stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });

  try {
    const user = await requireUser(event);
    const supabase = supabaseAdmin();

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) return json(403, { error: 'Profile not found.' });

    let query = supabase
      .from('orders')
      .select('id, customer_id, artist_id, listing_id, commission_request_id, status, stripe_checkout_session_id')
      .eq('status', 'pending')
      .not('stripe_checkout_session_id', 'is', null)
      .limit(25);

    if (profile.role !== 'admin') {
      query = query.or('customer_id.eq.' + user.id + ',artist_id.eq.' + user.id);
    }

    const { data: orders, error: ordersError } = await query;
    if (ordersError) return json(500, { error: 'Pending orders could not be loaded.' });

    const stripeClient = stripe();
    let checked = 0;
    let updated = 0;
    let cancelled = 0;

    for (const order of orders || []) {
      if (await cancelPendingOrderIfPaidDuplicateExists(supabase, order)) {
        cancelled += 1;
        continue;
      }

      checked += 1;
      const session = await stripeClient.checkout.sessions.retrieve(order.stripe_checkout_session_id);

      if (session.payment_status === 'paid') {
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            status: 'paid',
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: session.payment_intent || null,
            paid_at: new Date().toISOString()
          })
          .eq('id', order.id);

        if (!updateError) {
          if (order.commission_request_id) {
            await supabase.from('commission_requests').update({
              payment_status: 'paid',
              payment_order_id: order.id,
              status: 'accepted'
            }).eq('id', order.commission_request_id);
          }
          updated += 1;
          cancelled += await cancelOtherPendingOrdersForPaidOrder(supabase, order.id);
        }
      } else if (session.status === 'expired') {
        const { error: cancelError } = await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: session.payment_intent || null
          })
          .eq('id', order.id);

        if (!cancelError) {
          if (order.commission_request_id) {
            await supabase.from('commission_requests').update({
              payment_status: 'failed'
            }).eq('id', order.commission_request_id);
          }
          cancelled += 1;
        }
      }
    }

    return json(200, { checked, updated, cancelled });
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 500, { error: stripeError(error) });
  }
};
