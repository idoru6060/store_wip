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
- `layouts/` — all templates (no theme dependency)

## Local preview

```sh
hugo server
```

The site works fully except checkout (which needs the Pages Function). To run
functions locally too:

```sh
cp .dev.vars.example .dev.vars   # then paste in your Stripe TEST key
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
3. Add the secret `STRIPE_SECRET_KEY` (Settings → Environment variables). Use
   your test key until you've placed a successful test order (card
   `4242 4242 4242 4242`), then switch to the live key.
4. Set `baseURL` in `hugo.toml` to your real domain.

The `functions/` directory is picked up automatically — no extra config.
