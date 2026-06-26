# The Art Dept Clean Restart

This is the clean redesigned restart version.

It does:

- public website
- artist browsing
- commission request form
- artist signup form
- instant artist listing posts with Stripe checkout
- public Store listings saved with Netlify Blobs
- Netlify Forms collection
- clean white layout with colorful marketplace sections
- Stripe onboarding and checkout

## Easiest deploy

You can deploy this version by dragging the folder into Netlify Drop:

`the-art-dept-clean-start`

Or put the folder in GitHub and connect it to Netlify.

## Netlify settings

If Netlify asks:

`Build command`

Leave it blank.

`Publish directory`

Use:

`public`

`Functions directory`

Use:

`netlify/functions`

If your Netlify project reads `netlify.toml`, it may fill this in automatically.

## Stripe test setup

In Netlify, add an environment variable:

`STRIPE_SECRET_KEY`

Use a Stripe test secret key first:

`sk_test_...`

After adding or changing it, redeploy the site.

Do not use a publishable key that starts with `pk_`.

## Artist applications

The artist application form uses Netlify Forms.

After deploy, go to your Netlify site dashboard and look for:

`Forms`

The artist form name should be:

`artist-application`

The customer commission form name should be:

`commission-request`

If you do not see them immediately, submit each form once on the live site, then refresh the Netlify Forms page.

## Artist listing posts

Artists can use the `Post` section to publish a listing directly to the Store.

This version uses Netlify Blobs through a Netlify Function:

`/.netlify/functions/listings`

Netlify should install the needed package automatically from `package.json`.

Artists must connect Stripe payouts first, then post the listing from the same browser.

Buyers click `Buy now`, pay through Stripe Checkout, and your 5% platform fee is included automatically.

For now, artists paste an image link. Real image uploads, artist logins, edit/delete buttons, delivery automation, and moderation can be added later.

If the live site says Netlify Blobs is not configured, add these two Netlify environment variables and redeploy:

`NETLIFY_BLOBS_SITE_ID`

Use your Netlify Project ID. In Netlify, go to:

`Project configuration > General > Project information`

`NETLIFY_BLOBS_TOKEN`

Use a Netlify Personal Access Token. In Netlify, go to:

`User settings > Applications > Personal access tokens`

## Testing order

1. Keep Stripe in test mode first.
2. Add the test secret key in Netlify.
3. Deploy this version.
4. Test one artist onboarding.
5. Post one test listing from the live site.
6. Refresh the Store and make sure it stays there.
7. Click Buy now and test checkout.
8. Only then switch to live payments.
