(() => {
  'use strict';

  const state = { auth: null, config: null, products: [], twitchProducts: [], twitchProductsLoadedAt: 0, permitted: new Map(), reservations: new Map(), busySku: '', placementSku: '', studioConnected: false, expanded: document.body.dataset.surface !== 'overlay' };
  let catalogEtag = '';
  let productRefreshPromise = null;
  let productRefreshPending = false;
  let productRefreshForce = false;
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

  async function fetchWithTimeout(input, init = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Tempest Signal did not respond in time.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function setStatus(label, online = false) {
    $('#statusLabel').textContent = label;
    $('#statusDot').classList.toggle('online', online);
  }

  function notice(message, error = false) {
    const element = $('#notice');
    element.textContent = message;
    element.classList.toggle('error', error);
    element.hidden = false;
    clearTimeout(notice.timer);
    notice.timer = setTimeout(() => { element.hidden = true; }, 5000);
  }

  function productView(product) {
    const server = state.permitted.get(product.sku);
    const interaction = server?.interaction || product.interaction || {};
    return {
      ...product,
      displayName: String(product.displayName || interaction.name || product.sku).slice(0, 80),
      accent: /^#[0-9a-f]{6}$/i.test(interaction.accent) ? interaction.accent : '#54F2EB',
      glyph: /^[A-Z0-9]{1,4}$/.test(interaction.glyph || '') ? interaction.glyph : 'FX',
      amount: Number(product.cost?.amount || server?.bits || 0),
      category: String(interaction.category || 'other').replaceAll('-', ' '),
      placementMode: interaction.placementMode === 'viewer' ? 'viewer' : 'fixed',
      eligibility: server?.eligibility || { allowed: true, retryAfterMs: 0 }
    };
  }

  function render() {
    document.body.classList.toggle('expanded', state.expanded);
    $('#toggleDeck').setAttribute('aria-expanded', String(state.expanded));
    const products = state.products.map(productView).filter((product) => product.amount > 0);
    $('#productCount').textContent = `${products.length} SIGNAL${products.length === 1 ? '' : 'S'}`;
    $('#productGrid').innerHTML = products.map((product) => `<button class="product ${product.eligibility.allowed ? '' : 'locked'}" type="button" data-sku="${escapeHtml(product.sku)}" style="--product-accent:${escapeHtml(product.accent)}" ${state.busySku || !state.studioConnected || !product.eligibility.allowed ? 'disabled' : ''}>
      <span class="glyph">${escapeHtml(product.glyph)}</span>
      <span class="product-copy"><strong>${escapeHtml(product.displayName)}</strong><small>${escapeHtml(product.category.toUpperCase())}${product.placementMode === 'viewer' ? ' · PLACE IT' : ''} · USE ${product.amount.toLocaleString()} BITS</small>${product.eligibility.allowed ? '' : `<em>${escapeHtml(product.eligibility.reason || 'LOCKED')}</em>`}</span>
      <span class="activate">${state.busySku === product.sku ? 'WAIT' : product.eligibility.allowed ? 'ACTIVATE' : 'LOCKED'}</span>
    </button>`).join('');
    $('#emptyState').hidden = products.length !== 0;
  }

  async function readConfiguration() {
    const response = await fetch('runtime-config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Runtime configuration is unavailable.');
    const config = await response.json();
    if (config.schemaVersion !== 1) throw new Error('Runtime configuration version is unsupported.');
    return config;
  }

  async function loadMockProducts() {
    state.products = await fetch('mock-products.json', { cache: 'no-store' }).then((response) => response.json());
    state.permitted = new Map(state.products.map((product) => [product.sku, product]));
    state.studioConnected = true;
    setStatus('SAFE PREVIEW', true);
    $('#viewerState').textContent = 'No Bits are used in preview';
    render();
  }

  async function loadTwitchProducts(force = false) {
    if (!force && state.twitchProductsLoadedAt && Date.now() - state.twitchProductsLoadedAt < 60_000) return state.twitchProducts;
    const products = await window.Twitch.ext.bits.getProducts();
    state.twitchProducts = Array.isArray(products) ? products : [];
    state.twitchProductsLoadedAt = Date.now();
    return state.twitchProducts;
  }

  async function refreshProductsOnce(forceTwitchProducts = false) {
    if (!state.auth || !state.config?.ebsBaseUrl) return;
    const authToken = state.auth.token;
    const features = window.Twitch.ext.features;
    if (!features?.isBitsEnabled) {
      state.products = [];
      setStatus('BITS UNAVAILABLE');
      $('#viewerState').textContent = 'Bits are not enabled for this viewer or channel';
      render();
      return;
    }
    const [twitchProducts, serverResponse] = await Promise.all([
      loadTwitchProducts(forceTwitchProducts),
      fetchWithTimeout(`${state.config.ebsBaseUrl}/v1/extension/bits/catalog`, { headers: { 'X-Extension-JWT': authToken, ...(catalogEtag ? { 'If-None-Match': catalogEtag } : {}) }, cache: 'no-store' })
    ]);
    if (state.auth?.token !== authToken) return;
    if (serverResponse.status === 304) {
      state.products = twitchProducts.filter((product) => {
        const configured = state.permitted.get(product.sku);
        return configured && Number(product.cost?.amount) === Number(configured.bits) && product.cost?.type === 'bits';
      });
      render();
      return;
    }
    const serverBody = await serverResponse.json().catch(() => ({}));
    if (!serverResponse.ok) throw new Error(serverBody.error || 'The Tempest Bits catalog is unavailable.');
    catalogEtag = serverResponse.headers.get('ETag') || '';
    state.permitted = new Map((serverBody.products || []).map((product) => [product.sku, product]));
    state.products = (Array.isArray(twitchProducts) ? twitchProducts : []).filter((product) => {
      const configured = state.permitted.get(product.sku);
      return configured && Number(product.cost?.amount) === Number(configured.bits) && product.cost?.type === 'bits';
    });
    state.studioConnected = Boolean(serverBody.studioConnected);
    setStatus(state.studioConnected ? 'STUDIO ONLINE' : 'STUDIO OFFLINE', state.studioConnected);
    $('#viewerState').textContent = serverBody.studioConnected ? 'Select a signal to activate it on stream' : 'The creator must open Tempest Streaming Studio';
    render();
  }

  async function refreshProducts(forceTwitchProducts = false) {
    productRefreshForce ||= forceTwitchProducts;
    if (productRefreshPromise) {
      productRefreshPending = true;
      return productRefreshPromise;
    }
    productRefreshPromise = (async () => {
      do {
        productRefreshPending = false;
        const force = productRefreshForce;
        productRefreshForce = false;
        await refreshProductsOnce(force);
      } while (productRefreshPending);
    })();
    try {
      await productRefreshPromise;
    } finally {
      productRefreshPromise = null;
    }
  }

  async function submitTransaction(transaction) {
    const receipt = String(transaction?.transactionReceipt || '');
    if (!receipt) throw new Error('Twitch did not provide a transaction receipt.');
    const sku = String(transaction?.product?.sku || state.busySku || '');
    const reservationToken = state.reservations.get(sku) || '';
    const response = await fetchWithTimeout(`${state.config.ebsBaseUrl}/v1/extension/bits/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': state.auth.token },
      body: JSON.stringify({ transactionReceipt: receipt, reservationToken })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Signal activation failed (${response.status}).`);
    return body;
  }

  async function reserveInteraction(sku, placement) {
    const response = await fetchWithTimeout(`${state.config.ebsBaseUrl}/v1/extension/bits/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': state.auth.token },
      body: JSON.stringify({ sku, ...(placement ? { placement } : {}) })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Interaction is unavailable (${response.status}).`);
    state.reservations.set(sku, body.reservationToken);
    return body;
  }

  function beginPlacement(sku) {
    state.placementSku = sku;
    const layer = $('#placementLayer');
    layer.hidden = false;
    layer.focus();
  }

  function cancelPlacement() {
    state.placementSku = '';
    $('#placementLayer').hidden = true;
  }

  async function startBitsFlow(product, placement) {
    state.busySku = product.sku;
    render();
    try {
      await reserveInteraction(product.sku, placement);
      window.Twitch.ext.bits.useBits(product.sku);
    } catch (error) {
      state.busySku = '';
      state.reservations.delete(product.sku);
      render();
      notice(error.message || 'Twitch could not start this Bits interaction.', true);
      void refreshProducts().catch(() => undefined);
    }
  }

  async function activate(sku) {
    if (state.busySku) return;
    const product = state.products.find((entry) => entry.sku === sku);
    if (!product) return;
    if (!state.studioConnected) return notice('Tempest Streaming Studio must be online before a Bits interaction can start.', true);
    if (!window.Twitch?.ext || state.config.mockMode || !state.auth) {
      state.busySku = sku;
      render();
      await new Promise((resolve) => setTimeout(resolve, 500));
      state.busySku = '';
      render();
      notice(`${product.displayName} preview activated. No Bits were used.`);
      return;
    }
    if (!window.Twitch.ext.features?.isBitsEnabled) return notice('Bits are not available for this viewer or channel.', true);
    if (!productView(product).eligibility.allowed) return notice(productView(product).eligibility.reason || 'This interaction is currently locked.', true);
    if (productView(product).placementMode === 'viewer') return beginPlacement(sku);
    await startBitsFlow(product);
  }

  function bindTwitch() {
    if (!window.Twitch?.ext) return void loadMockProducts();
    window.Twitch.ext.onAuthorized((auth) => {
      state.auth = auth;
      catalogEtag = '';
      state.twitchProductsLoadedAt = 0;
      void refreshProducts(true).catch((error) => { setStatus('PAIRING REQUIRED'); notice(error.message, true); });
    });
    window.Twitch.ext.features?.onChanged?.(() => {
      catalogEtag = '';
      state.twitchProductsLoadedAt = 0;
      void refreshProducts(true).catch((error) => notice(error.message, true));
    });
    window.Twitch.ext.bits.onTransactionComplete(async (transaction) => {
      const currentViewer = transaction?.initiator === 'current_user';
      $('#activity').textContent = currentViewer ? 'Confirming your signal…' : `${transaction?.product?.displayName || 'A signal'} activated on stream`;
      if (!currentViewer) return;
      try {
        await submitTransaction(transaction);
        notice(`${transaction.product?.displayName || 'Signal'} accepted by Studio.`);
        $('#activity').textContent = 'Signal accepted';
      } catch (error) {
        notice(error.message, true);
        $('#activity').textContent = 'Studio could not accept the signal';
      } finally {
        const sku = String(transaction?.product?.sku || state.busySku || '');
        state.reservations.delete(sku);
        state.busySku = '';
        render();
        void refreshProducts().catch(() => undefined);
      }
    });
    window.Twitch.ext.bits.onTransactionCancelled(() => {
      if (state.busySku) state.reservations.delete(state.busySku);
      state.busySku = '';
      render();
      notice('Bits interaction cancelled. No signal was sent.');
    });
    window.Twitch.ext.onError(() => setStatus('TWITCH LINK ERROR'));
  }

  $('#toggleDeck').addEventListener('click', () => { state.expanded = !state.expanded; render(); });
  $('#productGrid').addEventListener('click', (event) => {
    const button = event.target.closest('[data-sku]');
    if (button) void activate(button.dataset.sku);
  });
  const placementLayer = document.createElement('button');
  placementLayer.id = 'placementLayer';
  placementLayer.className = 'placement-layer';
  placementLayer.type = 'button';
  placementLayer.hidden = true;
  placementLayer.innerHTML = '<span>PLACE INTERACTION</span><strong>Click or tap where it should appear</strong><small>Press Escape to cancel</small>';
  placementLayer.addEventListener('click', (event) => {
    const sku = state.placementSku;
    const product = state.products.find((entry) => entry.sku === sku);
    if (!sku || !product) return cancelPlacement();
    const rect = placementLayer.getBoundingClientRect();
    const placement = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
    cancelPlacement();
    void startBitsFlow(product, placement);
  });
  document.body.appendChild(placementLayer);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && state.placementSku) cancelPlacement(); });

  void readConfiguration().then((config) => {
    state.config = config;
    if (config.mockMode) return loadMockProducts();
    bindTwitch();
  }).catch((error) => { setStatus('CONFIGURATION ERROR'); notice(error.message, true); });
  setInterval(() => { if (state.auth && !state.busySku && !state.placementSku) void refreshProducts().catch(() => undefined); }, 5000);
})();
