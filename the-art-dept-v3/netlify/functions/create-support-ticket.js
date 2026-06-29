const { getUserFromEvent, json, parseBody, supabaseAdmin } = require('./_supabase');

function clean(value) {
  return String(value || '').trim();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });

  try {
    const body = parseBody(event);
    const name = clean(body.name);
    const email = clean(body.email).toLowerCase();
    const subject = clean(body.subject);
    const message = clean(body.message);

    if (!name || !email || !subject || !message) {
      return json(400, { error: 'Name, email, subject, and message are required.' });
    }

    const { user } = await getUserFromEvent(event);
    const supabase = supabaseAdmin();
    const { data, error } = await supabase.from('support_tickets').insert({
      customer_id: user ? user.id : null,
      name,
      email,
      subject,
      message,
      status: 'open'
    }).select('id').single();

    if (error) {
      const missingSetup = /relation|support_tickets|schema|does not exist/i.test(error.message || '');
      return json(500, {
        error: missingSetup
          ? 'Support tickets are not set up yet. Run supabase/qol-upgrades.sql in Supabase.'
          : error.message || 'Support ticket could not be saved.'
      });
    }

    return json(200, { id: data.id });
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 500, { error: error.message || 'Support ticket could not be saved.' });
  }
};
