async function cancelOtherPendingOrdersForPaidOrder(supabase, orderId) {
  const { data: order } = await supabase
    .from('orders')
    .select('id, customer_id, listing_id')
    .eq('id', orderId)
    .single();

  if (!order || !order.customer_id || !order.listing_id) return 0;

  const { data } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('customer_id', order.customer_id)
    .eq('listing_id', order.listing_id)
    .eq('status', 'pending')
    .neq('id', order.id)
    .select('id');

  return data ? data.length : 0;
}

async function cancelPendingOrderIfPaidDuplicateExists(supabase, order) {
  if (!order || !order.customer_id || !order.listing_id) return false;

  const { data: paidOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('customer_id', order.customer_id)
    .eq('listing_id', order.listing_id)
    .in('status', ['paid', 'fulfilled'])
    .neq('id', order.id)
    .limit(1)
    .maybeSingle();

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
