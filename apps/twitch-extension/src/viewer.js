(() => {
  'use strict';

  const storageKey = 'tempest-extension-configuration-v1';
  const defaultPanelDesign = { schemaVersion: 1, preset: 'tempest', brandName: 'TEMPEST STREAMING STUDIO', eyebrow: 'VIEWER CONTROL NODE', title: 'Signal deck', accent: '#54F2EB', background: '#05090E', surface: '#09131B', text: '#ECF9FF', muted: '#79919D', font: 'inter', cardLayout: 'grid', density: 'comfortable', cornerRadius: 10, showLogo: true, showStatus: true, showSearch: true, showFilters: true, showPattern: true, uppercaseLabels: true };
  const cooldowns = new Map();
  const state = { auth: null, alerts: [], poll: null, counters: [], goal: null, nowPlaying: null, schedule: null, configuration: { mockMode: true, ebsBaseUrl: '', panelDesign: defaultPanelDesign }, hostedPanelDesign: false, busy: false, pollBusy: false, collapsed: false, filter: 'all' };
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

  function pollVoteKey(pollId) {
    return `tempest-extension-poll-vote:${pollId}`;
  }

  function savedPollVote(pollId) {
    const value = Number(sessionStorage.getItem(pollVoteKey(pollId)));
    return Number.isInteger(value) && value > 0 ? value : 0;
  }

  function renderPoll() {
    const poll = state.poll;
    const region = $('#pollRegion');
    region.hidden = !poll;
    if (!poll) return;
    const selected = savedPollVote(poll.id);
    const closed = poll.state !== 'active';
    $('#pollState').textContent = closed ? 'FINAL RESULTS' : 'VOTING OPEN';
    $('#pollQuestion').textContent = poll.question;
    $('#pollOptions').innerHTML = poll.options.map((option) => `<button class="poll-option${selected === option.number ? ' selected' : ''}" type="button" data-poll-option="${option.number}" ${closed || state.pollBusy || selected ? 'disabled' : ''} aria-label="Vote ${option.number}: ${escapeHtml(option.label)}">
      <span class="poll-option-copy"><b>${option.number}</b><strong>${escapeHtml(option.label)}</strong><i>${option.votes} · ${option.percentage}%</i></span>
      <span class="poll-meter" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, Number(option.percentage) || 0))}%"></i></span>
    </button>`).join('');
    $('#pollSummary').textContent = selected
      ? `Your vote: ${selected} · ${poll.totalVotes} total vote${poll.totalVotes === 1 ? '' : 's'}.`
      : closed ? `${poll.totalVotes} final vote${poll.totalVotes === 1 ? '' : 's'}.`
        : `Each linked Twitch viewer gets one vote · ${poll.totalVotes} recorded.`;
  }

  function renderGoal(visible) {
    const goal = visible ? state.goal : null;
    const region = $('#goalRegion');
    region.hidden = !goal;
    if (!goal) return;
    region.style.setProperty('--goal-accent', goal.accent);
    $('#goalKind').textContent = `${String(goal.kind || 'custom').replaceAll('-', ' ')} · ${String(goal.source || 'studio').toUpperCase()}`;
    $('#goalTitle').textContent = goal.title;
    $('#goalProgress').textContent = `${Number(goal.currentAmount).toLocaleString()}${goal.unit ? ` ${goal.unit}` : ''}`;
    $('#goalTarget').textContent = `${Number(goal.targetAmount).toLocaleString()}${goal.unit ? ` ${goal.unit}` : ''}`;
    $('#goalPercentage').textContent = `${Number(goal.percentage).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
    $('#goalBar').style.width = `${Math.max(0, Math.min(100, Number(goal.percentage) || 0))}%`;
  }

  function renderNowPlaying(visible) {
    const playing = visible ? state.nowPlaying : null;
    const region = $('#nowPlayingRegion');
    region.hidden = !playing;
    if (!playing) return;
    const track = playing.artist && playing.title ? `${playing.artist} — ${playing.title}` : playing.title || playing.text || (playing.state === 'online' ? 'Track information unavailable' : 'Station is currently offline');
    $('#nowPlayingState').textContent = playing.state === 'online' ? 'ON AIR' : playing.state.toUpperCase();
    $('#nowPlayingStation').textContent = playing.stationName;
    $('#nowPlayingTrack').textContent = track;
    $('#nowPlayingAlbum').textContent = playing.album ? `Album · ${playing.album}` : 'Live station metadata';
    $('#nowPlayingListen').disabled = !playing.publicPlayerUrl;
  }

  function renderSchedule(visible) {
    const schedule = visible ? state.schedule : null;
    const region = $('#scheduleRegion');
    region.hidden = !schedule;
    if (!schedule) return;
    const start = new Date(schedule.startTime);
    $('#scheduleTitle').textContent = schedule.title || 'Next scheduled stream';
    $('#scheduleTime').dateTime = schedule.startTime;
    $('#scheduleTime').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(start);
  }

  function render() {
    const query = $('#alertSearch').value.trim().toLowerCase();
    const matchesQuery = (alert) => !query || `${alert.name} ${alert.id}`.toLowerCase().includes(query);
    const dice = state.filter === 'performances' ? [] : state.alerts.filter((alert) => alert.kind === 'interaction' && alert.id.startsWith('tempest.dice.') && matchesQuery(alert));
    const customDice = dice.find((entry) => entry.id === 'tempest.dice.custom');
    const dicePresets = dice.filter((entry) => entry.id !== 'tempest.dice.custom');
    const featured = state.filter === 'performances' ? [] : state.alerts.filter((alert) => alert.kind === 'interaction' && !alert.id.startsWith('tempest.dice.') && matchesQuery(alert));
    const performances = state.filter === 'events' ? [] : state.alerts.filter((alert) => alert.kind === 'sound-alert' && matchesQuery(alert));
    const counters = state.filter === 'performances' ? [] : state.counters.filter((counter) => !query || `${counter.label} ${counter.command}`.toLowerCase().includes(query));
    const goalVisible = state.filter !== 'performances' && Boolean(state.goal) && (!query || `${state.goal.title} ${state.goal.kind} ${state.goal.unit}`.toLowerCase().includes(query));
    const nowPlayingVisible = state.filter !== 'performances' && Boolean(state.nowPlaying) && (!query || `${state.nowPlaying.stationName} ${state.nowPlaying.artist || ''} ${state.nowPlaying.title || ''} ${state.nowPlaying.text || ''} ${state.nowPlaying.album || ''}`.toLowerCase().includes(query));
    const scheduleVisible = state.filter !== 'performances' && Boolean(state.schedule) && (!query || `${state.schedule.title || ''} next stream schedule`.toLowerCase().includes(query));
    const visibleCount = dice.length + featured.length + performances.length + counters.length + (goalVisible ? 1 : 0) + (nowPlayingVisible ? 1 : 0) + (scheduleVisible ? 1 : 0);
    $('#alertCount').textContent = `${visibleCount} AVAILABLE`;
    document.querySelectorAll('[data-signal-filter]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.signalFilter === state.filter)));
    $('#featuredRegion').hidden = featured.length === 0;
    $('#performanceRegion').hidden = performances.length === 0;
    $('#diceRegion').hidden = dice.length === 0;
    $('#diceGrid').innerHTML = dicePresets.map((entry) => {
      const wait = remaining(entry.id);
      return `<button class="dice-option" type="button" data-alert-id="${escapeHtml(entry.id)}" style="--signal:${escapeHtml(entry.accent)}" ${state.busy || wait ? 'disabled' : ''}><b>${escapeHtml(entry.glyph)}</b><small>${wait ? seconds(wait) : 'ROLL'}</small></button>`;
    }).join('');
    $('#diceCustomForm').hidden = !customDice;
    $('#diceCustomMaximum').disabled = state.busy || Boolean(customDice && remaining(customDice.id));
    $('#rollCustomDice').disabled = state.busy || Boolean(customDice && remaining(customDice.id));
    $('#counterRegion').hidden = counters.length === 0;
    $('#counterGrid').innerHTML = counters.map((counter) => `<article class="counter-card"><span>${escapeHtml(counter.label)}</span><strong>${Number(counter.value).toLocaleString()}</strong><small>!${escapeHtml(counter.command)}</small></article>`).join('');
    renderGoal(goalVisible);
    renderNowPlaying(nowPlayingVisible);
    renderSchedule(scheduleVisible);
    $('#emptyState').hidden = visibleCount !== 0 || Boolean(state.poll);
    $('#featuredGrid').innerHTML = featured.map((alert) => {
      const wait = remaining(alert.id);
      return `<button class="signal-featured" type="button" data-alert-id="${escapeHtml(alert.id)}" style="--signal:${escapeHtml(alert.accent)}" aria-label="Trigger ${escapeHtml(alert.name)}" ${state.busy || wait ? 'disabled' : ''}>
        <span class="featured-glyph">${escapeHtml(alert.glyph)}</span><span class="featured-copy"><strong>${escapeHtml(alert.name)}</strong><small>${wait ? `RECHARGING · ${seconds(wait)}` : `READY · ${seconds(alert.durationMs)} EFFECT`}</small></span><i class="signal-arrow" aria-hidden="true">›</i>
      </button>`;
    }).join('');
    renderPoll();
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
    if (body.panelDesign && typeof body.panelDesign === 'object') {
      state.hostedPanelDesign = true;
      applyPanelDesign(body.panelDesign);
    }
    state.alerts = body.items;
    state.counters = Array.isArray(body.counters) ? body.counters : [];
    state.goal = body.goal && typeof body.goal === 'object' ? body.goal : null;
    state.nowPlaying = body.nowPlaying && typeof body.nowPlaying === 'object' ? body.nowPlaying : null;
    state.schedule = body.schedule && typeof body.schedule === 'object' ? body.schedule : null;
    const incomingPoll = body.poll && typeof body.poll === 'object' ? body.poll : null;
    state.poll = incomingPoll && state.poll?.id === incomingPoll.id && Number(state.poll.totalVotes) > Number(incomingPoll.totalVotes)
      ? state.poll
      : incomingPoll;
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

  async function requestAlert(alert, payload = {}) {
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
      body: JSON.stringify({ ...(alert.kind === 'interaction' ? {} : { alertId: alert.id }), ...payload, requestId })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || `Signal rejected with status ${response.status}.`);
      error.retryAfterMs = body.retryAfterMs;
      error.code = body.code;
      throw error;
    }
    setConnection('MAINFRAME ONLINE', true);
    return body;
  }

  async function trigger(id, payload = {}) {
    const alert = state.alerts.find((entry) => entry.id === id);
    if (!alert || state.busy || remaining(id)) return;
    const diceAction = id.startsWith('tempest.dice.');
    state.busy = true;
    render();
    try {
      const result = await requestAlert(alert, payload);
      const cooldownMs = Number(result.cooldownMs) || Math.max(5000, alert.cooldownMs || alert.durationMs);
      const cooldownUntil = Date.now() + cooldownMs;
      if (diceAction) state.alerts.filter((entry) => entry.id.startsWith('tempest.dice.')).forEach((entry) => cooldowns.set(entry.id, cooldownUntil));
      else cooldowns.set(id, cooldownUntil);
      toast(diceAction ? `${result.expression || alert.name} rolling on stream.` : `${alert.name} signal accepted.`);
    } catch (error) {
      if (Number(error.retryAfterMs) > 0) {
        const cooldownUntil = Date.now() + Number(error.retryAfterMs);
        if (diceAction) state.alerts.filter((entry) => entry.id.startsWith('tempest.dice.')).forEach((entry) => cooldowns.set(entry.id, cooldownUntil));
        else cooldowns.set(id, cooldownUntil);
      }
      if (error.code === 'identity_required' && window.Twitch?.ext?.actions?.requestIdShare) {
        toast('Share your Twitch identity to use this channel’s restricted interactions.', true);
        window.Twitch.ext.actions.requestIdShare();
      } else toast(error.message, true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function voteInPoll(optionNumber) {
    const poll = state.poll;
    if (!poll || poll.state !== 'active' || state.pollBusy || savedPollVote(poll.id)) return;
    state.pollBusy = true;
    renderPoll();
    try {
      if (state.configuration.mockMode) {
        const option = poll.options.find((entry) => entry.number === optionNumber);
        if (!option) throw new Error('That poll choice is no longer available.');
        option.votes += 1;
        poll.totalVotes += 1;
        poll.options = poll.options.map((entry) => ({ ...entry, percentage: poll.totalVotes ? Math.round((entry.votes / poll.totalVotes) * 1000) / 10 : 0 }));
        sessionStorage.setItem(pollVoteKey(poll.id), String(optionNumber));
        toast(`Vote ${optionNumber} recorded in local preview.`);
        return;
      }
      if (!state.auth?.token || !state.configuration.ebsBaseUrl) throw new Error('The Tempest poll relay is not configured.');
      const requestId = crypto.randomUUID();
      const response = await fetch(`${state.configuration.ebsBaseUrl}/v1/extension/poll/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': state.auth.token, 'X-Request-ID': requestId },
        body: JSON.stringify({ requestId, pollId: poll.id, optionNumber })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(body.error || `Poll vote was rejected with status ${response.status}.`);
        error.code = body.code;
        throw error;
      }
      if (body.poll && typeof body.poll === 'object') state.poll = body.poll;
      const recordedOption = Number(body.optionNumber || optionNumber);
      if (body.accepted || body.duplicate) sessionStorage.setItem(pollVoteKey(poll.id), String(recordedOption));
      toast(body.duplicate ? `You already voted for option ${recordedOption}.` : `Vote ${recordedOption} recorded.`);
    } catch (error) {
      if (error.code === 'identity_required' && window.Twitch?.ext?.actions?.requestIdShare) {
        toast('Share your Twitch identity to cast one verified vote.', true);
        window.Twitch.ext.actions.requestIdShare();
      } else toast(error.message, true);
    } finally {
      state.pollBusy = false;
      renderPoll();
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
        if (!state.hostedPanelDesign) applyPanelDesign(configuration.panelDesign || configuration);
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
    $('#diceGrid').addEventListener('click', triggerFromClick);
    $('#diceCustomForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const maximum = Number($('#diceCustomMaximum').value);
      if (!Number.isInteger(maximum) || maximum < 2 || maximum > 100) return toast('Choose a maximum from 2 through 100.', true);
      void trigger('tempest.dice.custom', { maximum });
    });
    $('#pollOptions').addEventListener('click', (event) => {
      const button = event.target.closest('[data-poll-option]');
      if (button) void voteInPoll(Number(button.dataset.pollOption));
    });
    $('#nowPlayingListen').addEventListener('click', () => {
      const url = state.nowPlaying?.publicPlayerUrl;
      if (!url) return;
      if (window.Twitch?.ext?.actions?.openUrl) window.Twitch.ext.actions.openUrl(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    });
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
    setInterval(() => {
      if (!document.hidden) void refreshHostedCatalog().catch(() => {});
    }, 10000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void refreshHostedCatalog().catch(() => {});
    });
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
    state.poll = configuration.mockMode ? {
      id: 'local-preview-poll-0001', state: 'active', question: 'What should happen next?', totalVotes: 12,
      options: [
        { number: 1, label: 'Roll the 3D dice', votes: 7, percentage: 58.3 },
        { number: 2, label: 'Trigger a stream effect', votes: 5, percentage: 41.7 }
      ],
      startedAt: new Date().toISOString()
    } : null;
    state.counters = configuration.mockMode ? [{ id: 'preview-counter', command: 'death', label: 'Ship Restarts', value: 7 }] : [];
    state.goal = configuration.mockMode ? { source: 'studio', kind: 'subscriptions', title: 'Road to 50 Subscribers', currentAmount: 31, targetAmount: 50, percentage: 62, unit: 'subs', accent: '#A7FF5C' } : null;
    state.nowPlaying = configuration.mockMode ? { stationName: 'Storm Horizon Radio', state: 'online', artist: 'The Midnight', title: 'Synthetic', album: 'Endless Summer', publicPlayerUrl: 'https://www.tempestmainframe.com/listen', checkedAt: new Date().toISOString() } : null;
    state.schedule = configuration.mockMode ? { title: 'Signals From the Mainframe', startTime: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString() } : null;
    render();
    await refreshHostedCatalog().catch((error) => {
      if (!configuration.mockMode && state.auth?.token) { setConnection('PAIRING REQUIRED', false); toast(error.message, true); }
    });
  }

  initialize().catch((error) => { setConnection('SYSTEM ERROR', false); toast(error.message, true); });
})();
