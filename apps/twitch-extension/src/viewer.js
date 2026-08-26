(() => {
  'use strict';

  const storageKey = 'tempest-extension-configuration-v1';
  const defaultPanelDesign = { schemaVersion: 1, preset: 'tempest', brandName: 'TEMPEST STREAMING STUDIO', eyebrow: 'VIEWER CONTROL NODE', title: 'Signal deck', accent: '#54F2EB', background: '#05090E', surface: '#09131B', text: '#ECF9FF', muted: '#79919D', font: 'inter', cardLayout: 'grid', density: 'comfortable', cornerRadius: 10, showLogo: true, showStatus: true, showSearch: true, showFilters: true, showPattern: true, uppercaseLabels: true };
  const cooldowns = new Map();
  const state = { auth: null, alerts: [], configuration: { mockMode: true, ebsBaseUrl: '', panelDesign: defaultPanelDesign }, busy: false, collapsed: false, filter: 'all' };
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

  function normalizePanelDesign(value) {
    const source = value && typeof value === 'object' ? value : {};
    const color = (candidate, fallback) => /^#[0-9a-f]{6}$/i.test(String(candidate || '')) ? String(candidate).toUpperCase() : fallback;
    const clean = (candidate, fallback, maximum) => String(candidate || '').trim().replace(/[\r\n\0]+/g, ' ').slice(0, maximum) || fallback;
    const choice = (candidate, values, fallback) => values.includes(candidate) ? candidate : fallback;
    const radius = Number(source.cornerRadius);
    return {
      ...defaultPanelDesign,
      schemaVersion: 1,
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
      showSearch: source.showSearch !== false,
      showFilters: source.showFilters !== false,
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
    $('#panelBrandName').textContent = design.brandName;
    $('#panelEyebrow').textContent = design.eyebrow;
    $('#panelTitle').textContent = design.title;
    $('#panelLogo').hidden = !design.showLogo;
    $('#panelStatus').hidden = !design.showStatus;
    $('#panelSearch').hidden = !design.showSearch;
    $('#panelFilters').hidden = !design.showFilters;
    state.configuration.panelDesign = design;
  }

  async function readConfiguration() {
    try {
      const response = await fetch('runtime-config.json', { cache: 'no-store' });
      const runtime = response.ok ? await response.json() : {};
      if (runtime.schemaVersion === 1 && typeof runtime.ebsBaseUrl === 'string' && runtime.ebsBaseUrl) {
        return { mockMode: false, ebsBaseUrl: runtime.ebsBaseUrl.replace(/\/$/, ''), panelDesign: normalizePanelDesign(runtime.panelDesign) };
      }
    } catch { /* Local source previews fall back to browser configuration. */ }
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return { mockMode: parsed.mockMode !== false, ebsBaseUrl: typeof parsed.ebsBaseUrl === 'string' ? parsed.ebsBaseUrl.replace(/\/$/, '') : '', panelDesign: normalizePanelDesign(parsed.panelDesign) };
    } catch { return { mockMode: true, ebsBaseUrl: '', panelDesign: defaultPanelDesign }; }
  }

  function seconds(milliseconds) {
    return `${Math.max(1, Math.ceil(milliseconds / 1000))}s`;
  }

  function remaining(id) {
    return Math.max(0, (cooldowns.get(id) || 0) - Date.now());
  }

  function render() {
    const query = $('#alertSearch').value.trim().toLowerCase();
    const matchesQuery = (alert) => !query || `${alert.name} ${alert.id}`.toLowerCase().includes(query);
    const featured = state.filter === 'performances' ? [] : state.alerts.filter((alert) => alert.kind === 'interaction' && matchesQuery(alert));
    const performances = state.filter === 'events' ? [] : state.alerts.filter((alert) => alert.kind === 'sound-alert' && matchesQuery(alert));
    const visibleCount = featured.length + performances.length;
    $('#alertCount').textContent = `${visibleCount} AVAILABLE`;
    document.querySelectorAll('[data-signal-filter]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.signalFilter === state.filter)));
    $('#featuredRegion').hidden = featured.length === 0;
    $('#performanceRegion').hidden = performances.length === 0;
    $('#emptyState').hidden = visibleCount !== 0;
    $('#featuredGrid').innerHTML = featured.map((alert) => {
      const wait = remaining(alert.id);
      return `<button class="signal-featured" type="button" data-alert-id="${escapeHtml(alert.id)}" style="--signal:${escapeHtml(alert.accent)}" aria-label="Trigger ${escapeHtml(alert.name)}" ${state.busy || wait ? 'disabled' : ''}>
        <span class="featured-glyph">${escapeHtml(alert.glyph)}</span><span class="featured-copy"><strong>${escapeHtml(alert.name)}</strong><small>${wait ? `RECHARGING · ${seconds(wait)}` : `READY · ${seconds(alert.durationMs)} EFFECT`}</small></span><i class="signal-arrow" aria-hidden="true">›</i>
      </button>`;
    }).join('');
    $('#alertGrid').innerHTML = performances.map((alert) => {
      const wait = remaining(alert.id);
      return `<button class="alert-card" type="button" data-alert-id="${escapeHtml(alert.id)}" style="--signal:${escapeHtml(alert.accent)}" aria-label="Trigger ${escapeHtml(alert.name)}" ${state.busy || wait ? 'disabled' : ''}>
        <strong>${escapeHtml(alert.name)}</strong><span class="card-meta"><small>${wait ? `RECHARGE ${seconds(wait)}` : 'READY TO PLAY'}</small><span class="alert-duration">${seconds(alert.durationMs)}</span></span>
      </button>`;
    }).join('');
  }

  function setConnection(label, online) {
    $('#stateLabel').textContent = label;
    $('#stateLight').classList.toggle('online', online);
  }

  async function refreshHostedCatalog() {
    const configuration = state.configuration;
    if (configuration.mockMode || !configuration.ebsBaseUrl || !state.auth?.token) return;
    const response = await fetch(`${configuration.ebsBaseUrl}/v1/extension/catalog`, {
      headers: { 'X-Extension-JWT': state.auth.token },
      cache: 'no-store'
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Signal catalog unavailable (${response.status}).`);
    if (!Array.isArray(body.items)) throw new Error('The hosted signal catalog is invalid.');
    state.alerts = body.items;
    setConnection(body.studioConnected ? 'MAINFRAME ONLINE' : 'STUDIO OFFLINE', Boolean(body.studioConnected));
    render();
  }

  let toastTimer;
  function toast(message, error = false) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.toggle('error', error);
    element.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('visible'), 3500);
  }

  async function requestAlert(alert) {
    const configuration = state.configuration;
    if (!configuration.mockMode && (!state.auth?.token || !configuration.ebsBaseUrl)) throw new Error('The Tempest interaction relay is not configured.');
    if (configuration.mockMode) {
      await new Promise((resolve) => setTimeout(resolve, 260));
      return { accepted: true, cooldownMs: Math.max(5000, alert.cooldownMs || alert.durationMs) };
    }
    const requestId = crypto.randomUUID();
    const route = alert.kind === 'interaction'
      ? `/v1/extension/interactions/${encodeURIComponent(alert.id)}/trigger`
      : `/v1/extension/alerts/${encodeURIComponent(alert.id)}/trigger`;
    const response = await fetch(`${configuration.ebsBaseUrl}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': state.auth.token, 'X-Request-ID': requestId },
      body: JSON.stringify({ ...(alert.kind === 'interaction' ? {} : { alertId: alert.id }), requestId })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || `Signal rejected with status ${response.status}.`);
      error.retryAfterMs = body.retryAfterMs;
      throw error;
    }
    setConnection('MAINFRAME ONLINE', true);
    return body;
  }

  async function trigger(id) {
    const alert = state.alerts.find((entry) => entry.id === id);
    if (!alert || state.busy || remaining(id)) return;
    state.busy = true;
    render();
    try {
      const result = await requestAlert(alert);
      const cooldownMs = Number(result.cooldownMs) || Math.max(5000, alert.cooldownMs || alert.durationMs);
      cooldowns.set(id, Date.now() + cooldownMs);
      toast(`${alert.name} signal accepted.`);
    } catch (error) {
      if (Number(error.retryAfterMs) > 0) cooldowns.set(id, Date.now() + Number(error.retryAfterMs));
      toast(error.message, true);
    } finally {
      state.busy = false;
      render();
    }
  }

  function bindTwitch() {
    if (!window.Twitch?.ext) {
      setConnection('LOCAL PREVIEW', true);
      $('#viewerState').textContent = 'Local preview identity';
      return;
    }
    window.Twitch.ext.onAuthorized((authorization) => {
      state.auth = authorization;
      setConnection('TWITCH AUTHORIZED', true);
      $('#viewerState').textContent = authorization.userId?.startsWith('A') ? 'Anonymous viewer link' : 'Viewer link established';
      void refreshHostedCatalog().catch((error) => { setConnection('PAIRING REQUIRED', false); toast(error.message, true); });
    });
    window.Twitch.ext.onError(() => setConnection('LINK ERROR', false));
    window.Twitch.ext.configuration?.onChanged(() => {
      try {
        const content = window.Twitch.ext.configuration.broadcaster?.content;
        if (!content) return;
        const configuration = JSON.parse(content);
        applyPanelDesign(configuration.panelDesign || configuration);
      } catch { /* Invalid channel configuration leaves the last safe design active. */ }
    });
    setTimeout(() => {
      if (!state.auth) {
        setConnection('LOCAL PREVIEW', true);
        $('#viewerState').textContent = 'Local preview identity';
      }
    }, 1200);
  }

  function bindEvents() {
    $('#alertSearch').addEventListener('input', render);
    const triggerFromClick = (event) => {
      const button = event.target.closest('[data-alert-id]');
      if (button) void trigger(button.dataset.alertId);
    };
    $('#featuredGrid').addEventListener('click', triggerFromClick);
    $('#alertGrid').addEventListener('click', triggerFromClick);
    document.querySelector('.signal-filters').addEventListener('click', (event) => {
      const button = event.target.closest('[data-signal-filter]');
      if (!button) return;
      state.filter = button.dataset.signalFilter;
      render();
    });
    $('#collapseButton').addEventListener('click', () => {
      state.collapsed = !state.collapsed;
      document.body.classList.toggle('collapsed', state.collapsed);
      $('#collapseButton').textContent = state.collapsed ? 'EXPAND' : 'MINIMIZE';
      $('#collapseButton').setAttribute('aria-expanded', String(!state.collapsed));
    });
    setInterval(() => { if ([...cooldowns.keys()].some((id) => remaining(id) > 0)) render(); }, 1000);
  }

  async function initialize() {
    bindEvents();
    bindTwitch();
    const [configuration, response, interactionsResponse] = await Promise.all([
      readConfiguration(),
      fetch('alerts.json', { cache: 'no-store' }),
      fetch('interactions.json', { cache: 'no-store' })
    ]);
    state.configuration = configuration;
    applyPanelDesign(configuration.panelDesign);
    if (!response.ok || !interactionsResponse.ok) throw new Error('The signal catalog could not be loaded.');
    const bundledAlerts = [
      ...(await interactionsResponse.json()).map((entry) => ({ ...entry, kind: 'interaction' })),
      ...(await response.json()).map((entry) => ({ ...entry, kind: 'sound-alert' }))
    ];
    state.alerts = configuration.mockMode ? bundledAlerts : [];
    render();
    await refreshHostedCatalog().catch((error) => {
      if (!configuration.mockMode && state.auth?.token) { setConnection('PAIRING REQUIRED', false); toast(error.message, true); }
    });
  }

  initialize().catch((error) => { setConnection('SYSTEM ERROR', false); toast(error.message, true); });
})();
