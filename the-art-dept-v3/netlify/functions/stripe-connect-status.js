const { json, requireUser, supabaseAdmin } = require('./_supabase');
const { stripe, stripeError } = require('./_stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });

  try {
    const user = await requireUser(event);
    const supabase = supabaseAdmin();

    const { data: artistProfile, error } = await supabase
      .from('artist_payout_accounts')
      .select('stripe_account_id')
      .eq('user_id', user.id)
      .single();

    if (error || !artistProfile || !artistProfile.stripe_account_id) {
      return json(200, { ready: false, status: 'not_started' });
    }

    const account = await stripe().accounts.retrieve(artistProfile.stripe_account_id);
    const chargesEnabled = !!account.charges_enabled;
    const payoutsEnabled = !!account.payouts_enabled;
    const detailsSubmitted = !!account.details_submitted;
    const transfersReady = account.capabilities && account.capabilities.transfers === 'active';
    const ready = chargesEnabled && payoutsEnabled && detailsSubmitted && transfersReady;

    await supabase.from('artist_payout_accounts').upsert({
      user_id: user.id,
      stripe_details_submitted: detailsSubmitted,
      stripe_payouts_enabled: payoutsEnabled,
      stripe_charges_enabled: chargesEnabled,
      onboarding_status: ready ? 'ready' : 'needs_more'
    });

    return json(200, {
      ready,
      status: ready ? 'ready' : 'needs_more',
      detailsSubmitted,
      payoutsEnabled,
      chargesEnabled
    });
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 500, { error: stripeError(error) });
  }
};
