async function cancelOtherPendingOrdersForPaidOrder(supabase, orderId) {
  const { data: order } = await supabase
    .from('orders')
    .select('id, customer_id, listing_id, commission_request_id')
    .eq('id', orderId)
    .single();

  if (!order || !order.customer_id || (!order.listing_id && !order.commission_request_id)) return 0;

  let query = supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('customer_id', order.customer_id)
    .eq('status', 'pending')
    .neq('id', order.id);

  query = order.listing_id
    ? query.eq('listing_id', order.listing_id)
    : query.eq('commission_request_id', order.commission_request_id);

  const { data } = await query.select('id');

  return data ? data.length : 0;
}

async function cancelPendingOrderIfPaidDuplicateExists(supabase, order) {
  if (!order || !order.customer_id || (!order.listing_id && !order.commission_request_id)) return false;

  let query = supabase
    .from('orders')
    .select('id')
    .eq('customer_id', order.customer_id)
    .in('status', ['paid', 'fulfilled'])
    .neq('id', order.id)
    .limit(1);

  query = order.listing_id
    ? query.eq('listing_id', order.listing_id)
    : query.eq('commission_request_id', order.commission_request_id);

  const { data: paidOrder } = await query.maybeSingle();

  if (!paidOrder) return false;

  const { error } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', order.id)
    .eq('status', 'pending');

  return !error;
}

module.exports = {
  cancelOtherPendingOrdersForPaidOrder,
  cancelPendingOrderIfPaidDuplicateExists
};
