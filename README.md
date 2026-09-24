# Store

A static Hugo storefront with an on-site cart and Stripe Checkout, deployed on
Cloudflare Pages. The only backend code is one Pages Function
(`functions/api/checkout.js`) that turns the cart into a Stripe Checkout
Session — Stripe hosts the actual payment page, so no card data ever touches
this site.

## Structure

- `content/products/*.md` — one file per product (title, price, Stripe price ID, image)
- `content/about.md` — the About Us page
- `static/js/cart.js` — cart stored in `localStorage`, rendered as a slide-out drawer
- `functions/api/checkout.js` — Cloudflare Pages Function: `POST /api/checkout` → Stripe Checkout URL
- `functions/api/webhook.js` — Cloudflare Pages Function: verifies Stripe webhook signatures and emails order confirmations
- `content/privacy.md`, `content/terms.md`, `content/shipping-returns.md` — legal/policy pages
- `layouts/` — all templates (no theme dependency)

## Local preview

```sh
hugo server
```

The site works fully except checkout (which needs the Pages Function). To run
functions locally too:

```sh
cp .dev.vars.example .dev.vars   # then fill in your keys (see the file)
hugo && npx wrangler pages dev public
```

## Adding a product

1. In the Stripe dashboard, create a Product with a Price; copy the price ID (`price_...`).
2. Add `content/products/my-product.md`:

   ```markdown
   ---
   title: My Product
   price: 25.00            # display price — billing always uses the Stripe price ID
   stripe_price_id: price_XXXX
   image: /images/my-product.jpg
   ---

   Description goes here.
   ```

3. Drop the image in `static/images/`.

The three `sample-*.md` products have placeholder price IDs — replace or delete
them before going live.

## Deploying (Cloudflare Pages)

1. Push this repo to GitHub.
2. In Cloudflare Pages, create a project from the repo with:
   - Build command: `hugo`
   - Output directory: `public`
   - Environment variable `HUGO_VERSION` = your local version (see `hugo version`)
3. Add environment variables (Settings → Environment variables):

   | Variable | Value |
   |---|---|
   | `STRIPE_SECRET_KEY` | Your Stripe key — test key (`sk_test_...`) until you've placed a successful test order (card `4242 4242 4242 4242`), then the live key |
   | `STRIPE_WEBHOOK_SECRET` | Webhook signing secret from Stripe Dashboard → Webhooks |
   | `RESEND_API_KEY` | Resend API key (email delivery) |
   | `FROM_EMAIL` | Verified sender, e.g. `Computer Cobbler <support@computercobbler.net>` |
   | `CONTACT_EMAIL` | Your contact email, shown in order emails |
4. Set `baseURL` in `hugo.toml` to your real domain.

The `functions/` directory is picked up automatically — no extra config.

## Order emails

When a payment completes, Stripe sends a `checkout.session.completed` event to
`POST /api/webhook`. The function verifies the signature, then emails the
customer a confirmation via [Resend](https://resend.com).

The contact email lives in two places because the site (Hugo) and the function
(Cloudflare) are separate runtimes: `contactEmail` in `hugo.toml`, and the
`CONTACT_EMAIL` environment variable for the function.

To set it up:

1. Create a Resend account and verify your sending domain (`computercobbler.net`).
2. In the Stripe dashboard, add a webhook endpoint pointing at
   `https://<your-pages-domain>/api/webhook` (or your custom domain) and
   subscribe to `checkout.session.completed`. Copy the signing secret.
3. Set the environment variables listed in the Deploying section.
4. Configure shipping in Stripe (Dashboard → Settings → Shipping) so Checkout
   collects the customer's address — required to fulfill physical orders.

For local testing, run `stripe listen --forward-to localhost:8788/api/webhook`
and set `STRIPE_WEBHOOK_SECRET` to the printed `whsec_...` secret.
