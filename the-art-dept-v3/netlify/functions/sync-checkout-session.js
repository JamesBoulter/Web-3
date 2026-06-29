const { json, parseBody, requireUser, supabaseAdmin } = require('./_supabase');
const { stripe, stripeError } = require('./_stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });

  try {
    const user = await requireUser(event);
    const body = parseBody(event);
    const sessionId = body.sessionId;
    const expectedOrderId = body.orderId || null;

    if (!sessionId) return json(400, { error: 'Checkout session ID is required.' });

    const stripeClient = stripe();
    const session = await stripeClient.checkout.sessions.retrieve(sessionId);
    const orderId = session.metadata && session.metadata.order_id;

    if (!orderId) return json(400, { error: 'Stripe checkout session is missing the order ID.' });
    if (expectedOrderId && expectedOrderId !== orderId) return json(400, { error: 'Checkout session does not match this order.' });

    const supabase = supabaseAdmin();
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, customer_id, status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) return json(404, { error: 'Order not found.' });
    if (order.customer_id !== user.id) return json(403, { error: 'This order belongs to another customer.' });

    if (session.payment_status === 'paid') {
      const updates = {
        status: 'paid',
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent || null
      };

      if (order.status !== 'paid') {
        updates.paid_at = new Date().toISOString();
      }

      const { error: updateError } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', order.id);

      if (updateError) return json(500, { error: 'Order status could not be updated.' });
    }

    return json(200, {
      orderId,
      status: session.payment_status === 'paid' ? 'paid' : order.status,
      paymentStatus: session.payment_status,
      checkoutStatus: session.status
    });
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 500, { error: stripeError(error) });
  }
};
