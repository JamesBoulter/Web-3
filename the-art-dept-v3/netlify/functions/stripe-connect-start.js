const { json, requireUser, supabaseAdmin } = require('./_supabase');
const { siteUrl, stripe, stripeError } = require('./_stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });

  try {
    const user = await requireUser(event);
    const supabase = supabaseAdmin();
    const stripeClient = stripe();
    const root = siteUrl(event);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, display_name, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) return json(404, { error: 'Profile was not found.' });
    if (profile.role !== 'artist' && profile.role !== 'admin') {
      return json(403, { error: 'Only artists can connect payouts.' });
    }

    const { data: artistRecord } = await supabase
      .from('artist_payout_accounts')
      .select('stripe_account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let accountId = artistRecord && artistRecord.stripe_account_id;
    if (!accountId) {
      const account = await stripeClient.accounts.create({
        type: 'express',
        email: profile.email,
        business_type: 'individual',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true }
        },
        business_profile: {
          name: profile.display_name,
          product_description: 'Custom art, commissions, digital downloads, and artist marketplace listings'
        },
        metadata: {
          user_id: user.id,
          platform: 'the-art-dept'
        }
      });
      accountId = account.id;

      await supabase.from('artist_payout_accounts').upsert({
        user_id: user.id,
        stripe_account_id: accountId,
        onboarding_status: 'started'
      });
    }

    const link = await stripeClient.accountLinks.create({
      account: accountId,
      refresh_url: root + '/?view=artist&stripe=refresh',
      return_url: root + '/?view=artist&stripe=return',
      type: 'account_onboarding'
    });

    return json(200, { url: link.url });
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 500, { error: stripeError(error) });
  }
};
