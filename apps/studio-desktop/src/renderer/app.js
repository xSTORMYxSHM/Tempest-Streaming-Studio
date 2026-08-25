(() => {
  'use strict';

  const sections = {
    overview: { title: 'Studio Home', kicker: 'START HERE' },
    workflows: { title: 'Interaction Workflows', kicker: 'AUTOMATION DIRECTORY' },
    events: { title: 'Event Log', kicker: 'NORMALIZED SIGNALS' },
    soundalerts: { title: 'Interaction Alerts', kicker: 'PERFORMANCE + DANCE CATALOG' },
    visualalerts: { title: 'Twitch Alerts', kicker: 'TWITCH CHANNEL EVENTS' },
    chatoverlay: { title: 'Chat Overlay', kicker: 'LOCAL STREAM CHAT' },
    twitch: { title: 'Twitch Gateway', kicker: 'STUDIO-OWNED INTEGRATION' },
    extensiondesigner: { title: 'Twitch Panel Designer', kicker: 'CHANNEL EXTENSION THEME' },
    chatbot: { title: 'Chatbot', kicker: 'STUDIO CHAT AUTOMATION' },
    api: { title: 'Connections', kicker: 'TEMPEST BRIDGE' },
    software: { title: 'Software Management', kicker: 'SUITE REGISTRY' },
    assets: { title: 'Asset Control', kicker: 'ASSET LIBRARY' }
  };
  const targetNames = {
    'com.tempestmainframe.warudo': 'Warudo',
    'com.tempestmainframe.tempest-broadcast': 'Tempest Broadcast',
    'com.tempestmainframe.quartic-pulse': 'Quartic Pulse',
    'com.tempestmainframe.data-horizon': 'Data Horizon'
  };
  const copyIcon = '<svg aria-hidden="true" viewBox="0 0 16 16"><rect x="5.25" y="2.25" width="8.5" height="8.5" rx="1.25"></rect><path d="M10.75 10.75v1.5a1.5 1.5 0 0 1-1.5 1.5h-5.5a1.5 1.5 0 0 1-1.5-1.5v-5.5a1.5 1.5 0 0 1 1.5-1.5h1.5"></path></svg>';
  const state = {
    config: null,
    health: null,
    safety: { armed: false, activeRuns: 0 },
    applications: [],
    assets: [],
    connections: [],
    workflows: [],
    runs: [],
    events: [],
    soundAlerts: { alerts: [] },
    visualAlerts: null,
    twitchVisualAlerts: { alerts: [] },
    giphy: { configured: false, encryptionAvailable: false },
    chatOverlay: null,
    twitch: null,
    chatbot: null,
    radio: null,
    localExtension: null,
    panelDesign: null,
    warudo: null,
    twitchDeviceAuthorization: null,
    chatbotDeviceAuthorization: null
  };
  let selectedAsset = null;
  let toastTimer = null;
  let runtimeRefreshBusy = false;
  let twitchPollTimer = null;
  let chatbotPollTimer = null;
  let onboardingStep = 0;
  let onboardingAutoOpened = false;
  const activeSoundAlertAudio = new Map();
  const onboardingStorageKey = 'tempest.streaming-studio.onboarding.v1';
  const onboardingSteps = [
    { title: 'Welcome', short: 'Studio overview' },
    { title: 'Twitch Accounts', short: 'Broadcaster + bot' },
    { title: 'Browser Sources', short: 'Three local URLs' },
    { title: 'Canvas + Audio', short: 'OBS dimensions' },
    { title: 'Ready Check', short: 'Test before live' }
  ];

  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const activeRun = (run) => run.state === 'running' || run.state === 'pending';

  function copyButton(value, label) {
    const safeLabel = escapeHtml(label || 'value');
    return `<button class="copy-button" data-copy-text="${escapeHtml(value)}" data-copy-label="${safeLabel}" type="button" aria-label="Copy ${safeLabel}" title="Copy ${safeLabel}">${copyIcon}</button>`;
  }

  function toast(message, error = false) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.toggle('error', error);
    element.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('visible'), 4200);
  }

  function showSection(name) {
    const definition = sections[name] || sections.overview;
    document.querySelectorAll('.page').forEach((page) => page.classList.toggle('active', page.id === `${name}Section`));
    document.querySelectorAll('.nav-button').forEach((button) => button.classList.toggle('active', button.dataset.section === name));
    $('#sectionTitle').textContent = definition.title;
    $('#sectionKicker').textContent = definition.kicker;
    document.querySelector('main').scrollTo({ top: 0, left: 0 });
  }

  async function api(path, options = {}) {
    if (!state.config) throw new Error('Tempest Bridge configuration is unavailable.');
    return window.tempestStudio.bridgeRequest({ path, method: options.method || 'GET', body: options.body });
  }

  function durationLabel(milliseconds) {
    const seconds = Math.max(0, Math.ceil(Number(milliseconds || 0) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  }

  function remainingLabel(timestamp) {
    if (!timestamp) return 'Completing';
    return durationLabel(new Date(timestamp).getTime() - Date.now());
  }

  function compactEvent(event) {
    return `<div class="compact-row event-${escapeHtml(event.level)}"><div><strong>${escapeHtml(event.message)}</strong><small>${new Date(event.timestamp).toLocaleTimeString()} · ${escapeHtml(event.type)}</small></div><i class="event-dot"></i></div>`;
  }

  function runActionState(run, actionId) {
    return run?.actions?.find((action) => action.id === actionId)?.state || 'ready';
  }

  function renderSafety() {
    const armed = Boolean(state.safety.armed);
    const active = state.runs.filter(activeRun).length;
    $('#railSafetyState').textContent = armed ? 'ARMED' : 'DISARMED';
    $('#railSafetyState').classList.toggle('armed', armed);
    $('#safetyBadge').textContent = armed ? 'INTERACTIONS ARMED' : 'INTERACTIONS DISARMED';
    $('#safetyBadge').classList.toggle('offline', !armed);
    $('#workflowSafetyBadge').textContent = armed ? 'ARMED' : 'DISARMED';
    $('#workflowSafetyBadge').classList.toggle('offline', !armed);
    $('#emergencyStopButton').textContent = armed ? (active ? `Restore ${active} Active` : 'Emergency Restore') : 'Arm Interactions';
    $('#emergencyStopButton').classList.toggle('arm-button', !armed);
    $('#safetyMetric').textContent = armed ? 'ARMED' : 'SAFE';
    $('#safetyMetric').classList.toggle('danger-text', !armed);
    $('#safetyMetricNote').textContent = armed ? 'Viewer triggers accepted' : 'Triggers blocked; overrides released';
    document.querySelectorAll('[data-trigger-workflow]').forEach((button) => { button.disabled = !armed; });
    document.querySelectorAll('[data-sound-alert-trigger]').forEach((button) => { button.disabled = !armed; });
  }

  function renderOverview() {
    const active = state.runs.filter(activeRun);
    $('#activeRunMetric').textContent = active.length;
    $('#workflowMetric').textContent = state.workflows.filter((workflow) => workflow.enabled).length;
    $('#connectionMetric').textContent = state.connections.length;
    $('#activeRunMetricNote').textContent = active.length ? `${active[0].workflowName} in progress` : 'Runtime standing by';
    $('#connectionMetricNote').textContent = state.connections.length ? 'Commands use live delivery' : 'Simulation is available';
    $('#heroCore').classList.toggle('active', Boolean(active.length));

    const display = $('#activeRunDisplay');
    const run = active[0];
    display.classList.toggle('empty-state', !run);
    if (!run) display.textContent = 'No workflow is active.';
    else {
      const total = Math.max(1, new Date(run.endsAt || run.startedAt).getTime() - new Date(run.startedAt).getTime());
      const elapsed = Math.max(0, Date.now() - new Date(run.startedAt).getTime());
      const progress = Math.max(0, Math.min(100, elapsed / total * 100));
      display.innerHTML = `<div class="active-run-head"><div><span>${escapeHtml(run.source)}</span><h4>${escapeHtml(run.workflowName)}</h4></div><strong>${remainingLabel(run.endsAt)}</strong></div>
        <div class="run-progress"><span style="width:${progress.toFixed(2)}%"></span></div>
        <div class="run-action-strip">${run.actions.map((action) => `<div class="run-action ${escapeHtml(action.state)}"><i></i><span>${escapeHtml(targetNames[action.target] || action.target)}</span><small>${escapeHtml(action.state)}</small></div>`).join('')}</div>`;
    }

    const recent = $('#overviewEvents');
    recent.classList.toggle('empty-state', !state.events.length);
    recent.innerHTML = state.events.length ? state.events.slice(0, 5).map(compactEvent).join('') : 'No events have been received.';
    renderOnboardingSummary();
    if ($('#onboardingDialog').open) renderOnboarding();
  }

  function readOnboardingPreferences() {
    try {
      const parsed = JSON.parse(localStorage.getItem(onboardingStorageKey) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }

  function writeOnboardingPreferences(patch) {
    const current = readOnboardingPreferences();
    const next = { ...current, ...patch, flags: { ...(current.flags || {}), ...(patch.flags || {}) } };
    localStorage.setItem(onboardingStorageKey, JSON.stringify(next));
    return next;
  }

  function onboardingStatus() {
    const preferences = readOnboardingPreferences();
    const flags = preferences.flags || {};
    const broadcasterReady = state.twitch?.oauth?.state === 'authorized';
    const chatbotReady = state.chatbot?.oauth?.state === 'authorized'
      && state.chatbot?.connections?.eventSub === 'connected'
      && state.chatbot?.connections?.chat === 'connected';
    const twitchSourceReady = Boolean(state.visualAlerts?.twitch?.connectedClients) || flags.twitchSource === true;
    const interactionSourceReady = Boolean(state.visualAlerts?.interaction?.connectedClients) || flags.interactionSource === true;
    const chatSourceReady = Boolean(state.chatOverlay?.connectedClients) || flags.chatSource === true;
    const browserSourcesReady = twitchSourceReady && interactionSourceReady;
    const canvasReady = flags.canvasConfigured === true;
    const liveTestReady = Number(state.chatbot?.commandsTriggered || 0) > 0 || flags.alertTested === true;
    const checks = [Boolean(state.health), broadcasterReady && chatbotReady, browserSourcesReady, canvasReady, liveTestReady];
    return {
      preferences, flags, broadcasterReady, chatbotReady, twitchSourceReady, interactionSourceReady, chatSourceReady,
      browserSourcesReady, canvasReady, liveTestReady, checks, readyCount: checks.filter(Boolean).length
    };
  }

  function renderOnboardingSummary() {
    const setup = onboardingStatus();
    const completed = setup.preferences.completed === true;
    $('#homeSetupProgress').textContent = completed && setup.readyCount === onboardingSteps.length
      ? 'SETUP COMPLETE'
      : `${setup.readyCount} OF ${onboardingSteps.length} READY`;
    $('#homeSetupProgressNote').textContent = completed
      ? setup.readyCount === onboardingSteps.length ? 'Your essential stream connections and routing checks are ready.' : 'Setup was completed earlier; review the checks that need attention.'
      : 'Continue the guided setup before your first public stream.';
    $('#homeSetupProgressBar').style.width = `${setup.readyCount / onboardingSteps.length * 100}%`;
    $('#reviewOnboardingWizard').textContent = completed ? 'Review Setup' : 'Continue Setup';
  }

  function setupCheckCard(done, title, detail, stateLabel = done ? 'READY' : 'ACTION NEEDED') {
    return `<article class="onboarding-check-card ${done ? 'done' : ''}"><i></i><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div><span>${escapeHtml(stateLabel)}</span></article>`;
  }

  function onboardingSourceCard(title, url, detail, label) {
    return `<article class="onboarding-source-card"><div><strong>${escapeHtml(title)}</strong><code>${escapeHtml(url)}</code><small>${escapeHtml(detail)}</small></div>${copyButton(url, label)}</article>`;
  }

  function onboardingFlag(name, checked, title, detail) {
    return `<label class="onboarding-confirm"><input type="checkbox" data-onboarding-flag="${escapeHtml(name)}" ${checked ? 'checked' : ''} /><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span></label>`;
  }

  function renderOnboarding() {
    const setup = onboardingStatus();
    const baseUrl = state.config?.baseUrl || 'http://127.0.0.1:4765';
    const twitchUrl = state.visualAlerts?.twitch?.url || `${baseUrl}/visual-alerts/twitch`;
    const interactionUrl = state.visualAlerts?.interaction?.url || `${baseUrl}/visual-alerts/interactions`;
    const chatUrl = state.chatOverlay?.url || `${baseUrl}/chat-overlay`;
    const broadcasterLogin = state.twitch?.oauth?.account?.login;
    const botLogin = state.chatbot?.oauth?.account?.login;
    $('#onboardingKicker').textContent = `STEP ${onboardingStep + 1} OF ${onboardingSteps.length}`;
    $('#onboardingTitle').textContent = onboardingSteps[onboardingStep].title;
    $('#onboardingStepList').innerHTML = onboardingSteps.map((step, index) => `<button class="onboarding-step-button ${index === onboardingStep ? 'active' : ''} ${setup.checks[index] ? 'done' : ''}" type="button" data-onboarding-step="${index}"><b>${String(index + 1).padStart(2, '0')}</b><span><strong>${escapeHtml(step.title)}</strong><small>${escapeHtml(step.short)}</small></span><i></i></button>`).join('');
    let markup = '';
    if (onboardingStep === 0) {
      markup = `<div class="onboarding-intro"><p class="eyebrow">TEMPEST STREAMING STUDIO</p><h3>One guided path from installation to an on-air test</h3><p>This setup checks the local Bridge, Twitch identities, browser sources, canvas dimensions, and one real command or alert. It never asks for a Twitch client secret and can be reviewed again from Studio Home.</p><div class="onboarding-check-grid">${setupCheckCard(Boolean(state.health), 'Local Studio Bridge', state.health ? `API ${state.health.protocolVersion || '1.0'} is online on this computer.` : 'Studio is waiting for its local control plane.')}${setupCheckCard(setup.broadcasterReady, 'Broadcaster identity', setup.broadcasterReady ? `Authorized as @${broadcasterLogin}.` : 'Connect the channel owner in Twitch Gateway.')}${setupCheckCard(setup.chatbotReady, 'Secondary bot identity', setup.chatbotReady ? `@${botLogin} can listen and reply.` : 'Authorize a separate Twitch user for chat operations.')}${setupCheckCard(setup.browserSourcesReady, 'Alert browser sources', setup.browserSourcesReady ? 'Twitch and Interaction sources are confirmed.' : 'Add the two dedicated alert sources to OBS or Broadcast.')}${setupCheckCard(setup.canvasReady, 'Canvas + audio routing', setup.canvasReady ? 'OBS dimensions and track routing confirmed.' : 'Confirm the 3440 × 1440 source dimensions and VOD routing.')}${setupCheckCard(setup.liveTestReady, 'Live route test', setup.liveTestReady ? 'At least one real command or alert reached Studio.' : 'Run one safe test before going live.')}</div></div>`;
    } else if (onboardingStep === 1) {
      markup = `<div class="onboarding-intro"><p>Twitch uses two deliberately separate authorizations: the broadcaster owns channel events, while the bot account reads and replies in chat.</p><div class="onboarding-check-grid">${setupCheckCard(setup.broadcasterReady, 'Broadcaster account', setup.broadcasterReady ? `@${broadcasterLogin} is authorized.` : 'A Public Twitch application Client ID and broadcaster authorization are required.')}${setupCheckCard(setup.chatbotReady, 'Secondary bot account', setup.chatbotReady ? `@${botLogin} is connected for EventSub and chat output.` : 'Connect a second Twitch user account in the isolated sign-in window.')}</div><div class="onboarding-actions"><button class="secondary-button" type="button" data-onboarding-go="twitch">Open Twitch Gateway</button><button class="secondary-button" type="button" data-onboarding-go="chatbot">Open Chatbot Setup</button></div><div class="onboarding-note"><strong>Why two accounts?</strong> The broadcaster remains the channel owner. The secondary account gives chat automation its own visible identity and keeps those credentials isolated.</div></div>`;
    } else if (onboardingStep === 2) {
      markup = `<div class="onboarding-intro"><p>Add each local URL as its own transparent Browser Source. Separate Twitch Alerts from Interaction Alerts so copyrighted interaction music can be excluded from the YouTube/VOD audio track.</p><div class="onboarding-source-list">${onboardingSourceCard('Twitch Alerts', twitchUrl, 'Follows, subscriptions, Bits, raids, and channel events.', 'Twitch Alert browser-source URL')}${onboardingSourceCard('Interaction Alerts', interactionUrl, 'Viewer performances and music; keep on a separate OBS audio track.', 'Interaction Alert browser-source URL')}${onboardingSourceCard('Chat Overlay · optional', chatUrl, 'Local stream-chat overlay that replaces an external Botrix source.', 'Chat Overlay browser-source URL')}</div><div class="onboarding-confirm-list">${onboardingFlag('twitchSource', setup.twitchSourceReady, 'Twitch Alert source added', 'Add it once to every scene collection that needs Twitch event visuals.')}${onboardingFlag('interactionSource', setup.interactionSourceReady, 'Interaction Alert source added', 'Enable Control audio via OBS so its VOD track can be routed separately.')}${onboardingFlag('chatSource', setup.chatSourceReady, 'Chat Overlay added · optional', 'Confirm this after replacing an existing chat browser source.')}</div></div>`;
    } else if (onboardingStep === 3) {
      markup = `<div class="onboarding-intro"><p>The current Tempest canvas profile matches your ultrawide streaming layout. Set every Studio Browser Source to the base canvas size; OBS handles the final output scaling.</p><div class="onboarding-canvas-card"><div><span>BASE CANVAS + BROWSER SOURCES</span><strong>3440 × 1440</strong><small>43:18 placement space used by the alert designer.</small></div><div><span>OUTPUT (SCALED)</span><strong>2580 × 1080</strong><small>Your current output profile; OBS scales from the base canvas.</small></div></div><div class="onboarding-confirm-list">${onboardingFlag('canvasConfigured', setup.canvasReady, 'Canvas dimensions confirmed', 'Twitch Alerts, Interaction Alerts, and Chat Overlay use 3440 × 1440 Browser Sources.')}${onboardingFlag('vodRouting', setup.flags.vodRouting === true, 'Interaction audio routed off the VOD track · recommended', 'Keep interaction audio live while excluding it from the recording track uploaded to YouTube.')}</div><div class="onboarding-note"><strong>OBS audio:</strong> enable Control audio via OBS on both alert sources. Keep Twitch Alerts on live + recording tracks; keep claim-prone Interaction Alerts off the YouTube/VOD track.</div></div>`;
    } else {
      const allReady = setup.readyCount === onboardingSteps.length;
      markup = `<div class="onboarding-complete"><i>${allReady ? '✓' : `${setup.readyCount}/${onboardingSteps.length}`}</i><h3>${allReady ? 'Studio is ready for an on-air test' : 'Finish the remaining checks when ready'}</h3><p>${allReady ? 'Your broadcaster, bot, sources, canvas, and live route have all been confirmed.' : 'You can finish for now and reopen this guide from Studio Home. The status card will continue showing anything that needs attention.'}</p></div><div class="onboarding-check-grid">${setupCheckCard(setup.liveTestReady, 'Command or alert received', setup.liveTestReady ? `${state.chatbot?.commandsTriggered || 0} live chatbot command${Number(state.chatbot?.commandsTriggered || 0) === 1 ? '' : 's'} processed.` : 'Send !song in Twitch chat or preview an alert.')}${setupCheckCard(Boolean(state.safety?.armed), 'Interaction safety armed', state.safety?.armed ? 'Viewer triggers are allowed.' : 'Arm interactions before testing viewer-triggered actions.')}${setupCheckCard(Boolean(state.visualAlerts?.queue) && !state.visualAlerts?.queue?.active, 'Alert queue standing by', state.visualAlerts?.queue?.active ? `Currently playing ${state.visualAlerts.queue.active.name}.` : 'The shared queue is idle and ready.')}${setupCheckCard(Boolean(state.health), 'Bridge online', state.health ? 'Local services are responding.' : 'Bridge connection needs attention.')}</div><div class="onboarding-actions"><button class="secondary-button" type="button" data-onboarding-go="chatbot">Test a Command</button><button class="secondary-button" type="button" data-onboarding-go="visualalerts">Preview Twitch Alert</button><button class="secondary-button" type="button" data-onboarding-go="soundalerts">Test Interaction Alert</button></div><div class="onboarding-confirm-list">${onboardingFlag('alertTested', setup.liveTestReady, 'I completed a real command or alert test', 'This may be detected automatically when Studio processes a live chatbot command.')}</div>`;
    }
    $('#onboardingContent').innerHTML = markup;
    $('#onboardingBack').disabled = onboardingStep === 0;
    $('#onboardingNext').textContent = onboardingStep === onboardingSteps.length - 1 ? (setup.readyCount === onboardingSteps.length ? 'Finish Setup' : 'Finish for Now') : 'Next';
    $('#onboardingFooterStatus').textContent = `${setup.readyCount} of ${onboardingSteps.length} essential checks ready · settings save as you go`;
  }

  function openOnboarding({ firstIncomplete = false } = {}) {
    const dialog = $('#onboardingDialog');
    if (firstIncomplete) {
      const setup = onboardingStatus();
      const incomplete = setup.checks.findIndex((ready) => !ready);
      onboardingStep = incomplete < 0 ? 0 : incomplete;
    } else onboardingStep = 0;
    renderOnboarding();
    if (!dialog.open) dialog.showModal();
  }

  function finishOnboarding() {
    writeOnboardingPreferences({ completed: true, completedAt: new Date().toISOString() });
    $('#onboardingDialog').close();
    renderOnboardingSummary();
    toast(onboardingStatus().readyCount === onboardingSteps.length ? 'First-run setup complete.' : 'Setup progress saved. Reopen it from Studio Home anytime.');
  }

  function renderWorkflows() {
    const grid = $('#workflowGrid');
    grid.classList.toggle('empty-state', !state.workflows.length);
    if (!state.workflows.length) return grid.textContent = 'No workflows registered.';
    grid.innerHTML = state.workflows.map((workflow) => {
      const latest = state.runs.find((run) => run.workflowId === workflow.id);
      const running = latest && activeRun(latest);
      const cooldowns = workflow.cooldowns || {};
      return `<article class="workflow-card ${running ? 'running' : ''}">
        <div class="workflow-heading"><div><p>${escapeHtml(workflow.trigger.type)} · ${escapeHtml(workflow.trigger.action)}</p><h3>${escapeHtml(workflow.name)}</h3></div><span class="state-chip ${running ? 'running' : workflow.enabled ? 'installed' : 'disabled'}">${running ? remainingLabel(latest.endsAt) : workflow.enabled ? 'READY' : 'DISABLED'}</span></div>
        <p class="card-description">${escapeHtml(workflow.description || 'Tempest interaction workflow.')}</p>
        <div class="cooldown-row"><span>VIEWER ${durationLabel(cooldowns.viewerMs)}</span><span>EFFECT ${durationLabel(cooldowns.effectMs)}</span><span>GLOBAL ${durationLabel(cooldowns.globalMs)}</span></div>
        <div class="workflow-actions">${workflow.actions.map((action, index) => `<div><b>${String(index + 1).padStart(2, '0')}</b><i class="action-state ${escapeHtml(runActionState(latest, action.id))}"></i><span><strong>${escapeHtml(action.name)}</strong><small>${escapeHtml(targetNames[action.target] || action.target)} · ${escapeHtml(action.capability)}${action.releaseCapability ? ` → ${escapeHtml(action.releaseCapability)}` : ''}</small></span><code>${action.lease?.durationInput ? `${escapeHtml(action.lease.durationInput)} ≤ ${durationLabel(action.lease.durationMs)}` : action.lease ? durationLabel(action.lease.durationMs) : 'ONCE'}</code></div>`).join('')}</div>
        <div class="workflow-footer"><span>${workflow.actions.length} coordinated actions · ${escapeHtml(workflow.concurrencyGroup || 'independent')}</span><button class="primary-button" data-trigger-workflow="${escapeHtml(workflow.id)}" ${running || !state.safety.armed ? 'disabled' : ''}>${running ? 'Running' : 'Simulate Event'}</button></div>
      </article>`;
    }).join('');
  }

  function filteredEvents() {
    const query = $('#eventSearch').value.trim().toLowerCase();
    const level = $('#eventLevelFilter').value;
    return state.events.filter((event) => {
      const searchable = [event.message, event.type, event.workflowId, event.target].join(' ').toLowerCase();
      return (!query || searchable.includes(query)) && (!level || event.level === level);
    });
  }

  function renderEvents() {
    $('#eventCountBadge').textContent = `${state.events.length} EVENT${state.events.length === 1 ? '' : 'S'}`;
    const events = filteredEvents();
    const timeline = $('#eventTimeline');
    timeline.classList.toggle('empty-state', !events.length);
    if (!events.length) return timeline.textContent = state.events.length ? 'No events match the current filters.' : 'No runtime events recorded.';
    timeline.innerHTML = events.map((event) => `<article class="event-record ${escapeHtml(event.level)}"><i></i><time>${new Date(event.timestamp).toLocaleTimeString()}</time><div><strong>${escapeHtml(event.message)}</strong><small>${escapeHtml(event.type)}${event.target ? ` · ${escapeHtml(targetNames[event.target] || event.target)}` : ''}</small></div><code>${escapeHtml(event.level)}</code></article>`).join('');
  }

  function soundAlertAudioName(uri) {
    if (!uri) return 'No local audio assigned';
    try {
      const pathname = decodeURIComponent(new URL(uri).pathname);
      return pathname.split('/').filter(Boolean).at(-1) || 'Local audio assigned';
    } catch { return 'Local audio assigned'; }
  }

  function soundAlertVisualName(uri) {
    if (!uri) return 'No local visual assigned';
    try {
      const pathname = decodeURIComponent(new URL(uri).pathname);
      return pathname.split('/').filter(Boolean).at(-1) || 'Local visual assigned';
    } catch { return 'Local visual assigned'; }
  }

  function broadcastSourceInventory() {
    const connection = state.connections.find((entry) => entry.applicationId === 'com.tempestmainframe.tempest-broadcast');
    const inventory = connection?.status?.sourceInventory;
    return {
      connected: Boolean(connection),
      currentScene: typeof inventory?.currentScene === 'string' ? inventory.currentScene : '',
      audio: Array.isArray(inventory?.audio) ? inventory.audio.filter((entry) => typeof entry === 'string') : [],
      visual: Array.isArray(inventory?.visual) ? inventory.visual.filter((entry) => typeof entry === 'string') : []
    };
  }

  function soundAlertOptions(values, selected) {
    return values.map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${value.toUpperCase()}</option>`).join('');
  }

  function renderSoundAlerts() {
    const alerts = state.soundAlerts?.alerts || [];
    const inventory = broadcastSourceInventory();
    $('#soundAlertCount').textContent = alerts.length;
    $('#soundAlertEnabledCount').textContent = alerts.filter((alert) => alert.enabled).length;
    $('#soundAlertAudioCount').textContent = alerts.filter((alert) => alert.audioUri).length;
    $('#soundAlertVisualCount').textContent = alerts.filter((alert) => alert.visualUri).length;
    const grid = $('#soundAlertGrid');
    const inventoryStatus = $('#soundAlertBroadcastInventory');
    inventoryStatus.innerHTML = inventory.connected
      ? `<strong>Broadcast route:</strong> Audio and visuals use the dedicated Interaction Alert Browser Source. ${inventory.audio.length} audio and ${inventory.visual.length} visual OBS sources are available as optional overrides${inventory.currentScene ? ` in ${escapeHtml(inventory.currentScene)}` : ''}.`
      : '<strong>Broadcast route:</strong> Audio and visuals use the dedicated Interaction Alert Browser Source. The optional Broadcast command adapter is currently offline.';
    grid.classList.toggle('empty-state', !alerts.length);
    if (!alerts.length) return grid.textContent = 'No Interaction Alerts are configured.';
    const audioOptions = inventory.audio.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
    const visualOptions = inventory.visual.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
    grid.innerHTML = `<datalist id="broadcastAudioSourceOptions">${audioOptions}</datalist><datalist id="visualAlertBroadcastSourceOptions">${visualOptions}</datalist>` + alerts.map((alert) => `<article class="sound-alert-card interaction-alert-card ${alert.enabled ? '' : 'disabled'}" style="--alert-accent:${escapeHtml(alert.accent || '#54f2eb')}">
      <div class="sound-alert-head"><div><span class="copyable-value">${escapeHtml(alert.id)}${copyButton(alert.id, 'interaction alert ID')}</span><h3>${escapeHtml(alert.name)}</h3></div><div class="card-head-actions"><b>${alert.enabled ? (alert.custom ? 'CUSTOM' : 'READY') : 'OFF'}</b>${alert.custom ? `<button class="card-delete-button" data-delete-interaction-alert="${escapeHtml(alert.id)}" title="Delete custom Interaction Alert" aria-label="Delete ${escapeHtml(alert.name)}">×</button>` : ''}</div></div>
      <div class="sound-alert-cue"><span>${alert.warudoEnabled ? 'WARUDO + OVERLAY' : 'OVERLAY'}</span><span>${durationLabel(alert.visualDurationMs)}</span></div>
      <div class="alert-media-summary">
        <div class="alert-media-slot"><span>SOUND</span><strong>${escapeHtml(soundAlertAudioName(alert.audioUri))}</strong></div>
        <div class="alert-media-slot"><span>VISUAL</span><strong>${escapeHtml(soundAlertVisualName(alert.visualUri))}</strong></div>
      </div>
      <div class="sound-alert-settings interaction-primary-settings">
        <label>Display duration <span><input data-visual-alert-duration="${escapeHtml(alert.id)}" type="number" min="1" max="60" value="${Math.round((alert.visualDurationMs || 6000) / 1000)}" /> sec</span></label>
        <label>Volume <span><input data-alert-volume="${escapeHtml(alert.id)}" type="number" min="0" max="100" value="${Math.round(alert.volume * 100)}" /> %</span></label>
        <label>Alert accent <input data-visual-alert-accent="${escapeHtml(alert.id)}" type="color" value="${escapeHtml(alert.accent || '#54f2eb')}" /></label>
      </div>
      <label class="interaction-integration-toggle compact"><input data-alert-warudo-enabled="${escapeHtml(alert.id)}" type="checkbox" ${alert.warudoEnabled ? 'checked' : ''} /><span><strong>Use Warudo</strong><small>Trigger an avatar performance with this alert.</small></span></label>
      <div class="interaction-integration-options card-options" data-alert-warudo-options="${escapeHtml(alert.id)}" ${alert.warudoEnabled ? '' : 'hidden'}>
        <span>WARUDO PERFORMANCE</span>
        <div class="sound-alert-cue"><span class="copyable-value"><code>${escapeHtml(alert.cue)}</code>${copyButton(alert.cue, 'Warudo cue')}</span><label>Length <span><input data-alert-duration="${escapeHtml(alert.id)}" type="number" min="1" max="60" value="${Math.round(alert.durationMs / 1000)}" /> sec</span></label></div>
      </div>
      <details class="interaction-routing-details"><summary>Request + Broadcast routing</summary><div class="alert-settings-groups">
        <div class="alert-settings-group"><span>REQUEST</span><div class="sound-alert-settings">
          <label>Viewer cooldown <span><input data-alert-viewer-cooldown="${escapeHtml(alert.id)}" type="number" min="0" max="86400" value="${Math.round(alert.viewerCooldownMs / 1000)}" /> sec</span></label>
          <label>Global cooldown <span><input data-alert-global-cooldown="${escapeHtml(alert.id)}" type="number" min="0" max="86400" value="${Math.round(alert.globalCooldownMs / 1000)}" /> sec</span></label>
          <label>Separate OBS audio <input data-alert-broadcast-audio="${escapeHtml(alert.id)}" list="broadcastAudioSourceOptions" maxlength="128" placeholder="Optional override" value="${escapeHtml(alert.broadcastAudioSource || '')}" /></label>
        </div></div>
        <div class="alert-settings-group"><span>BROADCAST REACTION</span><div class="sound-alert-settings">
          <label>Additional OBS visual <input data-visual-alert-broadcast-source="${escapeHtml(alert.id)}" list="visualAlertBroadcastSourceOptions" maxlength="128" placeholder="Optional source" value="${escapeHtml(alert.broadcastVisualSource || '')}" /></label>
          <label>HUD effect <select data-visual-alert-effect="${escapeHtml(alert.id)}">${soundAlertOptions(['pulse', 'glow', 'glitch', 'spectrum', 'surge'], alert.broadcastEffect || 'spectrum')}</select></label>
          <label>HUD circuit <select data-visual-alert-circuit="${escapeHtml(alert.id)}">${soundAlertOptions(['all', 'core', 'frame', 'chat', 'plates', 'alerts'], alert.broadcastCircuit || 'all')}</select></label>
          <label>Effect strength <span><input data-visual-alert-strength="${escapeHtml(alert.id)}" type="number" min="5" max="150" value="${Math.round((alert.broadcastEffectStrength || 1) * 100)}" /> %</span></label>
        </div></div>
      </div></details>
      <div class="sound-alert-actions interaction-alert-actions"><button data-interaction-alert-save="${escapeHtml(alert.id)}">Save Alert</button><button data-interaction-alert-design="${escapeHtml(alert.id)}">Customize Design</button><button data-sound-alert-audio="${escapeHtml(alert.id)}">Assign Sound</button><button data-sound-alert-visual="${escapeHtml(alert.id)}">Assign Visual</button><button data-sound-alert-toggle="${escapeHtml(alert.id)}">${alert.enabled ? 'Disable' : 'Enable'}</button><button data-visual-alert-preview="${escapeHtml(alert.id)}">Preview Alert</button><button class="primary-button" data-sound-alert-trigger="${escapeHtml(alert.id)}" ${!alert.enabled || !state.safety.armed ? 'disabled' : ''}>Test Interaction</button></div>
    </article>`).join('');
  }

  function renderVisualAlertStatus() {
    const outputs = state.visualAlerts;
    const twitch = outputs?.twitch;
    const interaction = outputs?.interaction;
    const queue = outputs?.queue;
    const queueMarkup = queue
      ? `<strong>Alert Queue:</strong> ${queue.active ? `Playing ${escapeHtml(queue.active.name)} · ` : 'Idle · '}${queue.waitingCount} waiting / ${queue.maximumWaiting} max${queue.waitingCount ? ' <button class="inline-note-button" data-alert-queue-clear="true">Clear Waiting</button>' : ''}`
      : '<strong>Alert Queue:</strong> Studio is preparing the shared playback queue.';
    $('#interactionAlertQueueStatus').innerHTML = queueMarkup;
    $('#twitchAlertQueueStatus').innerHTML = queueMarkup;
    $('#visualAlertStateBadge').textContent = twitch?.state === 'showing' ? 'ALERT ACTIVE' : 'TWITCH SOURCE READY';
    $('#visualAlertStateBadge').classList.toggle('offline', !twitch);
    $('#visualAlertOverlayStatus').innerHTML = twitch
      ? `<strong>Twitch Alert source:</strong> <span class="copyable-value"><code>${escapeHtml(twitch.url)}</code>${copyButton(twitch.url, 'Twitch Alert browser-source URL')}</span> · ${twitch.connectedClients ? `${twitch.connectedClients} connected` : 'waiting for Broadcast'} <button class="inline-note-button" data-visual-alert-clear="true" ${outputs.state !== 'showing' ? 'disabled' : ''}>Clear Alerts</button>`
      : '<strong>Twitch Alert source:</strong> Studio is preparing the local overlay.';
    $('#interactionAlertOverlayStatus').innerHTML = interaction
      ? `<strong>Interaction Alert source:</strong> <span class="copyable-value"><code>${escapeHtml(interaction.url)}</code>${copyButton(interaction.url, 'Interaction Alert browser-source URL')}</span> · ${interaction.connectedClients ? `${interaction.connectedClients} connected` : 'waiting for Broadcast'} · route this source off the YouTube/VOD track`
      : '<strong>Interaction Alert source:</strong> Studio is preparing the local overlay.';
  }

  function updateGiphyTargetContext() {
    const target = $('#giphyTargetAlert').value;
    const alert = state.soundAlerts?.alerts?.find((entry) => entry.id === target);
    const summary = $('#giphyTargetSummary');
    if (summary) summary.textContent = alert
      ? `Your selection will be downloaded and assigned to ${alert.name}.`
      : 'Choose an Interaction Alert before selecting a GIF.';
    document.querySelectorAll('[data-giphy-result]').forEach((button) => {
      button.setAttribute('aria-label', `Assign this GIF to ${alert?.name || 'the selected Interaction Alert'}`);
    });
  }

  function renderVisualAlerts() {
    const alerts = state.soundAlerts?.alerts || [];
    const twitchAlerts = state.twitchVisualAlerts?.alerts || [];
    $('#twitchAlertCount').textContent = twitchAlerts.length;
    $('#twitchAlertEnabledCount').textContent = twitchAlerts.filter((alert) => alert.enabled).length;
    $('#twitchAlertAudioCount').textContent = twitchAlerts.filter((alert) => alert.audioUri).length;
    $('#twitchAlertVisualCount').textContent = twitchAlerts.filter((alert) => alert.visualUri).length;
    renderVisualAlertStatus();
    $('#visualProviderBadge').textContent = state.giphy?.configured ? 'LOCAL FILES + GIPHY READY' : 'LOCAL FILES READY · GIPHY KEY REQUIRED';
    $('#visualProviderBadge').classList.toggle('connected', Boolean(state.giphy?.configured));
    $('#giphyStatusBadge').textContent = state.giphy?.configured ? 'CONNECTED' : 'NOT CONNECTED';
    $('#giphyStatusBadge').classList.toggle('disabled', !state.giphy?.configured);
    $('#giphyConnectionCard').classList.toggle('configured', Boolean(state.giphy?.configured));
    $('#giphyConnectionHelp').textContent = state.giphy?.configured
      ? 'Connected. Enter a new key only when you want to replace the saved one.'
      : 'Add a developer API key to enable online search.';
    $('#giphyApiKey').placeholder = state.giphy?.configured ? 'Saved key is encrypted' : 'Enter a key';
    const giphyTarget = $('#giphyTargetAlert');
    const selectedGiphyTarget = giphyTarget.value;
    const targetOptions = alerts.map((alert) => `<option value="${escapeHtml(alert.id)}">${escapeHtml(alert.name)}</option>`).join('');
    if (giphyTarget.innerHTML !== targetOptions) giphyTarget.innerHTML = targetOptions;
    if (alerts.some((alert) => alert.id === selectedGiphyTarget)) giphyTarget.value = selectedGiphyTarget;
    else if (alerts[0]) giphyTarget.value = alerts[0].id;
    updateGiphyTargetContext();
    const twitchGrid = $('#twitchVisualAlertGrid');
    twitchGrid.classList.toggle('empty-state', !twitchAlerts.length);
    twitchGrid.innerHTML = twitchAlerts.length ? twitchAlerts.map((alert) => `<article class="sound-alert-card twitch-alert-card ${alert.enabled ? '' : 'disabled'}" style="--alert-accent:${escapeHtml(alert.accent || '#54f2eb')}">
      <div class="sound-alert-head"><div><span>${escapeHtml(alert.topic)}${alert.variant ? ` · ${escapeHtml(alert.variant)}` : ''}</span><h3>${escapeHtml(alert.name)}</h3></div><div class="card-head-actions"><b>${alert.enabled ? (alert.custom ? 'CUSTOM' : 'LIVE') : 'OFF'}</b>${alert.custom ? `<button class="card-delete-button" data-delete-twitch-alert="${escapeHtml(alert.id)}" title="Delete custom Twitch Alert" aria-label="Delete ${escapeHtml(alert.name)}">×</button>` : ''}</div></div>
      <div class="sound-alert-cue"><span class="copyable-value"><code>${escapeHtml(alert.id)}</code>${copyButton(alert.id, 'Twitch alert ID')}</span><span>${durationLabel(alert.durationMs)}</span></div>
      <div class="alert-media-summary">
        <div class="alert-media-slot"><span>SOUND</span><strong>${escapeHtml(soundAlertAudioName(alert.audioUri))}</strong></div>
        <div class="alert-media-slot"><span>VISUAL</span><strong>${escapeHtml(soundAlertVisualName(alert.visualUri))}</strong></div>
      </div>
      <div class="sound-alert-settings">
        <label>Display duration <span><input data-twitch-visual-duration="${escapeHtml(alert.id)}" type="number" min="1" max="60" value="${Math.round(alert.durationMs / 1000)}" /> sec</span></label>
        <label>Volume <span><input data-twitch-alert-volume="${escapeHtml(alert.id)}" type="number" min="0" max="100" value="${Math.round((alert.volume ?? 0.8) * 100)}" /> %</span></label>
        <label>Alert accent <input data-twitch-visual-accent="${escapeHtml(alert.id)}" type="color" value="${escapeHtml(alert.accent || '#54f2eb')}" /></label>
      </div>
      <div class="sound-alert-actions twitch-alert-actions"><button data-twitch-visual-save="${escapeHtml(alert.id)}">Save Alert</button><button data-twitch-alert-design="${escapeHtml(alert.id)}">Customize Design</button><button data-twitch-alert-audio="${escapeHtml(alert.id)}">Assign Sound</button><button data-twitch-visual-file="${escapeHtml(alert.id)}">Assign Visual</button><button data-twitch-visual-toggle="${escapeHtml(alert.id)}">${alert.enabled ? 'Disable' : 'Enable'}</button><button class="primary-button" data-twitch-visual-preview="${escapeHtml(alert.id)}">Preview Alert</button></div>
    </article>`).join('') : 'No Twitch Alert presets are configured.';
  }

  function renderChatOverlay({ settings = false } = {}) {
    const overlay = state.chatOverlay;
    const configuration = overlay?.settings || {};
    const chatState = state.chatbot?.connections?.chat || 'disconnected';
    $('#chatOverlayClientCount').textContent = overlay?.connectedClients || 0;
    $('#chatOverlayMessageCount').textContent = overlay?.messageCount || 0;
    $('#chatOverlayPositionMetric').textContent = String(configuration.position || 'left').toUpperCase();
    $('#chatOverlayTwitchState').textContent = chatState.toUpperCase();
    $('#chatOverlayStateBadge').textContent = overlay ? 'OVERLAY READY' : 'CHECKING';
    $('#chatOverlayStateBadge').classList.toggle('offline', !overlay);
    $('#chatOverlayBrowserStatus').innerHTML = overlay
      ? `<strong>Browser Source:</strong> <span class="copyable-value"><code>${escapeHtml(overlay.url)}</code>${copyButton(overlay.url, 'Chat Overlay browser-source URL')}</span> · ${overlay.connectedClients ? `${overlay.connectedClients} connected` : 'waiting for Broadcast'}`
      : '<strong>Browser Source:</strong> Studio is preparing the local chat overlay.';
    const messages = overlay?.messages || [];
    const monitor = $('#chatOverlayMessages');
    monitor.classList.toggle('empty-state', !messages.length);
    monitor.innerHTML = messages.length ? messages.slice().reverse().map((message) => `<div class="compact-row"><div><strong>${escapeHtml(message.viewerName)}</strong><small>${escapeHtml(message.text)}</small></div><i class="event-dot"></i></div>`).join('') : 'No chat messages are visible.';
    if (settings && overlay) {
      $('#chatOverlayPosition').value = configuration.position || 'left';
      $('#chatOverlayMaxMessages').value = configuration.maxMessages || 6;
      $('#chatOverlayDuration').value = Math.round((configuration.messageDurationMs || 30000) / 1000);
      $('#chatOverlayOpacity').value = Math.round((configuration.backgroundOpacity || 0.84) * 100);
      $('#chatOverlayAccent').value = configuration.accent || '#54f2eb';
      $('#chatOverlayShowRoles').checked = configuration.showRoles !== false;
    }
  }

  function handleSoundAlertPlayback(command) {
    if (!command || typeof command !== 'object') return;
    if (command.phase === 'stop-all') {
      for (const entry of activeSoundAlertAudio.values()) { clearTimeout(entry.timer); entry.audio.pause(); entry.audio.currentTime = 0; }
      activeSoundAlertAudio.clear();
      return;
    }
    if (command.phase !== 'play' || !command.runId || !command.alert?.audioUri) return;
    const audio = new Audio(command.alert.audioUri);
    audio.volume = Math.max(0, Math.min(1, Number(command.alert.volume) || 0));
    const finish = () => {
      const entry = activeSoundAlertAudio.get(command.runId);
      if (entry?.audio === audio) { clearTimeout(entry.timer); activeSoundAlertAudio.delete(command.runId); }
    };
    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', () => { finish(); toast(`Could not play ${command.alert.name} audio.`, true); }, { once: true });
    const timer = setTimeout(() => { audio.pause(); audio.currentTime = 0; finish(); }, Number(command.alert.durationMs) || 60000);
    activeSoundAlertAudio.set(command.runId, { audio, timer });
    audio.play().catch((error) => { finish(); toast(`Could not play ${command.alert.name}: ${error.message}`, true); });
  }

  function renderSoftware() {
    const grid = $('#applicationGrid');
    grid.classList.remove('empty-state');
    const applicationCards = state.applications.map((application) => {
      const capabilities = [...application.capabilities.provides, ...application.assetTypes.writes].slice(0, 6);
      return `<article class="software-card"><div class="card-top"><div><p>${escapeHtml(application.id)}</p><h3>${escapeHtml(application.name)}</h3></div><span class="state-chip ${escapeHtml(application.state)}">${escapeHtml(application.state)}</span></div><p class="card-description">${escapeHtml(application.description || 'Tempest application registered with the Mainframe.')}</p><div class="tag-list">${capabilities.map((value) => `<span>${escapeHtml(value)}</span>`).join('') || '<span>NO CAPABILITIES</span>'}</div><div class="card-actions">${application.launch ? `<button data-launch="${escapeHtml(application.id)}">Launch</button>` : '<button disabled>No launcher</button>'}${application.manifestPath ? `<button data-reveal="${escapeHtml(application.manifestPath)}">Manifest</button>` : ''}<button class="danger-action" data-remove-application="${escapeHtml(application.id)}">Remove</button></div></article>`;
    }).join('');
    const radio = state.radio || { name: 'Storm Horizon Radio', provider: 'AzuraCast', state: 'unavailable' };
    const song = radio.nowPlaying || {};
    const track = song.artist && song.title ? `${song.artist} — ${song.title}` : song.title || song.text;
    const radioDescription = radio.state === 'online'
      ? `Broadcasting now${track ? `: ${track}` : '.'}`
      : radio.state === 'offline' ? 'The station is currently offline.' : 'Studio could not reach the station status API.';
    const radioAction = radio.publicPlayerUrl
      ? `<button data-radio-player="${escapeHtml(radio.publicPlayerUrl)}">Open Public Player</button>`
      : '<button disabled>Player unavailable</button>';
    const radioCard = `<article class="software-card service-card"><div class="card-top"><div><p>storm-horizon-radio · ${escapeHtml(radio.provider || 'AzuraCast')}</p><h3>${escapeHtml(radio.name || 'Storm Horizon Radio')}</h3></div><span class="state-chip ${escapeHtml(radio.state || 'unavailable')}">${escapeHtml(radio.state || 'unavailable')}</span></div><p class="card-description">${escapeHtml(radioDescription)}</p><div class="tag-list"><span>RADIO SERVICE</span><span>NOW PLAYING</span><span>BROADCAST ASSET</span></div><div class="card-actions">${radioAction}</div></article>`;
    grid.innerHTML = applicationCards + radioCard;
  }

  function filteredAssets() {
    const query = $('#assetSearch').value.trim().toLowerCase();
    const type = $('#assetTypeFilter').value;
    return state.assets.filter((asset) => {
      const searchable = [asset.name, asset.type, asset.producer, ...(asset.tags || [])].join(' ').toLowerCase();
      return (!query || searchable.includes(query)) && (!type || asset.type === type);
    });
  }

  function renderAssets() {
    const types = [...new Set(state.assets.map((asset) => asset.type))].sort();
    const currentType = $('#assetTypeFilter').value;
    $('#assetTypeFilter').innerHTML = '<option value="">All asset types</option>' + types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('');
    if (types.includes(currentType)) $('#assetTypeFilter').value = currentType;
    const assets = filteredAssets();
    const grid = $('#assetGrid');
    grid.classList.toggle('empty-state', !assets.length);
    if (!assets.length) return grid.textContent = state.assets.length ? 'No assets match the current filters.' : 'No assets indexed.';
    grid.innerHTML = assets.map((asset) => `<article class="asset-card"><div class="card-top"><div><p>${escapeHtml(asset.type)}</p><h3>${escapeHtml(asset.name)}</h3></div><span class="state-chip installed">v${escapeHtml(asset.version)}</span></div><p class="card-description">Produced by ${escapeHtml(asset.producer)}</p><div class="tag-list">${(asset.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('') || '<span>UNTAGGED</span>'}</div><div class="card-actions"><button data-reveal-uri="${escapeHtml(asset.uri)}">Show File</button><button class="danger-action" data-remove-asset="${escapeHtml(asset.id)}">Remove</button></div></article>`).join('');
  }

  function renderApi() {
    $('#apiConnectionCount').textContent = state.connections.length;
    const list = $('#connectionList');
    list.classList.toggle('empty-state', !state.connections.length);
    list.innerHTML = state.connections.length ? state.connections.map((connection) => {
      const status = connection.status || {};
      const ready = status.ready !== false;
      const detail = connection.version
        ? `v${escapeHtml(connection.version)} // ${connection.capabilities?.length || 0} capabilities`
        : `Connected ${new Date(connection.connectedAt).toLocaleTimeString()}`;
      const output = status.streaming ? 'STREAMING' : status.recording ? 'RECORDING' : ready ? 'READY' : 'DEGRADED';
      const applicationName = targetNames[connection.applicationId] || connection.applicationId;
      return `<div class="compact-row"><div><strong>${escapeHtml(applicationName)}</strong><small>${escapeHtml(connection.applicationId)} · ${detail}</small></div><code>${output}</code></div>`;
    }).join('') : 'No applications are connected to the Bridge. Workflow simulation remains available.';
    const directory = $('#capabilityDirectory');
    directory.classList.toggle('empty-state', !state.applications.length);
    directory.innerHTML = state.applications.length ? state.applications.map((application) => `<div class="capability-row"><div><strong>${escapeHtml(application.name)}</strong><small>${escapeHtml(application.id)}</small></div><div><small>PROVIDES</small>${application.capabilities.provides.map((value) => `<code>${escapeHtml(value)}</code>`).join('') || '<code>none</code>'}</div><div><small>CONSUMES</small>${application.capabilities.consumes.map((value) => `<code>${escapeHtml(value)}</code>`).join('') || '<code>none</code>'}</div></div>`).join('') : 'Capabilities appear after applications are registered.';
  }

  function renderWarudo() {
    const status = state.warudo;
    if (!status) return;
    const bridgeConnected = status.bridge === 'connected';
    const warudoConnected = status.warudo === 'connected';
    const connected = bridgeConnected && warudoConnected;
    $('#warudoOverallBadge').textContent = connected ? 'CONNECTED' : warudoConnected ? 'STARTING ADAPTER' : 'WARUDO OFFLINE';
    $('#warudoOverallBadge').classList.toggle('offline', !connected);
    $('#warudoAdapterState').textContent = bridgeConnected ? 'Connected to Studio' : String(status.bridge || 'disconnected').replaceAll('-', ' ');
    $('#warudoSocketState').textContent = warudoConnected ? 'Socket connected' : String(status.warudo || 'disconnected').replaceAll('-', ' ');
    $('#warudoStudioLight').classList.add('online');
    $('#warudoAdapterLight').classList.toggle('online', bridgeConnected);
    $('#warudoSocketLight').classList.toggle('online', warudoConnected);
    $('#warudoEndpoint').textContent = status.endpoint || 'ws://localhost:4770/';
    $('#warudoAction').textContent = status.action || 'tempestPerformance';
    $('#warudoLastCue').textContent = status.lastCue || 'None yet';
    $('#warudoStatusMessage').textContent = status.lastError || (connected
      ? 'Studio and Warudo are connected. Complete the blueprint receiver steps below, then test a Sound Alert.'
      : warudoConnected ? 'Warudo is reachable; the adapter is finishing its connection to Studio.'
        : 'Open Warudo and load your scene. Studio retries this local connection automatically.');
  }

  function renderTwitch() {
    const twitch = state.twitch;
    if (!twitch) return;
    const label = (value) => String(value || 'unknown').replaceAll('-', ' ').toUpperCase();
    $('#twitchOauthState').textContent = label(twitch.oauth?.state);
    $('#twitchEventSubState').textContent = label(twitch.connections?.eventSub);
    $('#twitchChatState').textContent = label(twitch.connections?.chat);
    $('#twitchExtensionRelayState').textContent = label(twitch.connections?.extensionRelay);
    $('#twitchLastEvent').textContent = twitch.lastEventAt ? new Date(twitch.lastEventAt).toLocaleTimeString() : 'NEVER';
    $('#twitchEventCounts').textContent = `${twitch.acceptedEvents || 0} accepted · ${twitch.duplicateEvents || 0} duplicates`;
    const oauthState = twitch.oauth?.state || 'not-configured';
    const authorized = oauthState === 'authorized';
    const account = twitch.oauth?.account;
    $('#twitchAccountBadge').textContent = account ? `@${account.login}` : label(oauthState);
    $('#twitchAccountBadge').classList.toggle('offline', !authorized);
    if (document.activeElement !== $('#twitchClientId')) $('#twitchClientId').value = twitch.clientId || '';
    if (document.activeElement !== $('#twitchRewardMappings')) {
      $('#twitchRewardMappings').value = Object.entries(twitch.rewardMappings || {}).map(([rewardId, action]) => `${rewardId} = ${action}`).join('\n');
    }
    $('#twitchScopeList').innerHTML = (twitch.oauth?.scopes || []).map((scope) => `<code>${escapeHtml(scope)}</code>`).join('');
    $('#connectTwitchButton').disabled = !twitch.configured || twitch.oauth?.storage === 'unavailable' || authorized || oauthState === 'authorization-pending';
    $('#validateTwitchButton').disabled = !authorized;
    $('#disconnectTwitchButton').disabled = !authorized && oauthState !== 'error';
    const device = state.twitchDeviceAuthorization;
    $('#twitchDeviceAuthorization').classList.toggle('hidden', !device);
    if (device) $('#twitchDeviceCode').textContent = device.userCode;
    $('#twitchSetupMessage').textContent = twitch.extensionRelayError || twitch.lastError || (authorized
      ? `Authorized as @${account?.login || 'Twitch user'}. Extension relay: ${label(twitch.connections?.extensionRelay)}.`
      : oauthState === 'authorization-pending' ? 'Waiting for authorization on Twitch…'
        : twitch.configured ? 'Configuration saved. Connect Twitch to authorize interaction scopes.'
          : 'Save a public Twitch application client ID to begin.');
    const topics = twitch.normalizedTopics || [];
    const directory = $('#twitchTopicDirectory');
    directory.classList.toggle('empty-state', !topics.length);
    directory.innerHTML = topics.length ? topics.map((topic) => `<code>${escapeHtml(topic)}</code>`).join('') : 'No topics advertised.';
    renderLocalExtension();
  }

  function renderChatbot() {
    const chatbot = state.chatbot;
    if (!chatbot) return;
    const label = (value) => String(value || 'unknown').replaceAll('-', ' ').toUpperCase();
    const authorized = chatbot.oauth?.state === 'authorized';
    const connected = chatbot.connections?.eventSub === 'connected' && chatbot.connections?.chat === 'connected';
    const account = chatbot.oauth?.account;
    const botName = chatbot.botName || account?.login || 'Chat Bot';
    $('#chatbotOverallBadge').textContent = connected ? 'ONLINE' : authorized ? 'WAITING FOR CHAT' : 'NOT CONNECTED';
    $('#chatbotOverallBadge').classList.toggle('offline', !connected);
    $('#chatbotIdentityMetric').textContent = botName.toUpperCase();
    $('#chatbotEventSubMetric').textContent = label(chatbot.connections?.eventSub);
    $('#chatbotChatMetric').textContent = label(chatbot.connections?.chat);
    $('#chatbotCommandCount').textContent = (chatbot.commands || []).length;
    $('#chatbotCommandCountNote').textContent = `${(chatbot.commands || []).filter((command) => command.enabled).length} enabled`;
    $('#chatbotTriggerCount').textContent = chatbot.commandsTriggered || 0;
    $('#chatbotLastMessage').textContent = chatbot.lastMessageAt ? `Last message ${new Date(chatbot.lastMessageAt).toLocaleTimeString()}` : 'No messages received';
    $('#chatbotAccountBadge').textContent = account ? `@${account.login}` : label(chatbot.oauth?.state);
    $('#chatbotAccountBadge').classList.toggle('offline', !authorized);
    $('#chatbotIdentityTitle').textContent = account ? `${botName} · @${account.login}` : `Connect ${botName}`;
    $('#chatbotVerifiedIdentity').classList.toggle('hidden', !account);
    if (account) $('#chatbotVerifiedLogin').textContent = `@${account.login}`;
    const displayNameInput = $('#chatbotDisplayName');
    if (document.activeElement !== displayNameInput) displayNameInput.value = chatbot.configuredName || '';
    $('#connectChatbotButton').disabled = !state.twitch?.configured || authorized || chatbot.oauth?.state === 'authorization-pending' || chatbot.oauth?.storage === 'unavailable';
    $('#validateChatbotButton').disabled = !authorized;
    $('#disconnectChatbotButton').disabled = !authorized && chatbot.oauth?.state !== 'error';
    $('#chatbotSetupMessage').textContent = chatbot.lastError || (connected
      ? `${botName} (@${account?.login || 'Twitch user'}) is listening and replying in @${chatbot.channel?.login || 'your channel'}.`
      : authorized ? `Bot authorized as @${account?.login || 'Twitch user'}. Authorize the broadcaster in Twitch Gateway to attach the channel.`
        : state.twitch?.oauth?.state !== 'authorized' ? 'Authorize the broadcaster in Twitch Gateway first.'
          : chatbot.oauth?.state === 'authorization-pending' ? 'Bot activation is pending. Sign into the secondary Twitch account in the isolated window.'
            : 'Connect a secondary Twitch user account with the isolated sign-in.');
    const device = state.chatbotDeviceAuthorization;
    $('#chatbotDeviceAuthorization').classList.toggle('hidden', !device);
    if (device) $('#chatbotDeviceCode').textContent = device.userCode;
    if (document.activeElement !== $('#chatbotPrefix')) $('#chatbotPrefix').value = chatbot.prefix || '!';
    $('#chatbotPrefixLabel').textContent = chatbot.prefix || '!';

    const workflowSelect = $('#chatbotCommandWorkflow');
    const selectedWorkflow = workflowSelect.value;
    workflowSelect.innerHTML = '<option value="">No workflow — chat response only</option>' + state.workflows.map((workflow) => `<option value="${escapeHtml(workflow.id)}">${escapeHtml(workflow.name)}${workflow.enabled ? '' : ' (disabled)'}</option>`).join('');
    if (state.workflows.some((workflow) => workflow.id === selectedWorkflow)) workflowSelect.value = selectedWorkflow;

    const commands = chatbot.commands || [];
    const list = $('#chatbotCommandList');
    list.classList.toggle('empty-state', !commands.length);
    list.innerHTML = commands.length ? commands.map((command) => `<button class="chatbot-command-row ${command.enabled ? '' : 'disabled'}" data-chatbot-command="${escapeHtml(command.id)}"><span><strong>${escapeHtml(chatbot.prefix || '!')}${escapeHtml(command.name)}</strong><small>${escapeHtml(command.permission)} · ${command.allowSharedChat ? 'shared chat' : 'home chat only'} · viewer ${durationLabel(command.viewerCooldownMs)} · global ${durationLabel(command.globalCooldownMs)}</small></span><span>${command.handler === 'seattle-weather' ? 'SEATTLE WEATHER' : command.handler === 'radio-now-playing' ? 'NOW PLAYING' : command.workflowId ? 'WORKFLOW' : 'REPLY'}${command.response && (command.workflowId || command.handler) ? ' + REPLY' : ''}</span></button>`).join('') : 'No chatbot commands configured.';

    const activity = chatbot.activity || [];
    const activityList = $('#chatbotActivity');
    activityList.classList.toggle('empty-state', !activity.length);
    activityList.innerHTML = activity.length ? activity.slice(0, 10).map((entry) => `<div class="compact-row event-${escapeHtml(entry.state === 'accepted' ? 'success' : entry.state === 'error' ? 'error' : 'warning')}"><div><strong>${escapeHtml(entry.message)}</strong><small>${new Date(entry.timestamp).toLocaleTimeString()}${entry.command ? ` · ${escapeHtml(chatbot.prefix || '!')}${escapeHtml(entry.command)}` : ''}${entry.sharedChat ? ` · via @${escapeHtml(entry.sourceChannelLogin || 'shared-chat-participant')}` : ''}</small></div><i class="event-dot"></i></div>`).join('') : 'No chatbot activity recorded.';
  }

  function renderLocalExtension() {
    const local = state.localExtension || {};
    const accountChannelId = state.twitch?.oauth?.account?.userId || '';
    const channelInput = $('#localExtensionChannelId');
    if (document.activeElement !== channelInput && !channelInput.value.trim()) channelInput.value = local.channelId || accountChannelId;
    $('#localExtensionBadge').textContent = local.running ? 'RUNNING' : 'STOPPED';
    $('#localExtensionBadge').classList.toggle('offline', !local.running);
    $('#localExtensionSecretState').textContent = local.secretStored ? 'WINDOWS ENCRYPTED' : 'NOT STORED';
    $('#localExtensionCertificateState').textContent = local.certificateAvailable ? 'CERT FILE READY' : 'NOT READY';
    $('#localExtensionChannelState').textContent = local.channelId || accountChannelId || '—';
    $('#localExtensionPanelUrl').textContent = local.panelUrl || 'https://localhost:8080/panel.html';
    $('#localExtensionSecret').placeholder = local.secretStored ? 'Stored securely; leave blank to reuse' : 'Paste once; stored with Windows encryption';
    $('#startLocalExtension').disabled = Boolean(local.running) || !Boolean(local.certificateAvailable);
    $('#stopLocalExtension').disabled = !local.running;
    $('#openLocalExtensionPanel').disabled = !local.running;
    $('#prepareLocalExtensionCertificate').disabled = Boolean(local.running);
    $('#forgetLocalExtensionSecret').disabled = !local.secretStored && !local.running;
    $('#localExtensionMessage').textContent = local.lastError || (local.running
      ? 'Your single-channel Extension services are running. Refresh the installed Twitch panel to send signals into Studio.'
      : !local.certificateAvailable ? 'Prepare the trusted localhost certificate once, then start the Local Panel.'
        : local.secretStored ? 'The Extension secret is stored with Windows encryption. Start the Local Panel whenever you want to test it.'
          : 'Paste the revealed Extension Secret once. Studio will encrypt it and start the panel services without PowerShell.');
  }

  function parseRewardMappings() {
    return Object.fromEntries($('#twitchRewardMappings').value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const separator = line.indexOf('=');
      if (separator < 1) throw new Error(`Invalid reward mapping: ${line}`);
      const rewardId = line.slice(0, separator).trim();
      const action = line.slice(separator + 1).trim();
      if (!rewardId || !/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/.test(action)) throw new Error(`Invalid reward mapping: ${line}`);
      return [rewardId, action];
    }));
  }

  async function saveTwitchConfiguration({ quiet = false } = {}) {
    const clientId = $('#twitchClientId').value.trim();
    const scopes = state.twitch?.oauth?.scopes || [];
    const configured = await api('/v1/integrations/twitch/configuration', { method: 'POST', body: { clientId, scopes, rewardMappings: parseRewardMappings() } });
    state.twitch = configured;
    renderTwitch();
    if (!quiet) toast('Twitch interaction configuration saved.');
    return configured;
  }

  function scheduleTwitchPoll(delaySeconds) {
    clearTimeout(twitchPollTimer);
    twitchPollTimer = setTimeout(pollTwitchAuthorization, Math.max(1, Number(delaySeconds) || 5) * 1000);
  }

  async function pollTwitchAuthorization() {
    try {
      const result = await api('/v1/integrations/twitch/oauth/poll', { method: 'POST', body: {} });
      state.twitch = result.status;
      if (result.pending) scheduleTwitchPoll(result.retryAfterSeconds || state.twitchDeviceAuthorization?.intervalSeconds || 5);
      else {
        state.twitchDeviceAuthorization = null;
        toast(result.status.oauth?.state === 'authorized' ? 'Twitch authorization complete.' : 'Twitch authorization expired.', result.status.oauth?.state !== 'authorized');
      }
      renderTwitch();
    } catch (error) {
      state.twitchDeviceAuthorization = null;
      await refresh({ quiet: true });
      toast(error.message, true);
    }
  }

  async function connectTwitch() {
    try {
      await saveTwitchConfiguration({ quiet: true });
      const authorization = await api('/v1/integrations/twitch/oauth/device', { method: 'POST', body: {} });
      state.twitchDeviceAuthorization = authorization;
      state.twitch.oauth.state = 'authorization-pending';
      renderTwitch();
      await window.tempestStudio.openExternal(authorization.verificationUri);
      scheduleTwitchPoll(authorization.intervalSeconds);
      toast('Twitch activation opened in your browser.');
    } catch (error) { toast(error.message, true); }
  }

  async function validateTwitch() {
    try {
      state.twitch = await api('/v1/integrations/twitch/oauth/validate', { method: 'POST', body: {} });
      renderTwitch();
      toast('Twitch token is valid.');
    } catch (error) { await refresh({ quiet: true }); toast(error.message, true); }
  }

  async function disconnectTwitch() {
    if (!confirm('Disconnect Twitch interaction services and remove the encrypted tokens from this device?')) return;
    try {
      clearTimeout(twitchPollTimer);
      state.twitchDeviceAuthorization = null;
      state.twitch = await api('/v1/integrations/twitch/oauth', { method: 'DELETE', body: {} });
      renderTwitch();
      toast('Twitch interaction services disconnected.');
    } catch (error) { toast(error.message, true); }
  }

  function scheduleChatbotPoll(delaySeconds) {
    clearTimeout(chatbotPollTimer);
    chatbotPollTimer = setTimeout(pollChatbotAuthorization, Math.max(1, Number(delaySeconds) || 5) * 1000);
  }

  async function pollChatbotAuthorization() {
    try {
      const result = await api('/v1/chatbot/oauth/poll', { method: 'POST', body: {} });
      state.chatbot = result.status;
      if (result.pending) scheduleChatbotPoll(result.retryAfterSeconds || state.chatbotDeviceAuthorization?.intervalSeconds || 5);
      else {
        await window.tempestStudio.closeIsolatedTwitchAuthorization().catch(() => 0);
        state.chatbotDeviceAuthorization = null;
        toast(result.status.oauth?.state === 'authorized' ? `${result.status.botName || 'Chatbot'} authorization complete.` : 'Chatbot authorization expired.', result.status.oauth?.state !== 'authorized');
      }
      renderChatbot();
    } catch (error) {
      state.chatbotDeviceAuthorization = null;
      await refresh({ quiet: true });
      toast(error.message, true);
    }
  }

  async function connectChatbot() {
    try {
      if (state.twitch?.oauth?.state !== 'authorized') throw new Error('Authorize your broadcaster account in Twitch Gateway first.');
      await saveChatbotIdentity({ quiet: true });
      const authorization = await api('/v1/chatbot/oauth/device', { method: 'POST', body: {} });
      state.chatbotDeviceAuthorization = authorization;
      state.chatbot.oauth.state = 'authorization-pending';
      renderChatbot();
      scheduleChatbotPoll(authorization.intervalSeconds);
      try {
        await window.tempestStudio.openIsolatedTwitchAuthorization(authorization.verificationUri);
        toast('Isolated Twitch sign-in opened for the bot account.');
      } catch (error) {
        toast(`Activation code is ready. ${error.message}`, true);
      }
    } catch (error) { toast(error.message, true); }
  }

  async function openChatbotIsolatedAuthorization() {
    const authorization = state.chatbotDeviceAuthorization;
    if (!authorization) return;
    try {
      await window.tempestStudio.openIsolatedTwitchAuthorization(authorization.verificationUri);
      toast('Isolated Twitch sign-in opened for the bot account.');
    } catch (error) { toast(error.message, true); }
  }

  async function validateChatbot() {
    try {
      state.chatbot = await api('/v1/chatbot/oauth/validate', { method: 'POST', body: {} });
      renderChatbot();
      toast(`${state.chatbot.botName || 'Chatbot'} token is valid.`);
    } catch (error) { await refresh({ quiet: true }); toast(error.message, true); }
  }

  async function disconnectChatbot() {
    const botName = state.chatbot?.botName || 'the bot account';
    if (!confirm(`Disconnect ${botName} and remove its encrypted tokens from this device? Commands and the display name will remain saved.`)) return;
    try {
      clearTimeout(chatbotPollTimer);
      await window.tempestStudio.closeIsolatedTwitchAuthorization().catch(() => 0);
      state.chatbotDeviceAuthorization = null;
      state.chatbot = await api('/v1/chatbot/oauth', { method: 'DELETE', body: {} });
      renderChatbot();
      toast(`${botName} disconnected. Saved commands were preserved.`);
    } catch (error) { toast(error.message, true); }
  }

  async function saveChatbotIdentity({ quiet = false } = {}) {
    try {
      state.chatbot = await api('/v1/chatbot/configuration', { method: 'POST', body: { displayName: $('#chatbotDisplayName').value } });
      renderChatbot();
      if (!quiet) toast(state.chatbot.configuredName ? `Chatbot name saved as ${state.chatbot.configuredName}.` : 'Chatbot will use the verified Twitch username.');
      return state.chatbot;
    } catch (error) {
      renderChatbot();
      if (!quiet) toast(error.message, true);
      if (quiet) throw error;
      return null;
    }
  }

  function resetChatbotCommandForm() {
    $('#chatbotCommandId').value = '';
    $('#chatbotCommandName').value = '';
    $('#chatbotCommandAliases').value = '';
    $('#chatbotCommandPermission').value = 'everyone';
    $('#chatbotCommandResponse').value = '';
    $('#chatbotCommandHandler').value = '';
    $('#chatbotCommandWorkflow').value = '';
    $('#chatbotViewerCooldown').value = '15';
    $('#chatbotGlobalCooldown').value = '3';
    $('#chatbotCommandEnabled').checked = true;
    $('#chatbotReplyToViewer').checked = false;
    $('#chatbotAllowSharedChat').checked = true;
    $('#chatbotEditorTitle').textContent = 'Create a command';
    $('#deleteChatbotCommand').disabled = true;
  }

  function editChatbotCommand(id) {
    const command = state.chatbot?.commands?.find((entry) => entry.id === id);
    if (!command) return;
    $('#chatbotCommandId').value = command.id;
    $('#chatbotCommandName').value = command.name;
    $('#chatbotCommandAliases').value = command.aliases.join(', ');
    $('#chatbotCommandPermission').value = command.permission;
    $('#chatbotCommandResponse').value = command.response || '';
    $('#chatbotCommandHandler').value = command.handler || '';
    $('#chatbotCommandWorkflow').value = command.workflowId || '';
    $('#chatbotViewerCooldown').value = String(Math.round(command.viewerCooldownMs / 1000));
    $('#chatbotGlobalCooldown').value = String(Math.round(command.globalCooldownMs / 1000));
    $('#chatbotCommandEnabled').checked = command.enabled;
    $('#chatbotReplyToViewer').checked = command.replyToViewer === true;
    $('#chatbotAllowSharedChat').checked = command.allowSharedChat === true;
    $('#chatbotEditorTitle').textContent = `Edit ${state.chatbot.prefix || '!'}${command.name}`;
    $('#deleteChatbotCommand').disabled = false;
    $('#chatbotCommandName').focus();
  }

  async function saveChatbotCommand(event) {
    event.preventDefault();
    const command = {
      id: $('#chatbotCommandId').value || undefined,
      name: $('#chatbotCommandName').value.trim(),
      aliases: $('#chatbotCommandAliases').value.split(',').map((alias) => alias.trim()).filter(Boolean),
      permission: $('#chatbotCommandPermission').value,
      response: $('#chatbotCommandResponse').value.trim(),
      handler: $('#chatbotCommandHandler').value || undefined,
      workflowId: $('#chatbotCommandWorkflow').value || undefined,
      viewerCooldownMs: Number($('#chatbotViewerCooldown').value) * 1000,
      globalCooldownMs: Number($('#chatbotGlobalCooldown').value) * 1000,
      enabled: $('#chatbotCommandEnabled').checked,
      replyToViewer: $('#chatbotReplyToViewer').checked,
      allowSharedChat: $('#chatbotAllowSharedChat').checked
    };
    try {
      const result = await api('/v1/chatbot/commands', { method: 'POST', body: command });
      state.chatbot = result.status;
      resetChatbotCommandForm();
      renderChatbot();
      toast(`${state.chatbot.prefix || '!'}${result.command.name} saved.`);
    } catch (error) { toast(error.message, true); }
  }

  function protectSharedChatCommandPolicy() {
    if ($('#chatbotCommandPermission').value !== 'everyone' || $('#chatbotCommandWorkflow').value) {
      $('#chatbotAllowSharedChat').checked = false;
    }
  }

  async function deleteChatbotCommand() {
    const id = $('#chatbotCommandId').value;
    if (!id || !confirm('Delete this chatbot command?')) return;
    try {
      const result = await api(`/v1/chatbot/commands/${encodeURIComponent(id)}`, { method: 'DELETE', body: {} });
      state.chatbot = result.status;
      resetChatbotCommandForm();
      renderChatbot();
      toast('Chatbot command deleted.');
    } catch (error) { toast(error.message, true); }
  }

  async function saveChatbotPrefix() {
    try {
      state.chatbot = await api('/v1/chatbot/configuration', { method: 'POST', body: { prefix: $('#chatbotPrefix').value } });
      renderChatbot();
      toast(`Chatbot prefix changed to ${state.chatbot.prefix}.`);
    } catch (error) { renderChatbot(); toast(error.message, true); }
  }

  async function testChatbotCommand() {
    const selectedRole = $('#chatbotTestRole').value;
    const roles = selectedRole === 'everyone' ? [] : [selectedRole];
    try {
      const sharedChat = $('#chatbotTestOrigin').value === 'shared';
      const result = await api('/v1/chatbot/test', { method: 'POST', body: { message: $('#chatbotTestMessage').value, viewerName: $('#chatbotTestViewer').value, roles, sharedChat, sourceChannelLogin: sharedChat ? 'collaborator' : undefined } });
      $('#chatbotTestResult').textContent = result.accepted ? `Accepted. Reply preview: ${result.response || 'No chat reply; workflow only.'}` : result.reason || 'No enabled command matched.';
      await refreshRuntime();
      toast(result.accepted ? 'Chatbot simulation accepted.' : result.reason || 'No command matched.', !result.accepted);
    } catch (error) { toast(error.message, true); }
  }

  async function startLocalExtension() {
    try {
      const accountChannelId = state.twitch?.oauth?.account?.userId || '';
      const channelId = $('#localExtensionChannelId').value.trim() || accountChannelId;
      const extensionSecret = $('#localExtensionSecret').value.trim();
      state.localExtension = await window.tempestStudio.startLocalExtension({ channelId, extensionSecret });
      $('#localExtensionSecret').value = '';
      await refresh({ quiet: true });
      toast('Your Local Twitch Extension is running.');
    } catch (error) {
      state.localExtension = await window.tempestStudio.getLocalExtensionStatus().catch(() => state.localExtension);
      renderLocalExtension();
      toast(error.message, true);
    }
  }

  async function stopLocalExtension() {
    try {
      state.localExtension = await window.tempestStudio.stopLocalExtension();
      await refresh({ quiet: true });
      toast('Local Twitch Extension stopped.');
    } catch (error) { toast(error.message, true); }
  }

  async function prepareLocalExtensionCertificate() {
    if (!confirm('Prepare and trust the localhost development certificate for the current Windows user?')) return;
    try {
      state.localExtension = await window.tempestStudio.prepareLocalExtensionCertificate();
      renderLocalExtension();
      toast('Local Extension certificate is ready.');
    } catch (error) { toast(error.message, true); }
  }

  async function forgetLocalExtensionSecret() {
    if (!confirm('Stop the Local Extension and remove its encrypted secret from this computer?')) return;
    try {
      state.localExtension = await window.tempestStudio.forgetLocalExtensionSecret();
      $('#localExtensionSecret').value = '';
      renderLocalExtension();
      toast('Stored Extension secret removed.');
    } catch (error) { toast(error.message, true); }
  }

  function defaultPanelDesign() {
    return { schemaVersion: 1, preset: 'tempest', brandName: 'TEMPEST STREAMING STUDIO', eyebrow: 'VIEWER CONTROL NODE', title: 'Signal deck', accent: '#54F2EB', background: '#05090E', surface: '#09131B', text: '#ECF9FF', muted: '#79919D', font: 'inter', cardLayout: 'grid', density: 'comfortable', cornerRadius: 10, showLogo: true, showStatus: true, showSearch: true, showFilters: true, showPattern: true, uppercaseLabels: true };
  }

  const panelPresetValues = {
    tempest: { accent: '#54F2EB', background: '#05090E', surface: '#09131B', text: '#ECF9FF', muted: '#79919D', cornerRadius: 10, showPattern: true },
    minimal: { accent: '#E8EEF2', background: '#101214', surface: '#191C1F', text: '#FFFFFF', muted: '#9CA4AA', cornerRadius: 4, showPattern: false },
    neon: { accent: '#A66BFF', background: '#04020A', surface: '#0C0718', text: '#FFFFFF', muted: '#998CAD', cornerRadius: 8, showPattern: true },
    soft: { accent: '#FF9FBD', background: '#17131A', surface: '#251E28', text: '#FFF6FB', muted: '#BBAAB5', cornerRadius: 18, showPattern: false }
  };

  function populatePanelDesign(value) {
    const design = { ...defaultPanelDesign(), ...(value || {}) };
    $('#panelDesignPreset').value = design.preset;
    $('#panelDesignBrandName').value = design.brandName;
    $('#panelDesignEyebrow').value = design.eyebrow;
    $('#panelDesignTitle').value = design.title;
    $('#panelDesignAccent').value = design.accent;
    $('#panelDesignBackground').value = design.background;
    $('#panelDesignSurface').value = design.surface;
    $('#panelDesignText').value = design.text;
    $('#panelDesignMuted').value = design.muted;
    $('#panelDesignFont').value = design.font;
    $('#panelDesignCardLayout').value = design.cardLayout;
    $('#panelDesignDensity').value = design.density;
    $('#panelDesignRadius').value = design.cornerRadius;
    $('#panelDesignShowLogo').checked = design.showLogo;
    $('#panelDesignShowStatus').checked = design.showStatus;
    $('#panelDesignShowSearch').checked = design.showSearch;
    $('#panelDesignShowFilters').checked = design.showFilters;
    $('#panelDesignShowPattern').checked = design.showPattern;
    $('#panelDesignUppercase').checked = design.uppercaseLabels;
    updatePanelDesignPreview();
  }

  function readPanelDesign() {
    return { schemaVersion: 1, preset: $('#panelDesignPreset').value, brandName: $('#panelDesignBrandName').value.trim(), eyebrow: $('#panelDesignEyebrow').value.trim(), title: $('#panelDesignTitle').value.trim(), accent: $('#panelDesignAccent').value, background: $('#panelDesignBackground').value, surface: $('#panelDesignSurface').value, text: $('#panelDesignText').value, muted: $('#panelDesignMuted').value, font: $('#panelDesignFont').value, cardLayout: $('#panelDesignCardLayout').value, density: $('#panelDesignDensity').value, cornerRadius: Number($('#panelDesignRadius').value), showLogo: $('#panelDesignShowLogo').checked, showStatus: $('#panelDesignShowStatus').checked, showSearch: $('#panelDesignShowSearch').checked, showFilters: $('#panelDesignShowFilters').checked, showPattern: $('#panelDesignShowPattern').checked, uppercaseLabels: $('#panelDesignUppercase').checked };
  }

  function updatePanelDesignPreview() {
    const design = readPanelDesign();
    const preview = $('#panelDesignPreview');
    const fonts = { inter: 'Inter, system-ui, sans-serif', system: 'system-ui, sans-serif', condensed: 'Impact, Arial Narrow, sans-serif', serif: 'Georgia, Times New Roman, serif' };
    preview.dataset.preset = design.preset;
    preview.style.setProperty('--pd-accent', design.accent);
    preview.style.setProperty('--pd-background', design.background);
    preview.style.setProperty('--pd-surface', design.surface);
    preview.style.setProperty('--pd-text', design.text);
    preview.style.setProperty('--pd-muted', design.muted);
    preview.style.setProperty('--pd-radius', `${design.cornerRadius}px`);
    preview.style.setProperty('--pd-font', fonts[design.font] || fonts.inter);
    preview.classList.toggle('list-layout', design.cardLayout === 'list');
    preview.classList.toggle('compact', design.density === 'compact');
    preview.classList.toggle('no-logo', !design.showLogo);
    preview.classList.toggle('no-status', !design.showStatus);
    preview.classList.toggle('no-search', !design.showSearch);
    preview.classList.toggle('no-filters', !design.showFilters);
    preview.classList.toggle('no-pattern', !design.showPattern);
    preview.classList.toggle('uppercase', design.uppercaseLabels);
    $('#panelPreviewBrand').textContent = design.brandName || 'YOUR CHANNEL';
    $('#panelPreviewEyebrow').textContent = design.eyebrow || 'VIEWER INTERACTIONS';
    $('#panelPreviewTitle').textContent = design.title || 'Signal deck';
    $('#panelDesignRadiusValue').textContent = `${design.cornerRadius} px`;
    $('#panelDesignStateBadge').textContent = 'UNSAVED CHANGES';
    $('#panelDesignStateBadge').classList.add('offline');
    $('#panelDesignSaveState').textContent = 'Changes are previewed live.';
  }

  function applyPanelPreset() {
    const values = panelPresetValues[$('#panelDesignPreset').value] || panelPresetValues.tempest;
    $('#panelDesignAccent').value = values.accent;
    $('#panelDesignBackground').value = values.background;
    $('#panelDesignSurface').value = values.surface;
    $('#panelDesignText').value = values.text;
    $('#panelDesignMuted').value = values.muted;
    $('#panelDesignRadius').value = values.cornerRadius;
    $('#panelDesignShowPattern').checked = values.showPattern;
    updatePanelDesignPreview();
  }

  async function savePanelDesign(event) {
    event.preventDefault();
    try {
      state.panelDesign = await window.tempestStudio.saveTwitchPanelDesign(readPanelDesign());
      populatePanelDesign(state.panelDesign);
      $('#panelDesignStateBadge').textContent = 'SAVED LOCALLY';
      $('#panelDesignStateBadge').classList.remove('offline');
      $('#panelDesignSaveState').textContent = state.localExtension?.running ? 'Saved. Refresh the real Panel to apply it.' : 'Saved for local and future hosted Panel sync.';
      toast('Twitch Panel design saved.');
    } catch (error) { toast(error.message, true); }
  }

  async function openDesignedPanel() {
    try { await window.tempestStudio.openLocalExtensionPanel(); }
    catch (error) { toast(`${error.message} Start the Local Panel from Twitch first.`, true); }
  }

  function renderBridgeStatus(online) {
    $('#bridgeLight').classList.toggle('online', online);
    $('#bridgeRailStatus').textContent = online ? 'ONLINE' : 'OFFLINE';
    $('#apiOnlineBadge').textContent = online ? 'ONLINE' : 'OFFLINE';
    $('#apiOnlineBadge').classList.toggle('offline', !online);
  }

  function renderAll() {
    renderSafety();
    renderOverview();
    renderWorkflows();
    renderEvents();
    renderSoundAlerts();
    renderVisualAlerts();
    renderChatOverlay({ settings: true });
    renderWarudo();
    renderApi();
    renderTwitch();
    renderChatbot();
    renderSoftware();
    renderAssets();
  }

  async function refreshRuntime({ quiet = true } = {}) {
    if (runtimeRefreshBusy) return;
    runtimeRefreshBusy = true;
    try {
      const [health, connections, runs, events, safety, chatbot, visualAlerts, chatOverlay, warudo, localExtension] = await Promise.all([api('/health'), api('/v1/connections'), api('/v1/runs?limit=50'), api('/v1/events?limit=150'), api('/v1/safety'), api('/v1/chatbot'), api('/v1/visual-alerts'), api('/v1/chat-overlay'), window.tempestStudio.getWarudoStatus(), window.tempestStudio.getLocalExtensionStatus()]);
      state.health = health;
      state.connections = connections.connections || [];
      state.runs = runs.runs || [];
      state.events = events.events || [];
      state.safety = safety;
      state.chatbot = chatbot;
      state.visualAlerts = visualAlerts;
      state.chatOverlay = chatOverlay;
      state.warudo = warudo;
      state.localExtension = localExtension;
      renderBridgeStatus(true);
      renderSafety();
      renderOverview();
      renderWorkflows();
      renderEvents();
      renderVisualAlertStatus();
      renderChatOverlay();
      renderWarudo();
      renderLocalExtension();
      renderChatbot();
      renderApi();
    } catch (error) {
      renderBridgeStatus(false);
      if (!quiet) toast(error.message, true);
    } finally { runtimeRefreshBusy = false; }
  }

  async function refresh({ quiet = false } = {}) {
    try {
      const [health, applications, assets, connections, workflows, runs, events, safety, twitch, chatbot, radio, soundAlerts, visualAlerts, twitchVisualAlerts, chatOverlay, warudo, localExtension, giphy] = await Promise.all([api('/health'), api('/v1/applications'), api('/v1/assets'), api('/v1/connections'), api('/v1/workflows'), api('/v1/runs?limit=50'), api('/v1/events?limit=150'), api('/v1/safety'), api('/v1/integrations/twitch'), api('/v1/chatbot'), api('/v1/integrations/storm-horizon-radio'), api('/v1/sound-alerts'), api('/v1/visual-alerts'), api('/v1/visual-alerts/twitch'), api('/v1/chat-overlay'), window.tempestStudio.getWarudoStatus(), window.tempestStudio.getLocalExtensionStatus(), window.tempestStudio.getGiphyStatus()]);
      Object.assign(state, { health, applications: applications.applications || [], assets: assets.assets || [], connections: connections.connections || [], workflows: workflows.workflows || [], runs: runs.runs || [], events: events.events || [], safety, twitch, chatbot, radio, soundAlerts, visualAlerts, twitchVisualAlerts, chatOverlay, warudo, localExtension, giphy });
      renderBridgeStatus(true);
      renderAll();
    } catch (error) {
      renderBridgeStatus(false);
      if (!quiet) toast(error.message, true);
    }
  }

  async function triggerWorkflow(id) {
    try {
      const response = await api(`/v1/workflows/${encodeURIComponent(id)}/trigger`, { method: 'POST', body: { source: 'studio.simulator', viewerId: 'studio-simulator', viewerName: 'Studio Simulator', simulateMissing: true, bypassCooldown: true } });
      await refreshRuntime();
      toast(`${response.run.workflowName} started in simulation-aware mode.`);
    } catch (error) { toast(error.message, true); }
  }

  async function toggleSafety() {
    try {
      if (state.safety.armed) {
        const result = await api('/v1/safety/stop', { method: 'POST', body: { reason: 'Operator emergency stop' } });
        toast(`${result.stoppedRuns} active workflow${result.stoppedRuns === 1 ? '' : 's'} stopped and interactions disarmed.`);
      } else {
        await api('/v1/safety/arm', { method: 'POST', body: {} });
        toast('Viewer interactions armed.');
      }
      await refreshRuntime();
    } catch (error) { toast(error.message, true); }
  }

  async function registerApplication() {
    try {
      const manifest = await window.tempestStudio.selectApplicationManifest();
      if (!manifest) return;
      await api('/v1/applications', { method: 'POST', body: manifest });
      await refresh();
      toast(`${manifest.name} registered with Studio.`);
    } catch (error) { toast(error.message, true); }
  }

  async function beginAssetRegistration() {
    try {
      selectedAsset = await window.tempestStudio.selectAsset();
      if (!selectedAsset) return;
      $('#assetId').value = selectedAsset.suggestedId;
      $('#assetUri').value = selectedAsset.uri;
      $('#assetChecksum').value = selectedAsset.checksum;
      $('#assetName').value = selectedAsset.name;
      $('#assetVersion').value = '1.0.0';
      $('#assetTags').value = '';
      $('#assetProducer').innerHTML = state.applications.length ? state.applications.map((application) => `<option value="${escapeHtml(application.id)}">${escapeHtml(application.name)}</option>`).join('') : '<option value="com.tempestmainframe.studio">Tempest Streaming Studio</option>';
      $('#assetDialog').showModal();
    } catch (error) { toast(error.message, true); }
  }

  async function submitAsset(event) {
    event.preventDefault();
    const asset = { schemaVersion: 1, id: $('#assetId').value, type: $('#assetType').value, name: $('#assetName').value.trim(), version: $('#assetVersion').value.trim(), producer: $('#assetProducer').value, uri: $('#assetUri').value, checksum: $('#assetChecksum').value, tags: $('#assetTags').value.split(',').map((tag) => tag.trim()).filter(Boolean), dependencies: [], metadata: { size: selectedAsset?.size || 0, extension: selectedAsset?.extension || '' } };
    try {
      await api('/v1/assets', { method: 'POST', body: asset });
      $('#assetDialog').close(); selectedAsset = null; await refresh(); toast(`${asset.name} added to the Asset Library.`);
    } catch (error) { toast(error.message, true); }
  }

  async function updateSoundAlert(id, patch, message) {
    try {
      const result = await api(`/v1/sound-alerts/${encodeURIComponent(id)}`, { method: 'POST', body: patch });
      const index = state.soundAlerts.alerts.findIndex((entry) => entry.id === id);
      if (index >= 0) state.soundAlerts.alerts[index] = result.alert;
      renderSoundAlerts();
      renderVisualAlerts();
      toast(message || `${result.alert.name} updated.`);
      return result.alert;
    } catch (error) { toast(error.message, true); return null; }
  }

  function alertKey(value) {
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  }

  function updateInteractionCuePreview() {
    const key = alertKey($('#newInteractionAlertKey').value) || 'moonlight-dance';
    $('#newInteractionAlertCue').textContent = `sound-alert.${key}`;
  }

  function openInteractionAlertDialog() {
    $('#interactionAlertForm').reset();
    $('#newInteractionAlertKey').dataset.auto = 'true';
    $('#newInteractionWarudoOptions').hidden = true;
    updateInteractionCuePreview();
    $('#interactionAlertDialog').showModal();
    $('#newInteractionAlertName').focus();
  }

  async function createInteractionAlert(event) {
    event.preventDefault();
    const key = alertKey($('#newInteractionAlertKey').value);
    try {
      const result = await api('/v1/sound-alerts', { method: 'POST', body: {
        id: `sound-alert.${key}`,
        cue: `sound-alert.${key}`,
        name: $('#newInteractionAlertName').value.trim(),
        warudoEnabled: $('#newInteractionWarudoEnabled').checked,
        durationMs: Math.round(Number($('#newInteractionAlertDuration').value) * 1000),
        visualDurationMs: Math.round(Number($('#newInteractionVisualDuration').value) * 1000),
        volume: Number($('#newInteractionVolume').value) / 100,
        viewerCooldownMs: Math.round(Number($('#newInteractionViewerCooldown').value) * 1000),
        globalCooldownMs: Math.round(Number($('#newInteractionGlobalCooldown').value) * 1000),
        accent: $('#newInteractionAccent').value
      } });
      state.soundAlerts.alerts.push(result.alert);
      $('#interactionAlertDialog').close();
      renderSoundAlerts();
      renderVisualAlerts();
      toast(`${result.alert.name} created. Assign its sound and visual from the new card.`);
    } catch (error) { toast(error.message, true); }
  }

  async function deleteInteractionAlert(id) {
    const alert = state.soundAlerts.alerts.find((entry) => entry.id === id);
    if (!alert || !confirm(`Delete ${alert.name}? Its local media files will not be deleted.`)) return;
    try {
      await api(`/v1/sound-alerts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      state.soundAlerts.alerts = state.soundAlerts.alerts.filter((entry) => entry.id !== id);
      renderSoundAlerts();
      renderVisualAlerts();
      toast(`${alert.name} removed from Interaction Alerts.`);
    } catch (error) { toast(error.message, true); }
  }

  async function assignSoundAlertAudio(id) {
    try {
      const selection = await window.tempestStudio.selectSoundAlertAudio();
      if (!selection) return;
      await updateSoundAlert(id, { audioUri: selection.uri }, `${selection.name} assigned to the Interaction Alert sound.`);
    } catch (error) { toast(error.message, true); }
  }

  async function assignSoundAlertVisual(id) {
    try {
      const selection = await window.tempestStudio.selectSoundAlertVisual();
      if (!selection) return;
      await updateSoundAlert(id, { visualUri: selection.uri }, `${selection.name} assigned to the Interaction Alert visual.`);
    } catch (error) { toast(error.message, true); }
  }

  async function updateTwitchVisualAlert(id, patch, message) {
    try {
      const result = await api(`/v1/visual-alerts/twitch/${encodeURIComponent(id)}`, { method: 'POST', body: patch });
      const index = state.twitchVisualAlerts.alerts.findIndex((entry) => entry.id === id);
      if (index >= 0) state.twitchVisualAlerts.alerts[index] = result.alert;
      renderVisualAlerts();
      toast(message || `${result.alert.name} updated.`);
      return result.alert;
    } catch (error) { toast(error.message, true); return null; }
  }

  function openTwitchAlertDialog() {
    $('#twitchAlertForm').reset();
    $('#newTwitchAlertKey').dataset.auto = 'true';
    const topicSelect = $('#newTwitchAlertTopic');
    for (const option of topicSelect.options) {
      const matches = state.twitchVisualAlerts.alerts.filter((alert) => alert.topic === option.value);
      option.disabled = option.value === 'viewer.subscription.started'
        ? matches.some((alert) => (alert.variant || 'standard') === 'standard') && matches.some((alert) => alert.variant === 'gift')
        : matches.length > 0;
    }
    if (topicSelect.selectedOptions[0]?.disabled) {
      const available = [...topicSelect.options].find((option) => !option.disabled);
      if (available) topicSelect.value = available.value;
    }
    if (![...topicSelect.options].some((option) => !option.disabled)) return toast('Every available Twitch event already has an alert preset.', true);
    updateNewTwitchVariantState();
    $('#twitchAlertDialog').showModal();
    $('#newTwitchAlertName').focus();
  }

  function updateNewTwitchVariantState() {
    const topic = $('#newTwitchAlertTopic').value;
    const variant = $('#newTwitchAlertVariant');
    variant.disabled = topic !== 'viewer.subscription.started';
    if (variant.disabled) return;
    for (const option of variant.options) option.disabled = state.twitchVisualAlerts.alerts.some((alert) => alert.topic === topic && (alert.variant || 'standard') === option.value);
    if (variant.selectedOptions[0]?.disabled) variant.value = [...variant.options].find((option) => !option.disabled)?.value || 'standard';
  }

  async function createTwitchAlert(event) {
    event.preventDefault();
    const topic = $('#newTwitchAlertTopic').value;
    const key = alertKey($('#newTwitchAlertKey').value);
    try {
      const result = await api('/v1/visual-alerts/twitch', { method: 'POST', body: {
        id: `twitch.${key}`,
        name: $('#newTwitchAlertName').value.trim(),
        topic,
        ...(topic === 'viewer.subscription.started' ? { variant: $('#newTwitchAlertVariant').value } : {}),
        durationMs: Math.round(Number($('#newTwitchAlertDuration').value) * 1000),
        volume: Number($('#newTwitchAlertVolume').value) / 100,
        accent: $('#newTwitchAlertAccent').value
      } });
      state.twitchVisualAlerts.alerts.push(result.alert);
      $('#twitchAlertDialog').close();
      renderVisualAlerts();
      toast(`${result.alert.name} created. Assign its sound and visual from the new card.`);
    } catch (error) { toast(error.message, true); }
  }

  async function deleteTwitchAlert(id) {
    const alert = state.twitchVisualAlerts.alerts.find((entry) => entry.id === id);
    if (!alert || !confirm(`Delete ${alert.name}? Its local media files will not be deleted.`)) return;
    try {
      await api(`/v1/visual-alerts/twitch/${encodeURIComponent(id)}`, { method: 'DELETE' });
      state.twitchVisualAlerts.alerts = state.twitchVisualAlerts.alerts.filter((entry) => entry.id !== id);
      renderVisualAlerts();
      toast(`${alert.name} removed from Twitch Alerts.`);
    } catch (error) { toast(error.message, true); }
  }

  async function assignTwitchVisualFile(id) {
    try {
      const selection = await window.tempestStudio.selectSoundAlertVisual();
      if (!selection) return;
      await updateTwitchVisualAlert(id, { visualUri: selection.uri }, `${selection.name} assigned to the Twitch Alert.`);
    } catch (error) { toast(error.message, true); }
  }

  async function assignTwitchAlertAudio(id) {
    try {
      const selection = await window.tempestStudio.selectSoundAlertAudio();
      if (!selection) return;
      await updateTwitchVisualAlert(id, { audioUri: selection.uri }, `${selection.name} assigned to the Twitch Alert sound.`);
    } catch (error) { toast(error.message, true); }
  }

  async function saveTwitchVisualSettings(id) {
    const selectorId = CSS.escape(id);
    const durationSeconds = Number(document.querySelector(`[data-twitch-visual-duration="${selectorId}"]`).value);
    const volumePercent = Number(document.querySelector(`[data-twitch-alert-volume="${selectorId}"]`).value);
    const accent = document.querySelector(`[data-twitch-visual-accent="${selectorId}"]`).value;
    await updateTwitchVisualAlert(id, { durationMs: Math.round(durationSeconds * 1000), volume: volumePercent / 100, accent }, 'Twitch Alert sound, visual, timing, and styling saved.');
  }

  function defaultTwitchDesign() {
    return {
      preset: 'tempest', layout: 'media-left', position: 'bottom-center', positionOffsetX: 0, positionOffsetY: 0, customPositionX: 50, customPositionY: 82, scale: 1, entranceAnimation: 'slide-up', exitAnimation: 'fade', textAnimation: 'glow',
      headlineTemplate: '{event}', detailTemplate: 'Triggered by {viewer}', showViewerMessage: true,
      fontFamily: 'Inter', fontSize: 42, fontWeight: 800, textAlign: 'left', textColor: '#F5FBFF', secondaryTextColor: '#A9BDC7', textShadow: 0.35, letterSpacing: 0,
      textOffsetX: 0, textOffsetY: 0, textPositionX: 50, textPositionY: 72, cardWidth: 900, backgroundColor: '#050C13', backgroundOpacity: 0.94, borderWidth: 1, borderRadius: 24, padding: 22, cardShadow: 0.55,
      mediaWidth: 320, mediaHeight: 210, mediaFit: 'contain', mediaBorderRadius: 16, mediaDelayMs: 0, textDelayMs: 0, textDurationMs: 0, soundDelayMs: 0,
      ttsEnabled: false, ttsTemplate: '{viewer}: {event}', ttsVolume: 0.8, ttsRate: 1, ttsPitch: 1, customHtml: '', customCss: '', customJavaScript: ''
    };
  }

  function defaultInteractionDesign() {
    return {
      ...defaultTwitchDesign(),
      position: 'custom',
      customPositionX: 50,
      customPositionY: 82,
      detailTemplate: 'Requested by {viewer}',
      showViewerMessage: false,
      ttsTemplate: '{viewer} requested {event}'
    };
  }

  function defaultCurrentAlertDesign() {
    return $('#alertDesignKind').value === 'interaction' ? defaultInteractionDesign() : defaultTwitchDesign();
  }

  function populateTwitchDesign(designValue) {
    const design = { ...defaultCurrentAlertDesign(), ...(designValue || {}) };
    $('#twitchDesignPreset').value = design.preset;
    $('#twitchDesignLayout').value = design.layout;
    $('#twitchDesignPosition').value = design.position;
    $('#twitchDesignPositionX').value = design.positionOffsetX;
    $('#twitchDesignPositionY').value = design.positionOffsetY;
    $('#twitchDesignCustomX').value = design.customPositionX;
    $('#twitchDesignCustomY').value = design.customPositionY;
    $('#twitchDesignScale').value = Math.round(design.scale * 100);
    $('#twitchDesignEntrance').value = design.entranceAnimation;
    $('#twitchDesignExit').value = design.exitAnimation;
    $('#twitchDesignTextAnimation').value = design.textAnimation;
    $('#twitchDesignHeadline').value = design.headlineTemplate;
    $('#twitchDesignDetail').value = design.detailTemplate;
    $('#twitchDesignShowMessage').checked = design.showViewerMessage;
    $('#twitchDesignFont').value = design.fontFamily;
    $('#twitchDesignFontSize').value = design.fontSize;
    $('#twitchDesignFontWeight').value = design.fontWeight;
    $('#twitchDesignTextAlign').value = design.textAlign;
    $('#twitchDesignTextColor').value = design.textColor;
    $('#twitchDesignSecondaryColor').value = design.secondaryTextColor;
    $('#twitchDesignTextShadow').value = Math.round(design.textShadow * 100);
    $('#twitchDesignLetterSpacing').value = design.letterSpacing;
    $('#twitchDesignTextX').value = design.textOffsetX;
    $('#twitchDesignTextY').value = design.textOffsetY;
    $('#twitchDesignTextPositionX').value = design.textPositionX;
    $('#twitchDesignTextPositionY').value = design.textPositionY;
    $('#twitchDesignCardWidth').value = design.cardWidth;
    $('#twitchDesignBackgroundColor').value = design.backgroundColor;
    $('#twitchDesignBackgroundOpacity').value = Math.round(design.backgroundOpacity * 100);
    $('#twitchDesignBorderWidth').value = design.borderWidth;
    $('#twitchDesignBorderRadius').value = design.borderRadius;
    $('#twitchDesignPadding').value = design.padding;
    $('#twitchDesignCardShadow').value = Math.round(design.cardShadow * 100);
    $('#twitchDesignMediaWidth').value = design.mediaWidth;
    $('#twitchDesignMediaHeight').value = design.mediaHeight;
    $('#twitchDesignMediaFit').value = design.mediaFit;
    $('#twitchDesignMediaRadius').value = design.mediaBorderRadius;
    $('#twitchDesignMediaDelay').value = design.mediaDelayMs;
    $('#twitchDesignTextDelay').value = design.textDelayMs;
    $('#twitchDesignTextDuration').value = design.textDurationMs;
    $('#twitchDesignSoundDelay').value = design.soundDelayMs;
    $('#twitchDesignTtsEnabled').checked = design.ttsEnabled;
    $('#twitchDesignTtsTemplate').value = design.ttsTemplate;
    $('#twitchDesignTtsVolume').value = Math.round(design.ttsVolume * 100);
    $('#twitchDesignTtsRate').value = design.ttsRate;
    $('#twitchDesignTtsPitch').value = design.ttsPitch;
    $('#twitchDesignCustomHtml').value = design.customHtml;
    $('#twitchDesignCustomCss').value = design.customCss;
    $('#twitchDesignCustomJavaScript').value = design.customJavaScript;
    switchAlertCodeTab('html');
    updateTwitchPlacementPreview();
  }

  function twitchAnchorCoordinates(position) {
    const horizontal = position.endsWith('left') ? 12 : position.endsWith('right') ? 88 : 50;
    const vertical = position.startsWith('top') ? 17 : position.startsWith('bottom') ? 82 : 50;
    return { x: horizontal, y: vertical };
  }

  function updateTwitchPlacementPreview() {
    const canvas = $('#twitchPlacementCanvas');
    const mock = $('#twitchPlacementMock');
    if (!canvas || !mock) return;
    const position = $('#twitchDesignPosition').value;
    let x = Number($('#twitchDesignCustomX').value);
    let y = Number($('#twitchDesignCustomY').value);
    if (position !== 'custom') {
      ({ x, y } = twitchAnchorCoordinates(position));
      $('#twitchDesignCustomX').value = x;
      $('#twitchDesignCustomY').value = y;
    }
    x = Math.min(100, Math.max(0, Number.isFinite(x) ? x : 50));
    y = Math.min(100, Math.max(0, Number.isFinite(y) ? y : 50));
    const scalePercent = Math.min(200, Math.max(25, Number($('#twitchDesignScale').value) || 100));
    const canvasWidth = canvas.clientWidth || 920;
    const overlayLayout = $('#twitchDesignLayout').value === 'media-overlay';
    const cardWidth = overlayLayout
      ? Math.min(2400, Math.max(40, Number($('#twitchDesignMediaWidth').value) || 320))
      : Math.min(2600, Math.max(280, Number($('#twitchDesignCardWidth').value) || 900));
    const previewWidth = Math.min(canvasWidth * 0.88, Math.max(90, canvasWidth * cardWidth / 3440));
    mock.style.left = `${x}%`;
    mock.style.top = `${y}%`;
    mock.style.width = `${previewWidth}px`;
    mock.style.aspectRatio = overlayLayout ? `${Math.max(40, Number($('#twitchDesignMediaWidth').value) || 320)} / ${Math.max(40, Number($('#twitchDesignMediaHeight').value) || 210)}` : '';
    mock.classList.toggle('media-overlay', overlayLayout);
    mock.style.setProperty('--mock-text-x', `${Math.min(100, Math.max(0, Number($('#twitchDesignTextPositionX').value) || 50))}%`);
    mock.style.setProperty('--mock-text-y', `${Math.min(100, Math.max(0, Number($('#twitchDesignTextPositionY').value) || 72))}%`);
    mock.style.transform = `translate(-50%, -50%) scale(${scalePercent / 100})`;
    $('#twitchDesignScaleValue').textContent = `${Math.round(scalePercent)}%`;
    $('#twitchPlacementReadout').textContent = `X ${x.toFixed(1)}% · Y ${y.toFixed(1)}% · Size ${Math.round(scalePercent)}%`;
    $('#twitchPlacementMockTitle').textContent = $('#twitchDesignTitle').textContent.replace(/\s+Design$/, '') || 'Alert';
  }

  function setCustomTwitchPlacement(x, y) {
    $('#twitchDesignPosition').value = 'custom';
    $('#twitchDesignCustomX').value = Math.min(100, Math.max(0, x)).toFixed(1);
    $('#twitchDesignCustomY').value = Math.min(100, Math.max(0, y)).toFixed(1);
    updateTwitchPlacementPreview();
  }

  function beginTwitchPlacementInteraction(event) {
    if (event.button !== 0) return;
    const canvas = $('#twitchPlacementCanvas');
    const mock = $('#twitchPlacementMock');
    const resizing = event.target === $('#twitchPlacementResizeHandle');
    const startScale = Number($('#twitchDesignScale').value) / 100;
    const mockRect = mock.getBoundingClientRect();
    const centerX = mockRect.left + mockRect.width / 2;
    const centerY = mockRect.top + mockRect.height / 2;
    const startDistance = Math.max(20, Math.hypot(event.clientX - centerX, event.clientY - centerY));
    mock.setPointerCapture(event.pointerId);
    event.preventDefault();

    const move = (moveEvent) => {
      if (resizing) {
        const distance = Math.hypot(moveEvent.clientX - centerX, moveEvent.clientY - centerY);
        const scale = Math.min(2, Math.max(0.25, startScale * distance / startDistance));
        $('#twitchDesignScale').value = Math.round(scale * 100);
        updateTwitchPlacementPreview();
        return;
      }
      const bounds = canvas.getBoundingClientRect();
      setCustomTwitchPlacement((moveEvent.clientX - bounds.left) / bounds.width * 100, (moveEvent.clientY - bounds.top) / bounds.height * 100);
    };
    const finish = () => {
      mock.removeEventListener('pointermove', move);
      mock.removeEventListener('pointerup', finish);
      mock.removeEventListener('pointercancel', finish);
    };
    mock.addEventListener('pointermove', move);
    mock.addEventListener('pointerup', finish);
    mock.addEventListener('pointercancel', finish);
  }

  function moveTwitchPlacementWithKeyboard(event) {
    const movement = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!movement) return;
    event.preventDefault();
    const step = event.shiftKey ? 5 : 1;
    const position = $('#twitchDesignPosition').value;
    const current = position === 'custom'
      ? { x: Number($('#twitchDesignCustomX').value), y: Number($('#twitchDesignCustomY').value) }
      : twitchAnchorCoordinates(position);
    setCustomTwitchPlacement(current.x + movement[0] * step, current.y + movement[1] * step);
  }

  function readTwitchDesign() {
    return {
      preset: $('#twitchDesignPreset').value,
      layout: $('#twitchDesignLayout').value,
      position: $('#twitchDesignPosition').value,
      positionOffsetX: Number($('#twitchDesignPositionX').value),
      positionOffsetY: Number($('#twitchDesignPositionY').value),
      customPositionX: Number($('#twitchDesignCustomX').value),
      customPositionY: Number($('#twitchDesignCustomY').value),
      scale: Number($('#twitchDesignScale').value) / 100,
      entranceAnimation: $('#twitchDesignEntrance').value,
      exitAnimation: $('#twitchDesignExit').value,
      textAnimation: $('#twitchDesignTextAnimation').value,
      headlineTemplate: $('#twitchDesignHeadline').value,
      detailTemplate: $('#twitchDesignDetail').value,
      showViewerMessage: $('#twitchDesignShowMessage').checked,
      fontFamily: $('#twitchDesignFont').value,
      fontSize: Number($('#twitchDesignFontSize').value),
      fontWeight: Number($('#twitchDesignFontWeight').value),
      textAlign: $('#twitchDesignTextAlign').value,
      textColor: $('#twitchDesignTextColor').value,
      secondaryTextColor: $('#twitchDesignSecondaryColor').value,
      textShadow: Number($('#twitchDesignTextShadow').value) / 100,
      letterSpacing: Number($('#twitchDesignLetterSpacing').value),
      textOffsetX: Number($('#twitchDesignTextX').value),
      textOffsetY: Number($('#twitchDesignTextY').value),
      textPositionX: Number($('#twitchDesignTextPositionX').value),
      textPositionY: Number($('#twitchDesignTextPositionY').value),
      cardWidth: Number($('#twitchDesignCardWidth').value),
      backgroundColor: $('#twitchDesignBackgroundColor').value,
      backgroundOpacity: Number($('#twitchDesignBackgroundOpacity').value) / 100,
      borderWidth: Number($('#twitchDesignBorderWidth').value),
      borderRadius: Number($('#twitchDesignBorderRadius').value),
      padding: Number($('#twitchDesignPadding').value),
      cardShadow: Number($('#twitchDesignCardShadow').value) / 100,
      mediaWidth: Number($('#twitchDesignMediaWidth').value),
      mediaHeight: Number($('#twitchDesignMediaHeight').value),
      mediaFit: $('#twitchDesignMediaFit').value,
      mediaBorderRadius: Number($('#twitchDesignMediaRadius').value),
      mediaDelayMs: Number($('#twitchDesignMediaDelay').value),
      textDelayMs: Number($('#twitchDesignTextDelay').value),
      textDurationMs: Number($('#twitchDesignTextDuration').value),
      soundDelayMs: Number($('#twitchDesignSoundDelay').value),
      ttsEnabled: $('#twitchDesignTtsEnabled').checked,
      ttsTemplate: $('#twitchDesignTtsTemplate').value,
      ttsVolume: Number($('#twitchDesignTtsVolume').value) / 100,
      ttsRate: Number($('#twitchDesignTtsRate').value),
      ttsPitch: Number($('#twitchDesignTtsPitch').value),
      customHtml: $('#twitchDesignCustomHtml').value,
      customCss: $('#twitchDesignCustomCss').value,
      customJavaScript: $('#twitchDesignCustomJavaScript').value
    };
  }

  function switchAlertCodeTab(tabName) {
    document.querySelectorAll('[data-design-code-tab]').forEach((button) => button.classList.toggle('active', button.dataset.designCodeTab === tabName));
    document.querySelectorAll('[data-design-code-panel]').forEach((panel) => { panel.hidden = panel.dataset.designCodePanel !== tabName; });
  }

  function openTwitchDesignEditor(id) {
    const alert = state.twitchVisualAlerts.alerts.find((entry) => entry.id === id);
    if (!alert) return;
    $('#alertDesignKind').value = 'twitch';
    $('#alertDesignKicker').textContent = 'TWITCH ALERT DESIGNER';
    $('#alertDesignHelp').textContent = 'Use template variables to make the same design respond to the live Twitch event.';
    $('#twitchDesignAlertId').value = alert.id;
    $('#twitchDesignTitle').textContent = `${alert.name} Design`;
    populateTwitchDesign(alert.design);
    $('#twitchDesignDialog').showModal();
    requestAnimationFrame(updateTwitchPlacementPreview);
  }

  function openInteractionDesignEditor(id) {
    const alert = state.soundAlerts.alerts.find((entry) => entry.id === id);
    if (!alert) return;
    $('#alertDesignKind').value = 'interaction';
    $('#alertDesignKicker').textContent = 'INTERACTION ALERT DESIGNER';
    $('#alertDesignHelp').textContent = 'Place this sound-and-visual interaction anywhere on the dedicated 3440 × 1440 Interaction Alert Browser Source canvas.';
    $('#twitchDesignAlertId').value = alert.id;
    $('#twitchDesignTitle').textContent = `${alert.name} Design`;
    populateTwitchDesign(alert.design || defaultInteractionDesign());
    $('#twitchDesignDialog').showModal();
    requestAnimationFrame(updateTwitchPlacementPreview);
  }

  async function saveTwitchDesign(event, preview = false) {
    event?.preventDefault();
    const id = $('#twitchDesignAlertId').value;
    if (!id) return;
    const kind = $('#alertDesignKind').value;
    const saved = kind === 'interaction'
      ? await updateSoundAlert(id, { design: readTwitchDesign() }, 'Interaction Alert design and canvas placement saved.')
      : await updateTwitchVisualAlert(id, { design: readTwitchDesign() }, 'Twitch Alert design saved.');
    if (!saved) return;
    $('#twitchDesignDialog').close();
    if (preview) {
      if (kind === 'interaction') await previewVisualAlert(id);
      else await previewTwitchVisualAlert(id);
    }
  }

  async function previewTwitchVisualAlert(id) {
    try {
      const result = await api(`/v1/visual-alerts/twitch/${encodeURIComponent(id)}/preview`, { method: 'POST', body: {} });
      state.visualAlerts = await api('/v1/visual-alerts');
      renderVisualAlerts();
      toast(`${result.activeAlert.name} preview started.`);
    } catch (error) { toast(error.message, true); }
  }

  async function saveGiphyKey() {
    try {
      const apiKey = $('#giphyApiKey').value.trim();
      state.giphy = await window.tempestStudio.saveGiphyApiKey(apiKey);
      $('#giphyApiKey').value = '';
      renderVisualAlerts();
      toast('GIPHY API key stored with Windows encryption.');
    } catch (error) { toast(error.message, true); }
  }

  async function searchGiphy() {
    const button = $('#searchGiphyButton');
    const originalLabel = button.textContent;
    try {
      const query = $('#giphySearchQuery').value.trim();
      const target = $('#giphyTargetAlert').value;
      if (!target) throw new Error('Choose an Interaction Alert before searching GIPHY.');
      if (!query) throw new Error('Enter a GIF search first.');
      const alertName = state.soundAlerts.alerts.find((alert) => alert.id === target)?.name || 'Interaction Alert';
      button.disabled = true;
      button.textContent = 'Searching…';
      $('#giphyResultSummary').textContent = `Searching for “${query}”…`;
      $('#giphyTargetSummary').textContent = `Results will be ready to assign to ${alertName}.`;
      const grid = $('#giphyResults');
      grid.classList.add('empty-state');
      grid.textContent = 'Searching GIPHY…';
      const result = await window.tempestStudio.searchGiphy(query);
      grid.classList.toggle('empty-state', !result.results.length);
      grid.innerHTML = result.results.length ? result.results.map((entry) => `<article class="giphy-result"><img src="${escapeHtml(entry.previewUrl)}" alt="${escapeHtml(entry.title)}" loading="lazy" /><div><strong title="${escapeHtml(entry.title)}">${escapeHtml(entry.title)}</strong><button data-giphy-result="${escapeHtml(entry.id)}" data-giphy-media-url="${escapeHtml(entry.mediaUrl)}" aria-label="Assign this GIF to ${escapeHtml(alertName)}">Assign GIF</button></div></article>`).join('') : 'No GIFs matched that search.';
      $('#giphyResultSummary').textContent = `${result.results.length} result${result.results.length === 1 ? '' : 's'} for “${query}”`;
      $('#giphyTargetSummary').textContent = result.results.length
        ? `Select a GIF to download and assign it to ${alertName}.`
        : 'Try a shorter or more general search.';
    } catch (error) {
      $('#giphyResultSummary').textContent = 'Search could not be completed';
      $('#giphyTargetSummary').textContent = error.message;
      toast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  async function chooseGiphyResult(id, mediaUrl, button) {
    const originalLabel = button?.textContent || 'Assign GIF';
    const card = button?.closest('.giphy-result');
    try {
      const target = $('#giphyTargetAlert').value;
      if (!target) throw new Error('Choose an Interaction Alert before selecting a GIF.');
      if (button) { button.disabled = true; button.textContent = 'Downloading…'; }
      card?.classList.add('assigning');
      const imported = await window.tempestStudio.importGiphyVisual({ id, mediaUrl });
      await updateSoundAlert(target, { visualUri: imported.uri }, `${imported.name} downloaded and assigned locally.`);
      if (button) button.textContent = 'Assigned';
    } catch (error) {
      if (button) { button.disabled = false; button.textContent = originalLabel; }
      toast(error.message, true);
    } finally {
      card?.classList.remove('assigning');
    }
  }

  async function saveChatOverlaySettings() {
    try {
      await api('/v1/chat-overlay/settings', { method: 'POST', body: {
        position: $('#chatOverlayPosition').value,
        maxMessages: Number($('#chatOverlayMaxMessages').value),
        messageDurationMs: Math.round(Number($('#chatOverlayDuration').value) * 1000),
        backgroundOpacity: Number($('#chatOverlayOpacity').value) / 100,
        accent: $('#chatOverlayAccent').value,
        showRoles: $('#chatOverlayShowRoles').checked
      } });
      state.chatOverlay = await api('/v1/chat-overlay');
      renderChatOverlay({ settings: true });
      toast('Chat Overlay design saved.');
    } catch (error) { toast(error.message, true); }
  }

  async function previewChatOverlay() {
    try {
      await api('/v1/chat-overlay/preview', { method: 'POST', body: {} });
      state.chatOverlay = await api('/v1/chat-overlay');
      renderChatOverlay();
      toast('Chat Overlay preview message sent.');
    } catch (error) { toast(error.message, true); }
  }

  async function clearChatOverlay() {
    try {
      state.chatOverlay = await api('/v1/chat-overlay/clear', { method: 'POST', body: {} });
      renderChatOverlay();
      toast('Chat Overlay cleared.');
    } catch (error) { toast(error.message, true); }
  }

  async function saveSoundAlertSettings(id) {
    const selectorId = CSS.escape(id);
    const warudoEnabled = document.querySelector(`[data-alert-warudo-enabled="${selectorId}"]`).checked;
    const durationSeconds = Number(document.querySelector(`[data-alert-duration="${selectorId}"]`).value);
    const viewerSeconds = Number(document.querySelector(`[data-alert-viewer-cooldown="${selectorId}"]`).value);
    const globalSeconds = Number(document.querySelector(`[data-alert-global-cooldown="${selectorId}"]`).value);
    const volumePercent = Number(document.querySelector(`[data-alert-volume="${selectorId}"]`).value);
    const broadcastAudioSource = document.querySelector(`[data-alert-broadcast-audio="${selectorId}"]`).value.trim();
    const visualSeconds = Number(document.querySelector(`[data-visual-alert-duration="${selectorId}"]`).value);
    const broadcastVisualSource = document.querySelector(`[data-visual-alert-broadcast-source="${selectorId}"]`).value.trim();
    const broadcastEffect = document.querySelector(`[data-visual-alert-effect="${selectorId}"]`).value;
    const broadcastCircuit = document.querySelector(`[data-visual-alert-circuit="${selectorId}"]`).value;
    const broadcastEffectStrength = Number(document.querySelector(`[data-visual-alert-strength="${selectorId}"]`).value) / 100;
    const accent = document.querySelector(`[data-visual-alert-accent="${selectorId}"]`).value;
    await updateSoundAlert(id, {
      warudoEnabled,
      durationMs: Math.round(durationSeconds * 1000),
      viewerCooldownMs: Math.round(viewerSeconds * 1000),
      globalCooldownMs: Math.round(globalSeconds * 1000),
      volume: volumePercent / 100,
      broadcastAudioSource,
      visualDurationMs: Math.round(visualSeconds * 1000),
      broadcastVisualSource,
      broadcastEffect,
      broadcastCircuit,
      broadcastEffectStrength,
      accent
    }, 'Interaction Alert sound, visual, timing, and reaction settings saved.');
  }

  async function saveVisualAlertSettings(id) {
    const selectorId = CSS.escape(id);
    const visualSeconds = Number(document.querySelector(`[data-visual-alert-duration="${selectorId}"]`).value);
    const broadcastVisualSource = document.querySelector(`[data-visual-alert-broadcast-source="${selectorId}"]`).value.trim();
    const broadcastEffect = document.querySelector(`[data-visual-alert-effect="${selectorId}"]`).value;
    const broadcastCircuit = document.querySelector(`[data-visual-alert-circuit="${selectorId}"]`).value;
    const broadcastEffectStrength = Number(document.querySelector(`[data-visual-alert-strength="${selectorId}"]`).value) / 100;
    const accent = document.querySelector(`[data-visual-alert-accent="${selectorId}"]`).value;
    await updateSoundAlert(id, {
      visualDurationMs: Math.round(visualSeconds * 1000),
      broadcastVisualSource,
      broadcastEffect,
      broadcastCircuit,
      broadcastEffectStrength,
      accent
    }, 'Visual Alert media, timing, and Broadcast effect settings saved in Studio.');
  }

  async function previewVisualAlert(id) {
    try {
      const result = await api(`/v1/visual-alerts/${encodeURIComponent(id)}/preview`, { method: 'POST', body: { viewerName: 'Studio Operator' } });
      state.visualAlerts = await api('/v1/visual-alerts');
      renderVisualAlerts();
      toast(`${result.activeAlert.name} visual preview started.`);
    } catch (error) { toast(error.message, true); }
  }

  async function clearVisualAlert() {
    try {
      state.visualAlerts = await api('/v1/visual-alerts/clear', { method: 'POST', body: {} });
      renderVisualAlerts();
      toast('Twitch and Interaction Alert overlays cleared.');
    } catch (error) { toast(error.message, true); }
  }

  async function clearAlertQueue() {
    try {
      const result = await api('/v1/alert-queue/clear', { method: 'POST', body: {} });
      state.visualAlerts.queue = result;
      renderVisualAlertStatus();
      toast(`${result.removed} waiting alert${result.removed === 1 ? '' : 's'} removed. The active alert was left playing.`);
    } catch (error) { toast(error.message, true); }
  }

  async function testSoundAlert(id) {
    try {
      const result = await api(`/v1/sound-alerts/${encodeURIComponent(id)}/trigger`, { method: 'POST', body: { source: 'studio.operator', eventId: crypto.randomUUID(), viewerId: 'studio-operator', viewerName: 'Studio Operator', simulateMissing: false, bypassCooldown: true } });
      await refreshRuntime();
      toast(result.queued
        ? `${result.alert.name} added to Alert Queue at position ${result.queuePosition}.`
        : `${result.alert.name} started through the full Studio workflow.`);
    } catch (error) { toast(error.message, true); }
  }

  async function copyToClipboard(value, button) {
    try {
      await window.tempestStudio.copyText(value);
      button.classList.add('copied');
      button.title = 'Copied';
      button.setAttribute('aria-label', `${button.dataset.copyLabel || 'Value'} copied`);
      toast(`${button.dataset.copyLabel || 'Value'} copied to clipboard.`);
      setTimeout(() => {
        if (!button.isConnected) return;
        button.classList.remove('copied');
        button.title = `Copy ${button.dataset.copyLabel || 'value'}`;
        button.setAttribute('aria-label', `Copy ${button.dataset.copyLabel || 'value'}`);
      }, 1600);
    } catch (error) { toast(error.message, true); }
  }

  async function handleAction(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.copyText) return copyToClipboard(button.dataset.copyText, button);
    if (button.dataset.designCodeTab) return switchAlertCodeTab(button.dataset.designCodeTab);
    if (button.dataset.onboardingStep !== undefined) {
      onboardingStep = Math.max(0, Math.min(onboardingSteps.length - 1, Number(button.dataset.onboardingStep) || 0));
      return renderOnboarding();
    }
    if (button.dataset.onboardingGo) {
      $('#onboardingDialog').close();
      return showSection(button.dataset.onboardingGo);
    }
    if (button.dataset.deleteInteractionAlert) return deleteInteractionAlert(button.dataset.deleteInteractionAlert);
    if (button.dataset.deleteTwitchAlert) return deleteTwitchAlert(button.dataset.deleteTwitchAlert);
    if (button.dataset.section) return showSection(button.dataset.section);
    if (button.dataset.go) return showSection(button.dataset.go);
    if (button.dataset.triggerWorkflow) return triggerWorkflow(button.dataset.triggerWorkflow);
    if (button.dataset.soundAlertTrigger) return testSoundAlert(button.dataset.soundAlertTrigger);
    if (button.dataset.soundAlertAudio) return assignSoundAlertAudio(button.dataset.soundAlertAudio);
    if (button.dataset.soundAlertVisual) return assignSoundAlertVisual(button.dataset.soundAlertVisual);
    if (button.dataset.interactionAlertSave) return saveSoundAlertSettings(button.dataset.interactionAlertSave);
    if (button.dataset.soundAlertSave) return saveSoundAlertSettings(button.dataset.soundAlertSave);
    if (button.dataset.visualAlertSave) return saveVisualAlertSettings(button.dataset.visualAlertSave);
    if (button.dataset.visualAlertPreview) return previewVisualAlert(button.dataset.visualAlertPreview);
    if (button.dataset.visualAlertClear) return clearVisualAlert();
    if (button.dataset.alertQueueClear) return clearAlertQueue();
    if (button.dataset.twitchVisualSave) return saveTwitchVisualSettings(button.dataset.twitchVisualSave);
    if (button.dataset.interactionAlertDesign) return openInteractionDesignEditor(button.dataset.interactionAlertDesign);
    if (button.dataset.twitchAlertDesign) return openTwitchDesignEditor(button.dataset.twitchAlertDesign);
    if (button.dataset.twitchAlertAudio) return assignTwitchAlertAudio(button.dataset.twitchAlertAudio);
    if (button.dataset.twitchVisualFile) return assignTwitchVisualFile(button.dataset.twitchVisualFile);
    if (button.dataset.twitchVisualPreview) return previewTwitchVisualAlert(button.dataset.twitchVisualPreview);
    if (button.dataset.giphySave) return saveGiphyKey();
    if (button.dataset.giphySearch) return searchGiphy();
    if (button.dataset.giphyResult) return chooseGiphyResult(button.dataset.giphyResult, button.dataset.giphyMediaUrl, button);
    if (button.dataset.chatOverlaySave) return saveChatOverlaySettings();
    if (button.dataset.chatOverlayPreview) return previewChatOverlay();
    if (button.dataset.chatOverlayClear) return clearChatOverlay();
    if (button.dataset.twitchVisualToggle) {
      const alert = state.twitchVisualAlerts.alerts.find((entry) => entry.id === button.dataset.twitchVisualToggle);
      if (alert) return updateTwitchVisualAlert(alert.id, { enabled: !alert.enabled }, `${alert.name} ${alert.enabled ? 'disabled' : 'enabled'}.`);
      return;
    }
    if (button.dataset.chatbotCommand) return editChatbotCommand(button.dataset.chatbotCommand);
    if (button.dataset.radioPlayer) return window.tempestStudio.openExternal(button.dataset.radioPlayer).catch((error) => toast(error.message, true));
    if (button.dataset.soundAlertToggle) {
      const alert = state.soundAlerts.alerts.find((entry) => entry.id === button.dataset.soundAlertToggle);
      if (alert) return updateSoundAlert(alert.id, { enabled: !alert.enabled }, `${alert.name} ${alert.enabled ? 'disabled' : 'enabled'}.`);
      return;
    }
    if (button.dataset.launch) {
      const application = state.applications.find((entry) => entry.id === button.dataset.launch);
      if (!application) return;
      try { await window.tempestStudio.launchApplication(application); toast(`${application.name} launched.`); } catch (error) { toast(error.message, true); }
    } else if (button.dataset.reveal) await window.tempestStudio.revealPath(button.dataset.reveal).catch((error) => toast(error.message, true));
    else if (button.dataset.revealUri) {
      try {
        const url = new URL(button.dataset.revealUri);
        if (url.protocol !== 'file:') throw new Error('Only local file assets can be revealed in this build.');
        await window.tempestStudio.revealPath(decodeURIComponent(url.pathname.replace(/^\/(?:([A-Za-z]:))/, '$1')).replaceAll('/', '\\'));
      } catch (error) { toast(error.message, true); }
    } else if (button.dataset.removeApplication) {
      if (!confirm(`Remove ${button.dataset.removeApplication} from Studio? The application files will not be deleted.`)) return;
      await api(`/v1/applications/${encodeURIComponent(button.dataset.removeApplication)}`, { method: 'DELETE' }).then(() => refresh()).catch((error) => toast(error.message, true));
    } else if (button.dataset.removeAsset) {
      if (!confirm('Remove this asset from the registry? The source file will not be deleted.')) return;
      await api(`/v1/assets/${encodeURIComponent(button.dataset.removeAsset)}`, { method: 'DELETE' }).then(() => refresh()).catch((error) => toast(error.message, true));
    }
  }

  function bindEvents() {
    $('#refreshButton').addEventListener('click', () => refresh());
    $('#openOnboardingWizard').addEventListener('click', () => openOnboarding({ firstIncomplete: true }));
    $('#reviewOnboardingWizard').addEventListener('click', () => openOnboarding({ firstIncomplete: true }));
    $('#closeOnboardingWizard').addEventListener('click', () => $('#onboardingDialog').close());
    $('#onboardingBack').addEventListener('click', () => { onboardingStep = Math.max(0, onboardingStep - 1); renderOnboarding(); });
    $('#onboardingNext').addEventListener('click', () => {
      if (onboardingStep >= onboardingSteps.length - 1) return finishOnboarding();
      onboardingStep += 1;
      renderOnboarding();
    });
    $('#refreshWarudoButton').addEventListener('click', () => refreshRuntime({ quiet: false }));
    $('#emergencyStopButton').addEventListener('click', toggleSafety);
    $('#registerApplicationButton').addEventListener('click', registerApplication);
    $('#addAssetButton').addEventListener('click', beginAssetRegistration);
    $('#assetForm').addEventListener('submit', submitAsset);
    $('#assetSearch').addEventListener('input', renderAssets);
    $('#assetTypeFilter').addEventListener('change', renderAssets);
    $('#eventSearch').addEventListener('input', renderEvents);
    $('#eventLevelFilter').addEventListener('change', renderEvents);
    $('#giphyTargetAlert').addEventListener('change', updateGiphyTargetContext);
    $('#newInteractionAlertButton').addEventListener('click', openInteractionAlertDialog);
    $('#newTwitchAlertButton').addEventListener('click', openTwitchAlertDialog);
    $('#interactionAlertForm').addEventListener('submit', createInteractionAlert);
    $('#twitchAlertForm').addEventListener('submit', createTwitchAlert);
    $('#twitchDesignForm').addEventListener('submit', (event) => saveTwitchDesign(event));
    $('#savePreviewTwitchDesign').addEventListener('click', (event) => saveTwitchDesign(event, true));
    $('#resetTwitchDesign').addEventListener('click', () => populateTwitchDesign(defaultCurrentAlertDesign()));
    $('#twitchDesignPosition').addEventListener('change', updateTwitchPlacementPreview);
    ['#twitchDesignCustomX', '#twitchDesignCustomY'].forEach((selector) => $(selector).addEventListener('input', () => {
      $('#twitchDesignPosition').value = 'custom';
      updateTwitchPlacementPreview();
    }));
    ['#twitchDesignScale', '#twitchDesignCardWidth', '#twitchDesignMediaWidth', '#twitchDesignMediaHeight', '#twitchDesignTextPositionX', '#twitchDesignTextPositionY'].forEach((selector) => $(selector).addEventListener('input', updateTwitchPlacementPreview));
    $('#twitchDesignLayout').addEventListener('change', updateTwitchPlacementPreview);
    $('#twitchPlacementMock').addEventListener('pointerdown', beginTwitchPlacementInteraction);
    $('#twitchPlacementMock').addEventListener('keydown', moveTwitchPlacementWithKeyboard);
    window.addEventListener('resize', updateTwitchPlacementPreview);
    $('#newInteractionAlertName').addEventListener('input', () => {
      const key = $('#newInteractionAlertKey');
      if (key.dataset.auto === 'true') key.value = alertKey($('#newInteractionAlertName').value);
      updateInteractionCuePreview();
    });
    $('#newInteractionAlertKey').addEventListener('input', () => { $('#newInteractionAlertKey').dataset.auto = 'false'; updateInteractionCuePreview(); });
    $('#newInteractionWarudoEnabled').addEventListener('change', () => { $('#newInteractionWarudoOptions').hidden = !$('#newInteractionWarudoEnabled').checked; });
    $('#newTwitchAlertName').addEventListener('input', () => {
      const key = $('#newTwitchAlertKey');
      if (key.dataset.auto === 'true') key.value = alertKey($('#newTwitchAlertName').value);
    });
    $('#newTwitchAlertKey').addEventListener('input', () => { $('#newTwitchAlertKey').dataset.auto = 'false'; });
    $('#newTwitchAlertTopic').addEventListener('change', updateNewTwitchVariantState);
    $('#giphySearchQuery').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      searchGiphy();
    });
    $('#saveTwitchConfiguration').addEventListener('click', () => saveTwitchConfiguration().catch((error) => toast(error.message, true)));
    $('#connectTwitchButton').addEventListener('click', connectTwitch);
    $('#validateTwitchButton').addEventListener('click', validateTwitch);
    $('#disconnectTwitchButton').addEventListener('click', disconnectTwitch);
    $('#connectChatbotButton').addEventListener('click', connectChatbot);
    $('#saveChatbotIdentity').addEventListener('click', () => { void saveChatbotIdentity(); });
    $('#validateChatbotButton').addEventListener('click', validateChatbot);
    $('#disconnectChatbotButton').addEventListener('click', disconnectChatbot);
    $('#openChatbotIsolatedAuthorization').addEventListener('click', openChatbotIsolatedAuthorization);
    $('#copyChatbotAuthorizationCode').addEventListener('click', (event) => state.chatbotDeviceAuthorization && copyToClipboard(state.chatbotDeviceAuthorization.userCode, event.currentTarget));
    $('#copyChatbotAuthorizationLink').addEventListener('click', (event) => state.chatbotDeviceAuthorization && copyToClipboard(state.chatbotDeviceAuthorization.verificationUri, event.currentTarget));
    $('#openChatbotAuthorization').addEventListener('click', () => state.chatbotDeviceAuthorization && window.tempestStudio.openExternal(state.chatbotDeviceAuthorization.verificationUri).catch((error) => toast(error.message, true)));
    $('#chatbotCommandForm').addEventListener('submit', saveChatbotCommand);
    $('#chatbotCommandPermission').addEventListener('change', protectSharedChatCommandPolicy);
    $('#chatbotCommandWorkflow').addEventListener('change', protectSharedChatCommandPolicy);
    $('#resetChatbotCommand').addEventListener('click', resetChatbotCommandForm);
    $('#deleteChatbotCommand').addEventListener('click', deleteChatbotCommand);
    $('#chatbotPrefix').addEventListener('change', saveChatbotPrefix);
    $('#testChatbotCommand').addEventListener('click', testChatbotCommand);
    $('#startLocalExtension').addEventListener('click', startLocalExtension);
    $('#stopLocalExtension').addEventListener('click', stopLocalExtension);
    $('#openLocalExtensionPanel').addEventListener('click', () => window.tempestStudio.openLocalExtensionPanel().catch((error) => toast(error.message, true)));
    $('#prepareLocalExtensionCertificate').addEventListener('click', prepareLocalExtensionCertificate);
    $('#forgetLocalExtensionSecret').addEventListener('click', forgetLocalExtensionSecret);
    $('#panelDesignForm').addEventListener('submit', savePanelDesign);
    $('#panelDesignForm').querySelectorAll('input, select').forEach((input) => input.addEventListener('input', updatePanelDesignPreview));
    $('#panelDesignPreset').addEventListener('change', applyPanelPreset);
    $('#resetPanelDesign').addEventListener('click', () => populatePanelDesign(defaultPanelDesign()));
    $('#openDesignedPanel').addEventListener('click', openDesignedPanel);
    $('#openTwitchAuthorization').addEventListener('click', () => state.twitchDeviceAuthorization && window.tempestStudio.openExternal(state.twitchDeviceAuthorization.verificationUri).catch((error) => toast(error.message, true)));
    document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
    document.body.addEventListener('change', (event) => {
      const onboardingFlag = event.target.closest('[data-onboarding-flag]');
      if (onboardingFlag) {
        writeOnboardingPreferences({ flags: { [onboardingFlag.dataset.onboardingFlag]: onboardingFlag.checked } });
        renderOnboardingSummary();
        renderOnboarding();
        return;
      }
      const input = event.target.closest('[data-alert-warudo-enabled]');
      if (!input) return;
      const options = document.querySelector(`[data-alert-warudo-options="${CSS.escape(input.dataset.alertWarudoEnabled)}"]`);
      if (options) options.hidden = !input.checked;
    });
    document.body.addEventListener('click', handleAction);
  }

  async function initialize() {
    bindEvents();
    window.tempestStudio.onSoundAlertPlayback(handleSoundAlertPlayback);
    [state.config, state.panelDesign] = await Promise.all([window.tempestStudio.getBridgeConfig(), window.tempestStudio.getTwitchPanelDesign()]);
    populatePanelDesign(state.panelDesign);
    $('#panelDesignStateBadge').textContent = 'SAVED LOCALLY';
    $('#panelDesignStateBadge').classList.remove('offline');
    $('#protocolBadge').textContent = `API ${state.config.protocolVersion}`;
    $('#httpEndpoint').textContent = state.config.baseUrl;
    $('#socketEndpoint').textContent = `${state.config.baseUrl.replace('http', 'ws')}/v1/socket`;
    await refresh();
    if (!onboardingAutoOpened && readOnboardingPreferences().completed !== true) {
      onboardingAutoOpened = true;
      openOnboarding({ firstIncomplete: true });
    }
    setInterval(() => refreshRuntime(), 1000);
    setInterval(() => refresh({ quiet: true }), 15000);
    window.__tempestStudioReady = true;
  }

  initialize().catch((error) => {
    renderBridgeStatus(false);
    toast(`Studio initialization failed: ${error.message}`, true);
  });
})();
