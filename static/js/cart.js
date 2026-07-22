(function () {
  const STORAGE_KEY = 'cart';

  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    render(cart);
  }

  function addItem(priceId, name, price) {
    const cart = loadCart();
    const existing = cart.find((item) => item.priceId === priceId);
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({ priceId, name, price, quantity: 1 });
    }
    saveCart(cart);
    openDrawer();
  }

  function setQuantity(priceId, quantity) {
    let cart = loadCart();
    if (quantity <= 0) {
      cart = cart.filter((item) => item.priceId !== priceId);
    } else {
      const item = cart.find((i) => i.priceId === priceId);
      if (item) item.quantity = quantity;
    }
    saveCart(cart);
  }

  function formatMoney(amount) {
    return '$' + amount.toFixed(2);
  }

  function render(cart) {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const badge = document.getElementById('cart-count');
    badge.textContent = count;
    badge.hidden = count === 0;

    const list = document.getElementById('cart-items');
    list.innerHTML = '';
    cart.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'cart-item';

      const name = document.createElement('span');
      name.className = 'cart-item-name';
      name.textContent = item.name;

      const controls = document.createElement('span');
      controls.className = 'cart-item-controls';

      const minus = document.createElement('button');
      minus.textContent = '−';
      minus.setAttribute('aria-label', 'Decrease quantity of ' + item.name);
      minus.addEventListener('click', () => setQuantity(item.priceId, item.quantity - 1));

      const qty = document.createElement('span');
      qty.className = 'cart-item-qty';
      qty.textContent = item.quantity;

      const plus = document.createElement('button');
      plus.textContent = '+';
      plus.setAttribute('aria-label', 'Increase quantity of ' + item.name);
      plus.addEventListener('click', () => setQuantity(item.priceId, item.quantity + 1));

      const lineTotal = document.createElement('span');
      lineTotal.className = 'cart-item-total';
      lineTotal.textContent = formatMoney(item.price * item.quantity);

      controls.append(minus, qty, plus);
      li.append(name, controls, lineTotal);
      list.appendChild(li);
    });

    document.getElementById('cart-empty').hidden = cart.length > 0;
    document.getElementById('cart-total').textContent = formatMoney(total);
    document.getElementById('checkout-button').disabled = cart.length === 0;
  }

  function openDrawer() {
    document.getElementById('cart-drawer').classList.add('open');
    document.getElementById('cart-overlay').classList.add('open');
  }

  function closeDrawer() {
    document.getElementById('cart-drawer').classList.remove('open');
    document.getElementById('cart-overlay').classList.remove('open');
  }

  async function checkout() {
    const button = document.getElementById('checkout-button');
    const errorEl = document.getElementById('checkout-error');
    button.disabled = true;
    button.textContent = 'Redirecting…';
    errorEl.hidden = true;

    const items = loadCart().map((item) => ({
      priceId: item.priceId,
      quantity: item.quantity,
    }));

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Checkout failed');
      }
      window.location.href = data.url;
    } catch (err) {
      errorEl.textContent = err.message + ' — please try again.';
      errorEl.hidden = false;
      button.disabled = false;
      button.textContent = 'Checkout';
    }
  }

  document.addEventListener('click', (event) => {
    const addButton = event.target.closest('.add-to-cart');
    if (addButton) {
      addItem(
        addButton.dataset.priceId,
        addButton.dataset.name,
        parseFloat(addButton.dataset.price)
      );
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDrawer();
  });

  document.getElementById('cart-toggle').addEventListener('click', openDrawer);
  document.getElementById('cart-close').addEventListener('click', closeDrawer);
  document.getElementById('cart-overlay').addEventListener('click', closeDrawer);
  document.getElementById('checkout-button').addEventListener('click', checkout);

  if (window.location.pathname.startsWith('/success')) {
    localStorage.removeItem(STORAGE_KEY);
  }

  render(loadCart());
})();
