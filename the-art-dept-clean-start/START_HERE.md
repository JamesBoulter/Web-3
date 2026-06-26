# The Art Dept Clean Restart

This is the clean redesigned restart version.

It does:

- public website
- artist browsing
- commission request demo
- commission request form
- artist signup form
- Netlify Forms collection
- clean white layout with colorful marketplace sections

It does not connect Stripe yet.

That is intentional. Get the site live first, then add payments after the basic deploy works.

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

Leave it blank.

## Artist applications

The artist application form uses Netlify Forms.

After deploy, go to your Netlify site dashboard and look for:

`Forms`

The artist form name should be:

`artist-application`

The customer commission form name should be:

`commission-request`

If you do not see them immediately, submit each form once on the live site, then refresh the Netlify Forms page.

## After this works

Once the site is live and artist applications are showing up in Netlify Forms, then connect Stripe.

When we add Stripe later, do it in this order:

1. Keep Stripe in test mode first.
2. Add the test secret key in Netlify.
3. Test one artist onboarding.
4. Test one checkout.
5. Only then switch to live payments.
