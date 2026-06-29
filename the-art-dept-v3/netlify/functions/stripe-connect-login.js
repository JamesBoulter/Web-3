const { json, requireUser, supabaseAdmin } = require('./_supabase');
const { stripe, stripeError } = require('./_stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });

  try {
    const user = await requireUser(event);
    const supabase = supabaseAdmin();

    const { data: payoutAccount, error } = await supabase
      .from('artist_payout_accounts')
      .select('stripe_account_id')
      .eq('user_id', user.id)
      .single();

    if (error || !payoutAccount || !payoutAccount.stripe_account_id) {
      return json(400, { error: 'Start Stripe payout setup first.' });
    }

    const link = await stripe().accounts.createLoginLink(payoutAccount.stripe_account_id);
    return json(200, { url: link.url });
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 500, { error: stripeError(error) });
  }
};
