// Cloudflare Pages Function: POST /api/checkout
// Creates a Stripe Checkout Session from the cart and returns its URL.
// Requires the STRIPE_SECRET_KEY environment variable (set in the
// Cloudflare Pages dashboard, or in .dev.vars for local development).
//
// Prices are resolved server-side by Stripe from the price IDs, so the
// client-supplied display prices are never trusted for billing.

const MAX_ITEMS = 50;
const MAX_QUANTITY = 100;

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_SECRET_KEY) {
    return jsonResponse({ error: 'Payments are not configured' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid request' }, 400);
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0 || items.length > MAX_ITEMS) {
    return jsonResponse({ error: 'Invalid cart' }, 400);
  }

  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    mode: 'payment',
    success_url: `${origin}/success/`,
    cancel_url: `${origin}/cancel/`,
  });

  for (const [i, item] of items.entries()) {
    const quantity = Number(item.quantity);
    if (
      typeof item.priceId !== 'string' ||
      !item.priceId.startsWith('price_') ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QUANTITY
    ) {
      return jsonResponse({ error: 'Invalid cart item' }, 400);
    }
    params.set(`line_items[${i}][price]`, item.priceId);
    params.set(`line_items[${i}][quantity]`, String(quantity));
  }

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  const session = await stripeRes.json();
  if (!stripeRes.ok) {
    console.error('Stripe error:', session.error?.message);
    return jsonResponse({ error: 'Could not start checkout' }, 502);
  }

  return jsonResponse({ url: session.url });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
