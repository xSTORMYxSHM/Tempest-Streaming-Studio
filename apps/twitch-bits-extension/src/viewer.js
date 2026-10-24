(() => {
  'use strict';

  const defaultPanelDesign = { schemaVersion: 1, preset: 'tempest', brandName: 'TEMPEST STREAMING', eyebrow: 'LIVE CONTROL NODE', title: 'Shape the stream', accent: '#54F2EB', background: '#04080D', surface: '#07121B', text: '#EDFAFF', muted: '#89A3AD', font: 'inter', cardLayout: 'grid', density: 'comfortable', cornerRadius: 14, showLogo: true, showStatus: true, showSearch: true, showFilters: true, showPattern: true, uppercaseLabels: true };
  const defaultTwitchPreferences = { schemaVersion: 1, dock: 'left', startExpanded: false, showActionCount: true };
  const state = { auth: null, config: null, actions: [], busyAction: '', placementAction: '', studioConnected: false, expanded: document.body.dataset.surface !== 'overlay', twitchPreferences: defaultTwitchPreferences };
  let catalogEtag = '';
  let catalogRefreshPromise = null;
  let catalogRefreshPending = false;
  const avatarControlIds = new Set(['tempest.avatar.left', 'tempest.avatar.right', 'tempest.avatar.jump', 'tempest.avatar.drop', 'tempest.avatar.interact', 'tempest.avatar.emote', 'tempest.avatar.unstuck']);
  const localMockRequested = ['127.0.0.1', 'localhost'].includes(location.hostname) && new URLSearchParams(location.search).get('mock') === '1';
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

  function normalizeTwitchPreferences(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      ...defaultTwitchPreferences,
      dock: source.dock === 'right' ? 'right' : 'left',
      startExpanded: source.startExpanded === true,
      showActionCount: source.showActionCount !== false
    };
  }

  function applyTwitchPreferences(value) {
    const preferences = normalizeTwitchPreferences(value);
    state.twitchPreferences = preferences;
    document.body.classList.toggle('overlay-dock-right', preferences.dock === 'right');
    document.body.classList.toggle('hide-action-count', !preferences.showActionCount);
    if (document.body.dataset.surface === 'overlay') state.expanded = preferences.startExpanded;
    render();
  }

  function readTwitchPreferences() {
    const content = window.Twitch?.ext?.configuration?.broadcaster?.content;
    if (!content) return defaultTwitchPreferences;
    try { return normalizeTwitchPreferences(JSON.parse(content)); } catch { return defaultTwitchPreferences; }
  }

  function normalizePanelDesign(value) {
    const source = value && typeof value === 'object' ? value : {};
    const color = (candidate, fallback) => /^#[0-9a-f]{6}$/i.test(String(candidate || '')) ? String(candidate).toUpperCase() : fallback;
    const clean = (candidate, fallback, maximum) => String(candidate || '').trim().replace(/[\r\n\0]+/g, ' ').slice(0, maximum) || fallback;
    const choice = (candidate, values, fallback) => values.includes(candidate) ? candidate : fallback;
    const radius = Number(source.cornerRadius);
    return {
      ...defaultPanelDesign,
      preset: choice(source.preset, ['tempest', 'minimal', 'neon', 'soft'], defaultPanelDesign.preset),
      brandName: clean(source.brandName, defaultPanelDesign.brandName, 36),
      eyebrow: clean(source.eyebrow, defaultPanelDesign.eyebrow, 48),
      title: clean(source.title, defaultPanelDesign.title, 48),
      accent: color(source.accent, defaultPanelDesign.accent),
      background: color(source.background, defaultPanelDesign.background),
      surface: color(source.surface, defaultPanelDesign.surface),
      text: color(source.text, defaultPanelDesign.text),
      muted: color(source.muted, defaultPanelDesign.muted),
      font: choice(source.font, ['inter', 'system', 'condensed', 'serif'], defaultPanelDesign.font),
      cardLayout: choice(source.cardLayout, ['grid', 'list'], defaultPanelDesign.cardLayout),
      density: choice(source.density, ['comfortable', 'compact'], defaultPanelDesign.density),
      cornerRadius: Number.isFinite(radius) ? Math.min(24, Math.max(0, radius)) : defaultPanelDesign.cornerRadius,
      showLogo: source.showLogo !== false,
      showStatus: source.showStatus !== false,
      showPattern: source.showPattern !== false,
      uppercaseLabels: source.uppercaseLabels !== false
    };
  }

  function applyPanelDesign(value) {
    const design = normalizePanelDesign(value);
    const root = document.documentElement;
    const fonts = { inter: 'Inter, ui-sans-serif, system-ui, sans-serif', system: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif', condensed: 'Impact, Haettenschweiler, Arial Narrow Bold, sans-serif', serif: 'Georgia, Times New Roman, serif' };
    root.style.setProperty('--cyan', design.accent);
    root.style.setProperty('--ink', design.background);
    root.style.setProperty('--panel', design.surface);
    root.style.setProperty('--panel-2', design.surface);
    root.style.setProperty('--text', design.text);
    root.style.setProperty('--muted', design.muted);
    root.style.setProperty('--panel-radius', `${design.cornerRadius}px`);
    root.style.setProperty('--font-stack', fonts[design.font] || fonts.inter);
    document.body.dataset.preset = design.preset;
    document.body.classList.toggle('panel-layout-list', design.cardLayout === 'list');
    document.body.classList.toggle('panel-density-compact', design.density === 'compact');
    document.body.classList.toggle('panel-no-pattern', !design.showPattern);
    document.body.classList.toggle('panel-uppercase', design.uppercaseLabels);
    let logo = $('#panelLogo');
    if (!logo) {
      logo = document.createElement('span');
      logo.id = 'panelLogo';
      logo.className = 'brand-mark';
      logo.setAttribute('aria-hidden', 'true');
      logo.textContent = 'TS';
      $('.brand').before(logo);
    }
    logo.hidden = !design.showLogo;
    $('.brand strong').textContent = design.brandName;
    $('.intro .eyebrow').textContent = design.eyebrow;
    $('.intro h1').textContent = design.title;
    $('#statusDot').hidden = !design.showStatus;
    $('#statusLabel').hidden = !design.showStatus;
    state.config = { ...(state.config || {}), panelDesign: design };
  }

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

  function createRequestId() {
    return globalThis.crypto?.randomUUID?.() || `streaming-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function render() {
    document.body.classList.toggle('expanded', state.expanded);
    $('#toggleDeck').setAttribute('aria-expanded', String(state.expanded));
    $('#productCount').textContent = `${state.actions.length} ACTION${state.actions.length === 1 ? '' : 'S'}`;
    let controls = $('#avatarControls');
    if (!controls) {
      controls = document.createElement('section');
      controls.id = 'avatarControls';
      controls.className = 'avatar-controls';
      controls.innerHTML = '<div><span class="eyebrow">MY STREAMWORLD PLAYER</span><strong>Live controls</strong></div><div id="avatarControlPad" class="avatar-control-pad"></div>';
      $('#productGrid').before(controls);
      controls.addEventListener('click', (event) => { const button = event.target.closest('[data-action]'); if (button) void activate(button.dataset.action); });
    }
    const avatarActions = state.actions.filter((action) => avatarControlIds.has(action.id));
    controls.hidden = avatarActions.length === 0;
    $('#avatarControlPad').innerHTML = avatarActions.map((action) => `<button type="button" data-action="${escapeHtml(action.id)}" title="${escapeHtml(action.name)}" style="--product-accent:${escapeHtml(action.accent || '#54F2EB')}" ${state.busyAction || !state.studioConnected ? 'disabled' : ''}><span>${escapeHtml(action.glyph || 'GO')}</span><small>${escapeHtml(action.name.replace('Avatar ', '').replace('Move ', ''))}</small></button>`).join('');
    const catalogActions = state.actions.filter((action) => !avatarControlIds.has(action.id));
    $('#productGrid').innerHTML = catalogActions.map((action) => `<button class="product" type="button" data-action="${escapeHtml(action.id)}" style="--product-accent:${escapeHtml(action.accent || '#54F2EB')}" ${state.busyAction || !state.studioConnected ? 'disabled' : ''}>
      <span class="glyph">${escapeHtml(action.glyph || 'FX')}</span>
      <span class="product-copy"><strong>${escapeHtml(action.name)}</strong><small>${escapeHtml(String(action.category || 'other').replaceAll('-', ' ').toUpperCase())}${action.placementMode === 'viewer' ? ' · PLACE IT' : ''} · FREE ACTION</small></span>
      <span class="activate">${state.busyAction === action.id ? 'WAIT' : 'ACTIVATE'}</span>
    </button>`).join('');
    $('#emptyState').hidden = state.actions.length !== 0;
  }

  async function readConfiguration() {
    const response = await fetch('runtime-config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Runtime configuration is unavailable.');
    const config = await response.json();
    if (config.schemaVersion !== 1) throw new Error('Runtime configuration version is unsupported.');
    return { ...config, panelDesign: normalizePanelDesign(config.panelDesign) };
  }

  async function loadMockCatalog() {
    const catalog = await fetch('mock-catalog.json', { cache: 'no-store' }).then((response) => response.json());
    state.actions = Array.isArray(catalog) ? catalog.filter((action) => action.destinations?.includes('streaming')) : [];
    state.studioConnected = true;
    setStatus('SAFE PREVIEW', true);
    $('#viewerState').textContent = 'Preview actions do not send anything to Studio';
    render();
  }

  async function refreshCatalogOnce() {
    if (!state.auth || !state.config?.ebsBaseUrl) return;
    const authToken = state.auth.token;
    const response = await fetchWithTimeout(`${state.config.ebsBaseUrl}/v1/extension/streaming/catalog`, { headers: { 'X-Extension-JWT': authToken, ...(catalogEtag ? { 'If-None-Match': catalogEtag } : {}) }, cache: 'no-store' });
    if (state.auth?.token !== authToken) return;
    if (response.status === 304) return;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'The Tempest Streaming catalog is unavailable.');
    catalogEtag = response.headers.get('ETag') || '';
    if (body.panelDesign && typeof body.panelDesign === 'object') applyPanelDesign(body.panelDesign);
    state.actions = Array.isArray(body.items) ? body.items : [];
    state.studioConnected = Boolean(body.studioConnected);
    setStatus(state.studioConnected ? 'STUDIO ONLINE' : 'STUDIO OFFLINE', state.studioConnected);
    $('#viewerState').textContent = state.studioConnected ? 'Choose a free action to send it to the stream' : 'The creator must open Tempest Streaming Studio';
    render();
  }

  async function refreshCatalog() {
    if (catalogRefreshPromise) {
      catalogRefreshPending = true;
      return catalogRefreshPromise;
    }
    catalogRefreshPromise = (async () => {
      do {
        catalogRefreshPending = false;
        await refreshCatalogOnce();
      } while (catalogRefreshPending);
    })();
    try {
      await catalogRefreshPromise;
    } finally {
      catalogRefreshPromise = null;
    }
  }

  async function triggerAction(action, placement) {
    if (!state.studioConnected) return notice('Tempest Streaming Studio must be online before an action can start.', true);
    if (!window.Twitch?.ext || state.config.mockMode || !state.auth) {
      state.busyAction = action.id;
      render();
      await new Promise((resolve) => setTimeout(resolve, 400));
      state.busyAction = '';
      render();
      return notice(`${action.name} preview activated.`);
    }
    state.busyAction = action.id;
    render();
    try {
      const requestId = createRequestId();
      const response = await fetchWithTimeout(`${state.config.ebsBaseUrl}/v1/extension/streaming/interactions/${encodeURIComponent(action.id)}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': state.auth.token, 'X-Request-ID': requestId },
        body: JSON.stringify({ requestId, ...(placement ? { placement } : {}) })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Action failed (${response.status}).`);
      notice(`${action.name} accepted by Studio.`);
      $('#activity').textContent = `${action.name} sent to the live queue`;
    } catch (error) {
      notice(error.message || 'Studio could not accept the action.', true);
      $('#activity').textContent = 'Studio could not accept the action';
    } finally {
      state.busyAction = '';
      render();
      void refreshCatalog().catch(() => undefined);
    }
  }

  function beginPlacement(action) {
    state.placementAction = action.id;
    const layer = $('#placementLayer');
    layer.hidden = false;
    layer.focus();
  }

  function cancelPlacement() {
    state.placementAction = '';
    $('#placementLayer').hidden = true;
  }

  async function activate(id) {
    if (state.busyAction) return;
    const action = state.actions.find((entry) => entry.id === id);
    if (!action) return;
    if (action.placementMode === 'viewer') return beginPlacement(action);
    await triggerAction(action);
  }

  function bindTwitch() {
    if (!window.Twitch?.ext) return void loadMockCatalog();
    window.Twitch.ext.configuration.onChanged(() => applyTwitchPreferences(readTwitchPreferences()));
    window.Twitch.ext.onAuthorized((auth) => {
      state.auth = auth;
      catalogEtag = '';
      void refreshCatalog().catch((error) => { setStatus('PAIRING REQUIRED'); notice(error.message, true); });
    });
    window.Twitch.ext.onError(() => setStatus('TWITCH LINK ERROR'));
  }

  $('#toggleDeck').addEventListener('click', () => { state.expanded = !state.expanded; render(); });
  $('#productGrid').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (button) void activate(button.dataset.action);
  });
  const placementLayer = document.createElement('button');
  placementLayer.id = 'placementLayer';
  placementLayer.className = 'placement-layer';
  placementLayer.type = 'button';
  placementLayer.hidden = true;
  placementLayer.innerHTML = '<span>PLACE ACTION</span><strong>Click or tap where it should appear</strong><small>Press Escape to cancel</small>';
  placementLayer.addEventListener('click', (event) => {
    const action = state.actions.find((entry) => entry.id === state.placementAction);
    if (!action) return cancelPlacement();
    const rect = placementLayer.getBoundingClientRect();
    const placement = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
    cancelPlacement();
    void triggerAction(action, placement);
  });
  document.body.appendChild(placementLayer);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && state.placementAction) cancelPlacement(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.auth && !state.busyAction && !state.placementAction) void refreshCatalog().catch(() => undefined);
  });

  void readConfiguration().then((config) => {
    state.config = config;
    applyPanelDesign(config.panelDesign);
    if (config.mockMode || localMockRequested) return loadMockCatalog();
    bindTwitch();
  }).catch((error) => { setStatus('CONFIGURATION ERROR'); notice(error.message, true); });
  setInterval(() => { if (!document.hidden && state.auth && !state.busyAction && !state.placementAction) void refreshCatalog().catch(() => undefined); }, 10000);
})();
