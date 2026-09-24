// Cloudflare Pages Function: POST /api/webhook
//
// Receives Stripe webhook events, verifies the `Stripe-Signature` header, and
// on `checkout.session.completed` sends the customer an order confirmation
// email via Resend. Card details never touch this function.
//
// Required environment variables:
//   STRIPE_WEBHOOK_SECRET — signing secret from Stripe Dashboard → Webhooks
//   STRIPE_SECRET_KEY     — used to fetch line items for the email
//   RESEND_API_KEY        — Resend API key (resend.com)
//   FROM_EMAIL            — verified sender, e.g. "Computer Cobbler <support@computercobbler.net>"
// Optional:
//   CONTACT_EMAIL         — contact address shown in the email (falls back to the address in FROM_EMAIL)

const TOLERANCE_SECONDS = 300;

export async function onRequestPost({ request, env }) {
  const signature = request.headers.get('stripe-signature');
  const payload = await request.text();

  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    return json({ error: 'Webhook not configured' }, 500);
  }

  if (!signature || !(await verifySignature(payload, signature, env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: 'Invalid signature' }, 401);
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ error: 'Invalid payload' }, 400);
  }

  if (event.type === 'checkout.session.completed') {
    try {
      await handleCompletedCheckout(event.data.object, env);
    } catch (err) {
      console.error('Failed to handle completed checkout:', err);
      return json({ error: 'Order handling failed' }, 500);
    }
  }

  return json({ received: true });
}

async function handleCompletedCheckout(session, env) {
  if (session.payment_status !== 'paid') return;

  const email = session.customer_details?.email || session.customer_email;
  if (!email) {
    console.error(`No customer email on session ${session.id}`);
    return;
  }

  const items = await fetchLineItems(session.id, env.STRIPE_SECRET_KEY);

  await sendOrderEmail(env, {
    to: email,
    orderId: session.payment_intent || session.id,
    total: session.amount_total,
    currency: session.currency,
    items,
  });
}

async function fetchLineItems(sessionId, secretKey) {
  const res = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${sessionId}/line_items?limit=100`,
    { headers: { Authorization: `Bearer ${secretKey}` } }
  );
  if (!res.ok) {
    throw new Error(`Stripe line_items request failed: ${res.status}`);
  }
  const body = await res.json();
  return body.data;
}

async function sendOrderEmail(env, { to, orderId, total, currency, items }) {
  if (!env.RESEND_API_KEY || !env.FROM_EMAIL) {
    throw new Error('RESEND_API_KEY or FROM_EMAIL is not set');
  }

  const contactEmail = env.CONTACT_EMAIL || extractEmail(env.FROM_EMAIL);
  const itemRows = items
    .map((item) => {
      const label = escapeHtml(item.description || 'Item');
      return `<tr><td>${item.quantity} × ${label}</td><td style="text-align:right">${formatMoney(item.amount_total, currency)}</td></tr>`;
    })
    .join('');

  const html = `
    <p>Thanks for your order!</p>
    <p><strong>Order:</strong> ${escapeHtml(orderId)}</p>
    <table style="border-collapse:collapse;margin:1rem 0">
      <tbody>${itemRows}</tbody>
    </table>
    <p><strong>Total:</strong> ${formatMoney(total, currency)}</p>
    <p>Your order ships the next business day. We'll email your tracking number as soon as it's on its way.</p>
    <p>Questions or need a refund? Email us at <a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>.</p>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to,
      subject: `Your order ${orderId}`,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend request failed: ${res.status} ${text}`);
  }
}

async function verifySignature(payload, signature, secret) {
  const parts = signature.split(',').map((s) => s.trim());
  const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2);
  const given = parts.find((p) => p.startsWith('v1='))?.slice(3);
  if (!timestamp || !given) return false;

  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > TOLERANCE_SECONDS) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`)
  );
  const expected = toHex(new Uint8Array(signatureBytes));
  return timingSafeEqual(expected, given);
}

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractEmail(from) {
  const match = String(from || '').match(/<([^>]+)>/);
  return match ? match[1] : from;
}

function formatMoney(cents, currency) {
  const symbol = String(currency).toLowerCase() === 'usd' ? '$' : '';
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
