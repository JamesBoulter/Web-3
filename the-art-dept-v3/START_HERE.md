# The Art Dept V3

This is the real app version.

It includes:

- customer storefront
- sign up and sign in
- customer, artist, and admin roles
- public artist search
- artist profiles
- portfolio uploads
- artist listing posts
- customer commission requests
- customer order history
- artist dashboard
- admin dashboard
- Stripe Connect onboarding
- Stripe Checkout for listing purchases
- 5% platform fee
- Stripe webhook support

## What Changed From Version 2

Version 2 was a public website with forms and prototype checkout.

Version 3 is an app. It needs Supabase because accounts, roles, portfolios, listings, and orders need a real database.

## Deploy Settings

In Netlify:

`Build command`

Leave it blank.

`Publish directory`

Use:

`public`

`Functions directory`

Use:

`netlify/functions`

## Supabase Setup

1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Copy everything from:

`supabase/schema.sql`

4. Run it.
5. Go to Supabase Project Settings > API.
6. Copy:

`Project URL`

`anon public key`

`service_role key`

Do not put the service role key anywhere public.

## Netlify Environment Variables

In Netlify, add these environment variables:

`SUPABASE_URL`

Your Supabase Project URL.

`SUPABASE_ANON_KEY`

Your Supabase anon public key.

`SUPABASE_SERVICE_ROLE_KEY`

Your Supabase service role key.

`STRIPE_SECRET_KEY`

Your Stripe secret key. Use test mode first.

`PLATFORM_FEE_PERCENT`

Use:

`5`

`SITE_URL`

Your live Netlify site URL, like:

`https://your-site-name.netlify.app`

Later, after the Stripe webhook is created, add:

`STRIPE_WEBHOOK_SECRET`

## Make Yourself Admin

1. Deploy the site.
2. Create your account on the site.
3. In Supabase SQL Editor, run:

```sql
update public.profiles
set role = 'admin'
where email = 'YOUR_EMAIL_HERE';
```

Replace `YOUR_EMAIL_HERE` with your real email.

## Stripe Webhook

In Stripe Dashboard:

1. Go to Developers > Webhooks.
2. Add endpoint.
3. Endpoint URL:

`https://YOUR_SITE.netlify.app/.netlify/functions/stripe-webhook`

4. Listen for:

`checkout.session.completed`

5. Copy the signing secret.
6. Add it to Netlify as:

`STRIPE_WEBHOOK_SECRET`

7. Redeploy.

## Testing Order

1. Deploy V3.
2. Create your account.
3. Promote yourself to admin in Supabase.
4. Create an artist account.
5. Sign in as the artist.
6. Open Dashboard > Payouts.
7. Finish Stripe onboarding.
8. Check payout status.
9. Upload portfolio pieces.
10. Create a listing.
11. Open the site in a private browser.
12. Buy the listing with Stripe test card:

`4242 4242 4242 4242`

Use any future expiration date and any CVC.

## Important

Customers do not see artist tools or admin analytics.

Artists see only their own profile, portfolio, listings, sales, requests, and payout status.

Admins see platform-wide users, listings, orders, requests, and revenue.

This version is the right foundation for the real marketplace.
