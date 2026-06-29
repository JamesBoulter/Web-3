const { json, parseBody, requireUser, supabaseAdmin } = require('./_supabase');

function isDigitalListing(listing) {
  const text = [listing.format, listing.listing_type].join(' ').toLowerCase();
  return text.includes('digital') || text.includes('download') || text.includes('emote') || text.includes('logo');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });

  try {
    const user = await requireUser(event);
    const body = parseBody(event);
    const orderId = body.orderId;
    if (!orderId) return json(400, { error: 'Order ID is required.' });

    const supabase = supabaseAdmin();
    const [{ data: profile }, { data: order, error: orderError }] = await Promise.all([
      supabase.from('profiles').select('id, role').eq('id', user.id).single(),
      supabase
        .from('orders')
        .select('id, customer_id, artist_id, listing_id, status')
        .eq('id', orderId)
        .single()
    ]);

    if (orderError || !order) return json(404, { error: 'Order not found.' });

    const isBuyer = order.customer_id === user.id && ['paid', 'fulfilled'].includes(order.status);
    const isArtist = order.artist_id === user.id;
    const isAdmin = profile && profile.role === 'admin';
    if (!isBuyer && !isArtist && !isAdmin) return json(403, { error: 'This download is not available for your account.' });

    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id, title, image_url, original_file_path, listing_type, format')
      .eq('id', order.listing_id)
      .single();

    if (listingError || !listing) return json(404, { error: 'Listing not found.' });
    if (isBuyer && !isDigitalListing(listing)) return json(403, { error: 'This listing is delivered by the artist.' });

    if (!listing.original_file_path) {
      return json(200, {
        url: listing.image_url,
        title: listing.title,
        protected: false
      });
    }

    const { data, error } = await supabase
      .storage
      .from('listing-originals')
      .createSignedUrl(listing.original_file_path, 120);

    if (error || !data || !data.signedUrl) return json(500, { error: 'The original file could not be prepared.' });

    return json(200, {
      url: data.signedUrl,
      title: listing.title,
      protected: true,
      expiresInSeconds: 120
    });
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 500, { error: error.message || 'Download failed.' });
  }
};
