const Stripe = require('stripe');
const { cancelOtherPendingOrdersForPaidOrder } = require('./_orders');
const { json, supabaseAdmin } = require('./_supabase');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!secret || !stripeKey) return json(500, { error: 'Stripe webhook is not configured.' });

  const stripe = new Stripe(stripeKey);
  const signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

  let stripeEvent;
  try {
    const rawBody = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8');
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    return json(400, { error: 'Invalid Stripe webhook signature.' });
  }

  if (
    stripeEvent.type === 'checkout.session.completed' ||
    stripeEvent.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = stripeEvent.data.object;
    const orderId = session.metadata && session.metadata.order_id;
    if (orderId && (stripeEvent.type === 'checkout.session.async_payment_succeeded' || session.payment_status === 'paid')) {
      const supabase = supabaseAdmin();
      await supabase.from('orders').update({
        status: 'paid',
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent || null,
        paid_at: new Date().toISOString()
      }).eq('id', orderId);
      await cancelOtherPendingOrdersForPaidOrder(supabase, orderId);
    }
  }

  if (
    stripeEvent.type === 'checkout.session.async_payment_failed' ||
    stripeEvent.type === 'checkout.session.expired'
  ) {
    const session = stripeEvent.data.object;
    const orderId = session.metadata && session.metadata.order_id;
    if (orderId) {
      await supabaseAdmin().from('orders').update({
        status: 'cancelled',
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent || null
      }).eq('id', orderId);
    }
  }

  return json(200, { received: true });
};
