# The Art Department V3

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
- edit, pause, and remove listings
- request assignment and artist decline/rematch flow
- reviews and ratings
- reports and support tickets
- basic Terms, Privacy, and Refund policy pages
- Stripe Connect onboarding
- Stripe Checkout for listing purchases
- 5% platform fee
- Stripe webhook support
- protected original files with watermarked public previews
- artist profile completion checklist
- better portfolio controls
- easier customer reviews

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
5. If this is an existing V3 database, also run:

`supabase/qol-upgrades.sql`

This adds the newer QOL features without deleting existing accounts, listings, orders, or artist profiles.

6. Then run:

`supabase/watermark-upgrade.sql`

This adds protected original uploads, public watermarked previews, and a private `listing-originals` storage bucket. It does not delete existing accounts, listings, orders, or artist profiles.

7. Then run:

`supabase/profile-qol-upgrade.sql`

This adds featured portfolio pieces, portfolio tags, and manual portfolio ordering. It does not delete existing data.

8. Go to Supabase Project Settings > API.
9. Copy:

`Project URL`

`anon public key`

`service_role key`

Do not put the service role key anywhere public.

## Supabase Email Verification

In Supabase, open Authentication > URL Configuration.

Set the Site URL to your live Netlify site, like:

`https://your-site-name.netlify.app`

Add this Redirect URL too:

`https://your-site-name.netlify.app/*`

If verification emails are inconsistent, set up a custom SMTP sender in Supabase Authentication email settings. The built-in email sender is okay for testing, but a real sender is better before inviting real users.

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

`STRIPE_PROCESSING_PERCENT`

Optional. Leave it blank to use `2.9`.

`STRIPE_PROCESSING_FIXED_CENTS`

Optional. Leave it blank to use `30`.

`SITE_URL`

Your live Netlify site URL, like:

`https://your-site-name.netlify.app`

If Stripe checkout sends buyers back to an older version of the site, this value is probably old. Update `SITE_URL`, redeploy, and make sure you are buying from the current live domain.

Checkout now separates the artist price, The Art Department platform fee, and payment processing. Example: on a $100 listing, the customer pays about $100 to the artist, $5 platform fee, and a processing coverage line. The artist still receives the listed price, and the platform should net about 5% after Stripe takes its processing fee. Different cards and payment methods can have different Stripe costs, so adjust the optional processing variables if needed.

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

If a buyer pays but the order stays pending, open Stripe Dashboard > Developers > Webhooks > your endpoint > Event deliveries. Successful deliveries should show a 200 response.

The app also checks Stripe again when the buyer returns from checkout, so most card payments should update immediately even if the webhook is delayed.

There is also a `Sync Stripe payments` button on order and sales tables. Use it if an older pending order needs the site to re-check Stripe.

If someone starts checkout twice, the unpaid abandoned copy is automatically cancelled after the paid copy is confirmed.

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

After checkout returns to the site, Dashboard > Orders should show the order as paid. The artist's real bank payout can still take days, especially for a first Stripe payout.

## Important

Customers do not see artist tools or admin analytics.

Artists see only their own profile, portfolio, listings, sales, requests, and payout status.

Admins see platform-wide users, listings, orders, requests, and revenue.

For new listing uploads, shoppers see a watermarked preview. After a paid digital order, the customer gets a short-lived secure download link for the clean original. Older listings that were created from public image URLs still work, but they are not as protected unless the artist edits the listing and uploads the artwork file.

Artists also get a profile completion checklist, public profile preview button, portfolio featuring/reordering/deleting, and clearer review prompts for customers.

This version is the right foundation for the real marketplace.
