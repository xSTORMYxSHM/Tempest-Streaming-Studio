(() => {
  'use strict';

  const sections = {
    overview: { title: 'Studio Home', kicker: 'START HERE' },
    events: { title: 'Activity & Diagnostics', kicker: 'ADVANCED TOOLS' },
    alerts: { title: 'Unified Alerts', kicker: 'ONE ALERT ENGINE' },
    world: { title: 'Interactive World', kicker: 'CROWD · PET · BATTLES · GAZE' },
    interactivestage: { title: 'Interactive Stage', kicker: 'ON-SCREEN WORLD' },
    soundalerts: { title: 'Viewer Interactions', kicker: 'ALERTS VIEWERS CAN TRIGGER' },
    dice: { title: '3D Dice', kicker: 'STREAM DICE TABLE' },
    visualalerts: { title: 'Twitch Alerts', kicker: 'TWITCH CHANNEL EVENTS' },
    chatoverlay: { title: 'Chat Overlay', kicker: 'CHAT + EMOTES' },
    discordvoice: { title: 'Discord Guests', kicker: 'LOCAL VOICE OVERLAY' },
    twitch: { title: 'Twitch', kicker: 'TWITCH PLATFORM' },
    kick: { title: 'Kick', kicker: 'KICK PLATFORM' },
    extensiondesigner: { title: 'Twitch Panel', kicker: 'CHANNEL THEME' },
    streamtogether: { title: 'Stream Together', kicker: 'TWITCH COLLABORATION CALL' },
    chatbot: { title: 'Chatbot', kicker: 'CHAT + AUDIENCE TOOLS' },
    dualformat: { title: 'Twitch Dual Format', kicker: 'MOBILE-FIRST OUTPUT' },
    simulcast: { title: 'Go Live', kicker: 'PRODUCTION OUTPUT CONTROL' },
    api: { title: 'Avatar Apps', kicker: 'OPTIONAL CONNECTIONS' },
    software: { title: 'Software Management', kicker: 'SUITE REGISTRY' },
    assets: { title: 'Asset Control', kicker: 'ASSET LIBRARY' },
    settings: { title: 'Settings', kicker: 'STUDIO SETTINGS' }
  };
  const workspaceGroups = {
    home: [
      { section: 'overview', label: 'Overview' }
    ],
    live: [
      { section: 'chatbot', label: 'Chatbot' },
      { section: 'streamtogether', label: 'Guests' },
      { section: 'simulcast', label: 'Go Live' },
      { section: 'dice', label: '3D Dice' },
      { section: 'alerts', label: 'Action Queue' }
    ],
    interact: [
      { section: 'world', label: 'World' },
      { section: 'interactivestage', label: 'Stage' },
      { section: 'soundalerts', label: 'Viewer Actions' },
      { section: 'dice', label: 'Games' },
      { section: 'chatbot', label: 'Polls' }
    ],
    overlays: [
      { section: 'alerts', label: 'Unified Alerts' },
      { section: 'visualalerts', label: 'Twitch Events' },
      { section: 'chatoverlay', label: 'Chat' },
      { section: 'discordvoice', label: 'Guests' },
      { section: 'assets', label: 'Media Library' }
    ],
    extensions: [
      { section: 'twitch', label: 'Companions' },
      { section: 'extensiondesigner', label: 'Panel Design' },
      { section: 'dualformat', label: 'Dual Format' }
    ],
    connect: [
      { section: 'twitch', label: 'Twitch' },
      { section: 'kick', label: 'Kick' },
      { section: 'streamtogether', label: 'Stream Together' },
      { section: 'api', label: 'Avatar Apps' }
    ],
    settings: [
      { section: 'settings', label: 'Settings' },
      { section: 'events', label: 'Diagnostics', advanced: true }
    ]
  };
  const sectionWorkspace = {
    overview: 'home',
    chatbot: 'live', streamtogether: 'live', simulcast: 'live', dice: 'live',
    world: 'interact', interactivestage: 'interact', soundalerts: 'interact',
    alerts: 'overlays', visualalerts: 'overlays', chatoverlay: 'overlays', discordvoice: 'overlays', assets: 'overlays',
    twitch: 'extensions', extensiondesigner: 'extensions', dualformat: 'extensions',
    kick: 'connect', api: 'connect',
    settings: 'settings', events: 'settings'
  };
  let activeWorkspaceGroup = 'home';
  const targetNames = {
    'com.tempestmainframe.warudo': 'Warudo',
    'com.tempestmainframe.vtube-studio': 'VTube Studio',
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
    dualFormat: null,
    simulcast: null,
    workflows: [],
    runs: [],
    events: [],
    alertHistory: { summary: {}, records: [] },
    alertDiagnostics: null,
    soundAlerts: { alerts: [] },
    diceOverlay: null,
    visualAlerts: null,
    twitchVisualAlerts: { alerts: [] },
    giphy: { configured: false, encryptionAvailable: false },
    chatOverlay: null,
    emoteWall: null,
    twitchExperiences: null,
    discordVoice: null,
    unifiedStage: null,
    interactiveStage: null,
    interactiveWorld: null,
    stageActors: { packs: [], diagnostics: [] },
    extensionFeatures: { schemaVersion: 1, features: [] },
    discordRpc: null,
    twitch: null,
    kick: null,
    kickRelayLinked: false,
    chatbot: null,
    localExtension: null,
    hostedExtension: null,
    panelDesign: null,
    warudo: null,
    vtubeStudio: null,
    appInfo: null,
    update: null,
    streamTogether: null,
    privacy: { streamerMode: true, captureProtection: true },
    twitchDeviceAuthorization: null,
    chatbotDeviceAuthorization: null
  };
  let toastTimer = null;
  let runtimeRefreshBusy = false;
  let fullRefreshPromise = null;
  const runtimeDataSignatures = new Map();
  let twitchPollTimer = null;
  let chatbotPollTimer = null;
  let onboardingStep = 0;
  let onboardingAutoOpened = false;
  const activeSoundAlertAudio = new Map();
  let activeAlertDesignAssets = { visualUri: '', audioUri: '', volume: 0.8 };
  let alertDesignAudio = null;
  let alertDesignPreviewRevision = 0;
  let alertDesignHistory = [];
  let alertDesignHistoryIndex = -1;
  let alertDesignHistoryLocked = false;
  let discordCanvasDrag = null;
  let discordSettingsDirty = false;
  let twitchExperienceSettingsDirty = false;
  const discordProfileDrafts = new Map();
  let alertCanvasPositionPreviewActive = false;
  let alertCanvasPositionPreviewTimer = null;
  let alertCanvasPositionPreviewRevision = 0;
  let alertDesignBasePlacement = null;
  let alertDesignScenePlacements = [];
  let alertDesignSceneScope = '';
  let interactiveStageTab = 'overview';
  let chatbotWorkspaceTab = 'chat';
  let interactiveStageOrientation = 'horizontal';
  let interactiveStageSelectedId = '';
  let interactiveStageDrag = null;
  const stageActorDraftStrips = new Map();
  let stageActorDraftTexture = null;
  let stageActorDraftAtlas = null;
  let editingViewerGroupId = '';
  const assetPreviewIds = new Set();
  let assetPreviewAudio = null;
  const twitchExperienceDraftMedia = Object.create(null);
  const onboardingStorageKey = 'tempest.streaming-studio.onboarding.v1';
  const simulcastChecklistStorageKey = 'tempest.streaming-studio.simulcast-checklist.v1';
  const simulcastOperationsStorageKey = 'tempest.streaming-studio.simulcast-operations.v1';
  const fullRefreshIntervalMs = 60_000;
  let simulcastOperations = {
    active: false, startedAt: null, endedAt: null, incidents: [],
    previousTwitchActive: false, previousKickActive: false,
    previousTwitchDropped: 0, previousKickDropped: 0, lastHealth: 'standing-by'
  };
  const onboardingSteps = [
    { title: 'Welcome', short: 'Studio overview' },
    { title: 'Twitch Accounts', short: 'Broadcaster + bot' },
    { title: 'Browser Sources', short: 'Local overlay URLs' },
    { title: 'Canvas + Audio', short: 'OBS dimensions' },
    { title: 'Ready Check', short: 'Test before live' }
  ];

  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const activeRun = (run) => run.state === 'running' || run.state === 'pending';

  function formatElapsed(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
  }

  function saveSimulcastOperations() {
    sessionStorage.setItem(simulcastOperationsStorageKey, JSON.stringify(simulcastOperations));
  }

  function restoreSimulcastOperations() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(simulcastOperationsStorageKey) || 'null');
      if (!stored || typeof stored !== 'object' || !Array.isArray(stored.incidents)) return;
      simulcastOperations = {
        ...simulcastOperations,
        ...stored,
        incidents: stored.incidents.filter((incident) => incident && typeof incident.message === 'string').slice(-30)
      };
    } catch { /* Session history is optional and never leaves this window. */ }
  }

  function addSimulcastIncident(level, message, now = Date.now()) {
    simulcastOperations.incidents.push({ at: new Date(now).toISOString(), level, message: String(message).slice(0, 240) });
    simulcastOperations.incidents = simulcastOperations.incidents.slice(-30);
  }

  function simulcastSupervisorState(status, now = Date.now()) {
    const reportedAt = Date.parse(status.statusReportedAt || '');
    const ageMs = Number.isFinite(reportedAt) ? Math.max(0, now - reportedAt) : Number.POSITIVE_INFINITY;
    const twitchActive = status.twitch?.active === true;
    const kickActive = status.kick?.active === true;
    const maxCongestion = Math.max(Number(status.twitch?.congestion || 0), Number(status.kick?.congestion || 0));
    if (!status.connected || ageMs > 30000) return { level: 'critical', label: 'SIGNAL LOST', guidance: 'Check the Studio Integration connection in Broadcast.', ageMs };
    if (ageMs > 15000) return { level: 'warning', label: 'SIGNAL DELAYED', guidance: 'Broadcast telemetry is arriving slowly; keep the platform dashboards visible.', ageMs };
    if (twitchActive && !kickActive) return { level: 'critical', label: 'DEGRADED LIVE', guidance: 'Twitch is live and Kick is offline. Inspect the error, then use Retry Kick if safe.', ageMs };
    if (!twitchActive && kickActive) return { level: 'critical', label: 'KICK ONLY', guidance: 'Twitch is offline while Kick remains active. Use Emergency Stop All Outputs if this is unintended.', ageMs };
    if (twitchActive && kickActive && maxCongestion >= 0.25) return { level: 'critical', label: 'HIGH CONGESTION', guidance: 'Sustained congestion is critical. Check platform health and prepare to stop the affected output.', ageMs };
    if (twitchActive && kickActive && maxCongestion >= 0.1) return { level: 'warning', label: 'CONGESTION', guidance: 'Watch dropped frames and both platform dashboards closely.', ageMs };
    if (twitchActive && kickActive) return { level: 'healthy', label: 'HEALTHY', guidance: 'Both destinations are live and telemetry is current.', ageMs };
    return { level: 'standing-by', label: 'STANDING BY', guidance: 'Waiting for a live session.', ageMs };
  }

  function updateSimulcastOperations(status) {
    const now = Date.now();
    const twitchActive = status.twitch?.active === true;
    const kickActive = status.kick?.active === true;
    const twitchDropped = Number(status.twitch?.droppedFrames || 0);
    const kickDropped = Number(status.kick?.droppedFrames || 0);
    const supervisor = simulcastSupervisorState(status, now);
    const reportFresh = status.connected && status.statusReported && Number.isFinite(supervisor.ageMs) && supervisor.ageMs <= 30000;
    let changed = false;
    let startedNow = false;

    if (twitchActive && !simulcastOperations.active && reportFresh) {
      simulcastOperations = {
        active: true, startedAt: new Date(now).toISOString(), endedAt: null, incidents: [],
        previousTwitchActive: true, previousKickActive: kickActive,
        previousTwitchDropped: twitchDropped, previousKickDropped: kickDropped, lastHealth: 'standing-by'
      };
      addSimulcastIncident('info', 'Twitch reported live; Studio session supervision started.', now);
      if (kickActive) addSimulcastIncident('info', 'Kick reported live.', now);
      changed = true;
      startedNow = true;
    } else if (!twitchActive && simulcastOperations.active && reportFresh) {
      addSimulcastIncident(kickActive ? 'critical' : 'info', kickActive
        ? 'Twitch reported offline while Kick remained live; the supervised Twitch session ended.'
        : 'Twitch reported offline; the supervised live session ended.', now);
      simulcastOperations.active = false;
      simulcastOperations.endedAt = new Date(now).toISOString();
      changed = true;
    }

    if (simulcastOperations.active && !startedNow && reportFresh) {
      if (kickActive && !simulcastOperations.previousKickActive) {
        addSimulcastIncident('info', 'Kick output recovered and reported live.', now);
        changed = true;
      } else if (!kickActive && simulcastOperations.previousKickActive) {
        addSimulcastIncident('critical', `Kick output left live state${status.kick?.lastError ? `: ${status.kick.lastError}` : '.'}`, now);
        changed = true;
      }
      if (twitchDropped > simulcastOperations.previousTwitchDropped) {
        addSimulcastIncident('warning', `Twitch reported ${twitchDropped - simulcastOperations.previousTwitchDropped} additional dropped frame${twitchDropped - simulcastOperations.previousTwitchDropped === 1 ? '' : 's'}.`, now);
        changed = true;
      }
      if (kickDropped > simulcastOperations.previousKickDropped) {
        addSimulcastIncident('warning', `Kick reported ${kickDropped - simulcastOperations.previousKickDropped} additional dropped frame${kickDropped - simulcastOperations.previousKickDropped === 1 ? '' : 's'}.`, now);
        changed = true;
      }
    }

    if (simulcastOperations.active && supervisor.level !== simulcastOperations.lastHealth) {
      if (supervisor.level === 'healthy' && simulcastOperations.lastHealth !== 'standing-by') addSimulcastIncident('info', 'Destination health returned to normal.', now);
      else if (supervisor.level === 'warning' || supervisor.level === 'critical') addSimulcastIncident(supervisor.level, `${supervisor.label}: ${supervisor.guidance}`, now);
      changed = true;
    }
    if (reportFresh) {
      simulcastOperations.previousTwitchActive = twitchActive;
      simulcastOperations.previousKickActive = kickActive;
      simulcastOperations.previousTwitchDropped = twitchDropped;
      simulcastOperations.previousKickDropped = kickDropped;
    }
    simulcastOperations.lastHealth = supervisor.level;
    if (changed) saveSimulcastOperations();

    const startedAt = Date.parse(simulcastOperations.startedAt || '');
    const endedAt = Date.parse(simulcastOperations.endedAt || '');
    $('#simulcastSessionClock').textContent = simulcastOperations.active && Number.isFinite(startedAt)
      ? formatElapsed(now - startedAt)
      : Number.isFinite(startedAt) && Number.isFinite(endedAt) ? `LAST ${formatElapsed(endedAt - startedAt)}` : 'STANDING BY';
    $('#simulcastSessionClockNote').textContent = simulcastOperations.active ? `Started ${new Date(startedAt).toLocaleTimeString()}` : 'Starts when Twitch reports live';
    $('#simulcastTelemetryFreshness').textContent = Number.isFinite(supervisor.ageMs) ? `${Math.floor(supervisor.ageMs / 1000)}s AGO` : 'NO SIGNAL';
    $('#simulcastSupervisorHealth').textContent = supervisor.label;
    $('#simulcastSupervisorGuidance').textContent = supervisor.guidance;
    const timeline = $('#simulcastIncidentTimeline');
    timeline.classList.toggle('empty-state', simulcastOperations.incidents.length === 0);
    timeline.innerHTML = simulcastOperations.incidents.length
      ? [...simulcastOperations.incidents].reverse().map((incident) => `<div class="simulcast-incident ${escapeHtml(incident.level)}"><time>${new Date(incident.at).toLocaleTimeString()}</time><b>${escapeHtml(incident.level.toUpperCase())}</b><span>${escapeHtml(incident.message)}</span></div>`).join('')
      : 'No live-session incidents recorded in this Studio window.';
  }

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

  function renderPrivacySettings() {
    const privacy = state.privacy || { streamerMode: true, captureProtection: true };
    document.body.classList.toggle('streamer-privacy', privacy.streamerMode);
    const quickToggle = $('#privacyModeButton');
    quickToggle.textContent = privacy.streamerMode ? 'PRIVATE INFO HIDDEN' : 'SHOWING PRIVATE INFO';
    quickToggle.setAttribute('aria-pressed', String(privacy.streamerMode));
    quickToggle.classList.toggle('active', privacy.streamerMode);
    $('#streamerPrivacyMode').checked = privacy.streamerMode;
    $('#windowCaptureProtection').checked = privacy.captureProtection;
    const fullyProtected = privacy.streamerMode && privacy.captureProtection;
    $('#privacySettingsBadge').textContent = fullyProtected ? 'PROTECTED' : privacy.streamerMode ? 'MASKING ONLY' : privacy.captureProtection ? 'CAPTURE ONLY' : 'OFF';
    $('#privacySettingsBadge').classList.toggle('offline', !fullyProtected);
    $('#privacySettingsStatus').textContent = fullyProtected
      ? 'Privacy Shield is active.'
      : 'One or more privacy layers are disabled.';
  }

  async function persistPrivacySettings(next) {
    state.privacy = await window.tempestStudio.savePrivacySettings({
      streamerMode: Boolean(next.streamerMode),
      captureProtection: Boolean(next.captureProtection)
    });
    renderPrivacySettings();
  }

  async function togglePrivacyMode() {
    try {
      await persistPrivacySettings({ ...state.privacy, streamerMode: !state.privacy.streamerMode });
      toast(state.privacy.streamerMode ? 'Privacy masking enabled.' : 'Privacy masking disabled. Sensitive values may be visible.');
    } catch (error) { toast(error.message, true); }
  }

  async function savePrivacyControls() {
    try {
      await persistPrivacySettings({
        streamerMode: $('#streamerPrivacyMode').checked,
        captureProtection: $('#windowCaptureProtection').checked
      });
      toast('Privacy settings saved.');
    } catch (error) { toast(error.message, true); }
  }

  function renderWorkspaceTabs(group, activeSection) {
    const tabs = $('#workspaceTabs');
    if (!tabs) return;
    tabs.replaceChildren();
    const advancedMode = readOnboardingPreferences().advancedMode === true;
    for (const item of workspaceGroups[group] || workspaceGroups.home) {
      if (item.advanced && !advancedMode) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.section = item.section;
      button.dataset.navGroup = group;
      button.textContent = item.label;
      button.classList.toggle('active', item.section === activeSection);
      button.setAttribute('aria-current', item.section === activeSection ? 'page' : 'false');
      tabs.append(button);
    }
  }

  function showSection(name, requestedGroup) {
    if (name === 'events' && readOnboardingPreferences().advancedMode !== true) name = 'overview';
    const definition = sections[name] || sections.overview;
    if (!sections[name]) name = 'overview';
    activeWorkspaceGroup = workspaceGroups[requestedGroup] ? requestedGroup : (sectionWorkspace[name] || activeWorkspaceGroup || 'home');
    document.querySelectorAll('.page').forEach((page) => page.classList.toggle('active', page.id === `${name}Section`));
    document.querySelectorAll('.nav-button').forEach((button) => button.classList.toggle('active', button.dataset.navGroup === activeWorkspaceGroup));
    renderWorkspaceTabs(activeWorkspaceGroup, name);
    $('#sectionTitle').textContent = definition.title;
    $('#sectionKicker').textContent = definition.kicker;
    document.querySelector('main').scrollTo({ top: 0, left: 0 });
    if (state.config) void refreshRuntime({ quiet: true });
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

  function renderSafety() {
    const armed = Boolean(state.safety.armed);
    const active = state.runs.filter(activeRun).length;
    $('#railSafetyState').textContent = armed ? 'READY' : 'PAUSED';
    $('#railSafetyState').classList.toggle('armed', armed);
    $('#safetyBadge').textContent = armed ? 'INTERACTIONS ARMED' : 'INTERACTIONS DISARMED';
    $('#safetyBadge').classList.toggle('offline', !armed);
    $('#emergencyStopButton').textContent = armed ? (active ? `Stop ${active} Active` : 'Pause Viewer Effects') : 'Enable Viewer Effects';
    $('#emergencyStopButton').classList.toggle('arm-button', !armed);
    $('#safetyMetric').textContent = armed ? 'ON' : 'PAUSED';
    $('#safetyMetric').classList.toggle('danger-text', !armed);
    $('#safetyMetricNote').textContent = armed ? 'Viewers can trigger enabled alerts' : 'Viewer-triggered alerts are paused';
    document.querySelectorAll('[data-sound-alert-trigger]').forEach((button) => { button.disabled = !armed; });
  }

  function renderInteractiveStage() {
    renderUnifiedStage();
    const stage = state.interactiveStage;
    if (!stage) return;
    const clients = Number(stage.connectedClients || 0);
    $('#interactiveStageBadge').textContent = clients ? 'ON CANVAS' : 'READY';
    $('#interactiveStageBadge').classList.toggle('offline', false);
    $('#interactiveStageObjectCount').textContent = String(stage.activeCount || 0);
    $('#interactiveStageClientCount').textContent = String(clients);
    $('#interactiveStageRevision').textContent = String(stage.revision || 0);
    $('#interactiveStageSchema').textContent = String(stage.schemaVersion || 1);
    $('#interactiveStageHorizontalUrl').textContent = stage.horizontalUrl || 'Unavailable';
    $('#interactiveStageVerticalUrl').textContent = stage.verticalUrl || 'Unavailable';
    const horizontalCopy = $('#interactiveStageHorizontalUrl').nextElementSibling;
    const verticalCopy = $('#interactiveStageVerticalUrl').nextElementSibling;
    horizontalCopy.dataset.copyText = stage.horizontalUrl || '';
    verticalCopy.dataset.copyText = stage.verticalUrl || '';
    horizontalCopy.innerHTML = copyIcon;
    verticalCopy.innerHTML = copyIcon;
    const objects = Array.isArray(stage.objects) ? stage.objects : [];
    if (interactiveStageSelectedId && !objects.some((object) => object.id === interactiveStageSelectedId)) interactiveStageSelectedId = '';
    $('#interactiveStageSafetyState').textContent = state.safety?.armed ? 'ARMED' : 'PAUSED';
    $('#interactiveStageSafetyState').classList.toggle('danger-text', !state.safety?.armed);
    $('#interactiveStageSafetyCount').textContent = String(objects.length);

    const canvas = $('#interactiveStageLayoutCanvas');
    canvas.classList.toggle('horizontal', interactiveStageOrientation === 'horizontal');
    canvas.classList.toggle('vertical', interactiveStageOrientation === 'vertical');
    canvas.querySelectorAll('.stage-layout-object,.stage-protected-zone,.stage-world-floor,.stage-world-platform,.stage-world-interactable').forEach((node) => node.remove());
    const worldMap = stage.worldMap || { enabled: true, wanderEnabled: true, jumpEnabled: true, floorY: 0.92, speed: 0.045, gravity: 1.2, jumpStrength: 0.58, platforms: [], interactables: [] };
    const platforms = Array.isArray(worldMap.platforms) ? worldMap.platforms : [];
    const interactables = Array.isArray(worldMap.interactables) ? worldMap.interactables : [];
    if (worldMap.enabled !== false) {
      const floor = document.createElement('div');
      floor.className = 'stage-world-floor';
      floor.style.top = `${Number(worldMap.floorY || 0.92) * 100}%`;
      floor.textContent = 'AVATAR FLOOR';
      canvas.append(floor);
      for (const platform of platforms.filter((entry) => entry.enabled !== false && (entry.orientations || []).includes(interactiveStageOrientation))) {
        const platformNode = document.createElement('div');
        platformNode.className = 'stage-world-platform';
        platformNode.dataset.collision = platform.collision === 'solid' ? 'solid' : 'one-way';
        platformNode.style.left = `${Number(platform.x || 0) * 100}%`;
        platformNode.style.top = `${Number(platform.y || 0) * 100}%`;
        platformNode.style.width = `${Number(platform.width || 0.2) * 100}%`;
        platformNode.style.height = `${Math.max(0.005, Number(platform.height || 0.025)) * 100}%`;
        platformNode.style.setProperty('--stage-platform-color', String(platform.color || '#54f2eb'));
        platformNode.textContent = platform.name || 'Platform';
        canvas.append(platformNode);
      }
      for (const item of interactables.filter((entry) => entry.enabled !== false && (entry.orientations || []).includes(interactiveStageOrientation))) {
        const itemNode = document.createElement('div');
        itemNode.className = 'stage-world-interactable';
        itemNode.dataset.kind = item.kind || 'toy';
        itemNode.style.left = `${Number(item.x || 0) * 100}%`;
        itemNode.style.top = `${Number(item.y || 0) * 100}%`;
        itemNode.style.width = `${Math.max(0.015, Number(item.width || 0.05)) * 100}%`;
        itemNode.style.height = `${Math.max(0.015, Number(item.height || 0.08)) * 100}%`;
        itemNode.style.setProperty('--stage-item-color', String(item.color || '#ffbd59'));
        itemNode.textContent = String(item.glyph || 'USE').slice(0, 8);
        itemNode.title = `${item.name || item.id} · ${item.kind || 'toy'}`;
        canvas.append(itemNode);
      }
    }
    const zones = Array.isArray(stage.protectedZones) ? stage.protectedZones : [];
    for (const zone of zones.filter((entry) => entry.enabled !== false && (entry.orientations || []).includes(interactiveStageOrientation))) {
      const zoneNode = document.createElement('div');
      zoneNode.className = 'stage-protected-zone';
      zoneNode.style.left = `${Number(zone.x || 0) * 100}%`; zoneNode.style.top = `${Number(zone.y || 0) * 100}%`; zoneNode.style.width = `${Number(zone.width || 0) * 100}%`; zoneNode.style.height = `${Number(zone.height || 0) * 100}%`; zoneNode.textContent = zone.name || 'Protected';
      canvas.append(zoneNode);
    }
    for (const object of objects) {
      const placement = interactiveStageOrientation === 'vertical' ? object.scenePlacements?.vertical || object.placement : object.placement;
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'stage-layout-object';
      node.classList.toggle('selected', object.id === interactiveStageSelectedId);
      node.dataset.stageSelect = object.id;
      node.style.left = `${Number(placement?.x || 0) * 100}%`;
      node.style.top = `${Number(placement?.y || 0) * 100}%`;
      node.style.zIndex = String(Number(placement?.layer || 0) + 101);
      node.style.setProperty('--stage-object-scale', String(Number(placement?.scale || 1)));
      node.style.setProperty('--stage-object-accent', String(object.properties?.accent || '#54f2eb'));
      const glyph = document.createElement('span');
      glyph.textContent = String(object.properties?.glyph || 'STAGE').slice(0, 24);
      const label = document.createElement('strong');
      label.textContent = String(object.properties?.label || object.properties?.text || object.id).slice(0, 120);
      node.append(glyph, label);
      canvas.append(node);
    }

    const selected = objects.find((object) => object.id === interactiveStageSelectedId);
    const selectionForm = $('#interactiveStageSelectionForm');
    const selectionInputs = [...selectionForm.querySelectorAll('input,button')];
    selectionInputs.forEach((input) => { input.disabled = !selected; });
    $('#interactiveStageSelectedName').textContent = selected ? String(selected.properties?.label || selected.id) : 'None';
    $('#interactiveStageSelectedId').textContent = selected ? `${selected.kind} · ${selected.id}` : 'Select an object on the canvas.';
    if (selected && !selectionForm.contains(document.activeElement) && !interactiveStageDrag) {
      const placement = interactiveStageOrientation === 'vertical' ? selected.scenePlacements?.vertical || selected.placement : selected.placement;
      $('#interactiveStageSelectedLabel').value = String(selected.properties?.label || selected.properties?.text || selected.id);
      $('#interactiveStageSelectedGlyph').value = String(selected.properties?.glyph || 'STAGE');
      $('#interactiveStageSelectedState').value = String(selected.state || 'idle');
      $('#interactiveStageSelectedAccent').value = /^#[0-9a-f]{6}$/i.test(String(selected.properties?.accent || '')) ? selected.properties.accent : '#54f2eb';
      $('#interactiveStageSelectedX').value = Number(placement?.x || 0).toFixed(2);
      $('#interactiveStageSelectedY').value = Number(placement?.y || 0).toFixed(2);
      $('#interactiveStageSelectedScale').value = String(Number(placement?.scale || 1));
      $('#interactiveStageSelectedLayer').value = String(Number(placement?.layer || 0));
    }

    const list = $('#interactiveStageObjectList');
    list.classList.toggle('empty-state', !objects.length);
    list.innerHTML = objects.length ? objects.map((object) => `<div class="stage-object-row"><div><strong>${escapeHtml(object.properties?.label || object.properties?.text || object.id)}</strong><small>${escapeHtml(object.kind)} · ${escapeHtml(object.state)} · ${Math.round(Number(object.placement?.x || 0) * 100)}%, ${Math.round(Number(object.placement?.y || 0) * 100)}%</small><code>${escapeHtml(object.id)}</code></div><div><button type="button" class="secondary-button" data-stage-edit="${escapeHtml(object.id)}">Edit Layout</button><button type="button" class="secondary-button danger-outline" data-stage-dismiss="${escapeHtml(object.id)}">Dismiss</button></div></div>`).join('') : 'No Stage objects are active.';
    $('#interactiveStageCollision').checked = stage.collisionAvoidance !== false;
    const worldForm = $('#interactiveStageWorldForm');
    if (worldForm && !worldForm.contains(document.activeElement)) {
      $('#interactiveStageWorldEnabled').checked = worldMap.enabled !== false;
      $('#interactiveStageWanderEnabled').checked = worldMap.wanderEnabled !== false;
      $('#interactiveStageJumpEnabled').checked = worldMap.jumpEnabled !== false;
      $('#interactiveStageFloorY').value = String(Number(worldMap.floorY || 0.92));
      $('#interactiveStageWorldSpeed').value = String(Number(worldMap.speed || 0.045));
      $('#interactiveStageWorldGravity').value = String(Number(worldMap.gravity || 1.2));
      $('#interactiveStageJumpStrength').value = String(Number(worldMap.jumpStrength || 0.58));
    }
    const platformList = $('#interactiveStagePlatformList');
    platformList.classList.toggle('empty-state', !platforms.length);
    platformList.innerHTML = platforms.length ? platforms.map((platform) => `<div class="stage-platform-row"><div><strong>${escapeHtml(platform.name || platform.id)}</strong><small>${Math.round(Number(platform.x) * 100)}%, ${Math.round(Number(platform.y) * 100)}% · ${Math.round(Number(platform.width) * 100)}×${Math.round(Number(platform.height) * 100)}% · ${escapeHtml(platform.collision || 'one-way')} · ${escapeHtml((platform.orientations || []).join(' + '))}</small></div><i style="--stage-platform-color:${escapeHtml(platform.color || '#54f2eb')}"></i></div>`).join('') : 'No platforms configured. Avatars will use the canvas floor.';
    const interactableList = $('#interactiveStageInteractableList');
    interactableList.classList.toggle('empty-state', !interactables.length);
    interactableList.innerHTML = interactables.length ? interactables.map((item) => `<div class="stage-platform-row"><div><strong>${escapeHtml(item.name || item.id)}</strong><small>${escapeHtml(item.kind || 'toy')}${item.linkId ? ` · link ${escapeHtml(item.linkId)}` : ''} · ${Math.round(Number(item.x) * 100)}%, ${Math.round(Number(item.y) * 100)}% · ${escapeHtml((item.orientations || []).join(' + '))}</small></div><i style="--stage-platform-color:${escapeHtml(item.color || '#ffbd59')}"></i></div>`).join('') : 'No gameplay objects configured.';
    const zoneList = $('#interactiveStageZoneList');
    zoneList.classList.toggle('empty-state', !zones.length);
    zoneList.innerHTML = zones.length ? zones.map((zone) => `<div><div><strong>${escapeHtml(zone.name)}</strong><small>${Math.round(zone.x * 100)}%, ${Math.round(zone.y * 100)}% · ${Math.round(zone.width * 100)}×${Math.round(zone.height * 100)}% · ${escapeHtml((zone.orientations || []).join(' + '))}</small></div></div>`).join('') : 'No protected zones configured.';
  }

  function renderUnifiedStage() {
    const unified = state.unifiedStage;
    if (!unified) return;
    const settings = unified.settings || { enabled: false, modules: {} };
    const clients = Number(unified.connectedClients || 0);
    $('#unifiedStageBadge').textContent = settings.enabled === false ? 'OFF' : clients ? 'ON CANVAS' : 'READY';
    $('#unifiedStageBadge').classList.toggle('offline', settings.enabled === false);
    $('#unifiedStageEnabled').checked = settings.enabled !== false;
    document.querySelectorAll('[data-unified-module]').forEach((input) => {
      input.checked = settings.modules?.[input.dataset.unifiedModule] === true;
      input.disabled = settings.enabled === false;
    });
    $('#unifiedStageUrl').textContent = unified.url || 'Unavailable';
    $('#unifiedStageAudioUrl').textContent = unified.interactionAudioUrl || 'Unavailable';
    for (const element of [$('#unifiedStageUrl'), $('#unifiedStageAudioUrl')]) {
      const button = element.nextElementSibling;
      button.dataset.copyText = element.textContent === 'Unavailable' ? '' : element.textContent;
      button.innerHTML = copyIcon;
    }
    const count = Number(unified.activeModuleCount || 0);
    $('#unifiedStageLifecycleStatus').innerHTML = settings.enabled === false
      ? '<strong>Unified Stage is fully off:</strong> no feature frames are mounted. The lightweight settings connection remains only so the existing Browser Source can be turned back on without reloading Broadcast.'
      : `<strong>${count} module${count === 1 ? '' : 's'} loaded:</strong> unchecked modules have no renderer, event feed, media decoder, animation loop, or WebGL context. Disable the old individual sources in Broadcast after adding this URL.`;
  }

  async function saveUnifiedStageSettings() {
    const button = $('#saveUnifiedStageSettings');
    button.disabled = true;
    try {
      const modules = {};
      document.querySelectorAll('[data-unified-module]').forEach((input) => { modules[input.dataset.unifiedModule] = input.checked; });
      state.unifiedStage = await api('/v1/unified-stage/settings', { method: 'POST', body: { enabled: $('#unifiedStageEnabled').checked, modules } });
      renderUnifiedStage();
      toast('Unified Stage saved. Disabled modules were unloaded immediately.');
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
  }

  async function syncUnifiedModule(moduleId, enabled) {
    if (!state.unifiedStage?.settings) return;
    state.unifiedStage = await api('/v1/unified-stage/settings', { method: 'POST', body: { modules: { [moduleId]: Boolean(enabled) } } });
  }

  function unifiedVisualUrl(moduleId, fallback) {
    return state.unifiedStage?.settings?.enabled !== false && state.unifiedStage?.settings?.modules?.[moduleId] === true
      ? state.unifiedStage?.url || fallback
      : fallback;
  }

  function stageActorInputId(stateName, suffix) {
    return `stageActor${stateName.charAt(0).toUpperCase()}${stateName.slice(1)}${suffix}`;
  }

  function renderStageActors() {
    const catalog = state.stageActors || { packs: [], diagnostics: [] };
    const packs = Array.isArray(catalog.packs) ? catalog.packs : [];
    $('#stageActorPackBadge').textContent = `${packs.length} PACK${packs.length === 1 ? '' : 'S'}`;
    $('#stageActorPackBadge').classList.toggle('online', packs.length > 0);
    const library = $('#stageActorPackLibrary');
    library.classList.toggle('empty-state', !packs.length);
    library.innerHTML = packs.length ? packs.map((pack) => {
      const states = Object.keys(pack.animations || {});
      const idle = pack.animations?.idle || {};
      const previewFrameWidth = Math.max(1, Number(idle.frameWidth || 1) / Math.max(1, Number(idle.frameHeight || 1)) * 54);
      const previewStyle = `background-image:url(&quot;${escapeHtml(pack.previewUrl || '')}&quot;);background-size:${pack.thumbnail ? 'cover' : `${Math.max(1, Number(idle.frames || 1)) * previewFrameWidth}px 54px`}`;
      const primaryColors = pack.appearance?.colorSlots?.primary?.options?.length || 0;
      const secondaryColors = pack.appearance?.colorSlots?.secondary?.options?.length || 0;
      const appearanceSummary = primaryColors && secondaryColors ? `<small>${primaryColors} ${escapeHtml(pack.appearance.colorSlots.primary.label)} colors · ${secondaryColors} ${escapeHtml(pack.appearance.colorSlots.secondary.label)} colors · ${primaryColors * secondaryColors} combinations</small>` : '';
      const templateSummary = pack.rig?.template ? `<small>2D TEMPLATE · ${escapeHtml(pack.rig.template.id)} · ${Number(pack.rig.layers?.length || 0)} bounded parts</small>` : '';
      const atlasSummary = pack.atlas ? `<small>ROW ATLAS · ${Number(pack.atlas.columns)}×${Number(pack.atlas.rows)} CELLS · ${Number(pack.atlas.frameWidth)}×${Number(pack.atlas.frameHeight)} PX</small>` : '';
      return `<div class="stage-actor-pack-card"><i class="stage-actor-pack-preview" style="${previewStyle}" aria-hidden="true"></i><div><strong>${escapeHtml(pack.name)}</strong><span>${escapeHtml(pack.creator || 'Local creator')} · v${escapeHtml(pack.version || '1.0.0')}</span>${atlasSummary}${templateSummary}<small>${escapeHtml(states.join(' · ') || 'idle')}</small>${appearanceSummary}<small>${escapeHtml(pack.license || 'License not specified')} · ${Math.round(Number(pack.defaultScale || 1) * 100)}% Stage scale</small></div><div class="stage-actor-card-actions"><button type="button" class="secondary-button" data-stage-actor-edit="${escapeHtml(pack.id)}">Edit</button><button type="button" class="secondary-button" data-stage-actor-export="${escapeHtml(pack.id)}">Export</button><button type="button" class="secondary-button danger-outline" data-stage-actor-remove="${escapeHtml(pack.id)}">Remove</button></div></div>`;
    }).join('') : 'No native avatar packs yet.';
    const selector = $('#worldViewerActorPack');
    const current = selector.value;
    const defaultActorLabel = packs[0] ? `Default · ${packs[0].name}` : 'Generated placeholder';
    selector.innerHTML = `<option value="">${escapeHtml(defaultActorLabel)}</option>${packs.map((pack) => `<option value="${escapeHtml(pack.id)}">${escapeHtml(pack.name)}</option>`).join('')}`;
    selector.value = packs.some((pack) => pack.id === current) ? current : '';
  }

  async function chooseStageActorStrip(stateName) {
    try {
      const selection = await window.tempestStudio.selectStageActorStrip();
      if (!selection) return;
      stageActorDraftStrips.set(stateName, selection);
      const label = $(`#${stageActorInputId(stateName, 'Strip')}`);
      label.textContent = `${selection.fileName} · ${selection.width}×${selection.height}`;
      const frameWidth = Number($('#stageActorFrameWidth').value);
      const frameHeight = Number($('#stageActorFrameHeight').value);
      if (frameWidth > 0 && selection.height === frameHeight && selection.width % frameWidth === 0) {
        $(`#${stageActorInputId(stateName, 'Frames')}`).value = String(selection.width / frameWidth);
      }
    } catch (error) { toast(error.message, true); }
  }

  function updateStageActorBuildMode() {
    const mode = $('#stageActorBuildMode').value;
    const templateMode = mode === 'template';
    const atlasMode = mode === 'atlas';
    $('#stageActorTemplateSelector').hidden = !templateMode;
    $('#stageActorTemplateFields').hidden = !templateMode;
    $('#stageActorAtlasFields').hidden = !atlasMode;
    $('#stageActorFrameSizeField').hidden = templateMode;
    $('#stageActorStripFields').hidden = mode !== 'strips';
    $('#stageActorBuildHelp').textContent = templateMode
      ? 'Paint only inside the named 512×512 cells. Pixels outside each cell are never rendered.'
      : atlasMode
        ? 'Use one transparent PNG grid. Each row is one animation and every frame stays inside its cell.'
        : 'Legacy mode: each strip must be exactly frame width × frame count, with one row of equal-size frames.';
  }

  async function chooseStageActorAtlas() {
    try {
      const selection = await window.tempestStudio.selectStageActorStrip();
      if (!selection) return;
      const frameWidth = Number($('#stageActorFrameWidth').value);
      const frameHeight = Number($('#stageActorFrameHeight').value);
      if (!frameWidth || !frameHeight || selection.width % frameWidth || selection.height % frameHeight) return toast(`The atlas must divide exactly into ${frameWidth}×${frameHeight} cells; this PNG is ${selection.width}×${selection.height}.`, true);
      const columns = selection.width / frameWidth;
      const rows = selection.height / frameHeight;
      if (columns < 1 || columns > 120 || rows < 1 || rows > 32) return toast(`The atlas must contain 1–120 columns and 1–32 rows; this PNG has ${columns}×${rows}.`, true);
      stageActorDraftAtlas = { ...selection, columns, rows };
      const atlasFields = ['Idle', 'Walk', 'Sit', 'Stand', 'Jump', 'Attack', 'Custom2'];
      atlasFields.forEach((field, row) => {
        const rowInput = $(`#stageActorAtlas${field}Row`);
        const framesInput = $(`#stageActorAtlas${field}Frames`);
        const fieldRow = rowInput.closest('.stage-actor-strip-row');
        fieldRow.hidden = row >= rows;
        rowInput.max = String(rows - 1);
        if (row < rows) rowInput.value = String(row);
        framesInput.max = String(columns);
        framesInput.value = String(Math.max(1, Math.min(columns, Number(framesInput.value) || 1)));
      });
      $('#stageActorAtlasTexture').textContent = `${selection.fileName} · ${selection.width}×${selection.height} · ${columns}×${rows} cells`;
      $('#stageActorBuildHelp').textContent = `${columns} columns × ${rows} rows detected. Adjust frame counts if this atlas does not include metadata.`;
    } catch (error) { toast(error.message, true); }
  }

  async function chooseStageActorTexture() {
    try {
      const selection = await window.tempestStudio.selectStageActorTexture();
      if (!selection) return;
      if (selection.width !== 2048 || selection.height !== 2560) return toast(`The Humanoid Wisp v1 texture must be exactly 2048×2560; this PNG is ${selection.width}×${selection.height}.`, true);
      stageActorDraftTexture = selection;
      $('#stageActorTemplateTexture').textContent = `${selection.fileName} · ${selection.width}×${selection.height}`;
    } catch (error) { toast(error.message, true); }
  }

  async function createStageActorPack(event) {
    event.preventDefault();
    const mode = $('#stageActorBuildMode').value;
    const templateMode = mode === 'template';
    const atlasMode = mode === 'atlas';
    if (templateMode && !stageActorDraftTexture) return toast('Choose the required Humanoid Wisp template texture first.', true);
    if (atlasMode && !stageActorDraftAtlas) return toast('Choose the required avatar atlas first.', true);
    if (mode === 'strips' && !stageActorDraftStrips.has('idle')) return toast('Choose the required idle animation strip first.', true);
    const states = ['idle', 'walk', 'jump', 'attack', 'celebrate'];
    const atlasStates = [
      { stateName: 'idle', field: 'Idle' }, { stateName: 'walk', field: 'Walk' }, { stateName: 'sit', field: 'Sit' },
      { stateName: 'stand', field: 'Stand' }, { stateName: 'jump', field: 'Jump' }, { stateName: 'attack', field: 'Attack' },
      { stateName: 'custom2', field: 'Custom2' }
    ];
    const animations = atlasMode ? atlasStates.filter(({ field }) => Number($(`#stageActorAtlas${field}Row`).value) < Number(stageActorDraftAtlas.rows)).map(({ stateName, field }) => ({
      state: stateName,
      row: Number($(`#stageActorAtlas${field}Row`).value),
      frames: Number($(`#stageActorAtlas${field}Frames`).value),
      fps: Number($(`#stageActorAtlas${field}Fps`).value),
      loop: ['idle', 'walk', 'sit', 'stand'].includes(stateName),
      returnsToIdle: !['idle', 'walk', 'sit', 'stand'].includes(stateName)
    })) : templateMode ? [] : states.filter((stateName) => stageActorDraftStrips.has(stateName)).map((stateName) => ({
        state: stateName,
        handle: stageActorDraftStrips.get(stateName).handle,
        frames: Number($(`#${stageActorInputId(stateName, 'Frames')}`).value),
        fps: Number($(`#${stageActorInputId(stateName, 'Fps')}`).value),
        loop: ['idle', 'walk'].includes(stateName),
        returnsToIdle: !['idle', 'walk'].includes(stateName)
      }));
    try {
      const result = await window.tempestStudio.createStageActorPack({
        name: $('#stageActorName').value.trim(), creator: $('#stageActorCreator').value.trim(), license: $('#stageActorLicense').value.trim(),
        version: '1.0.0', frameWidth: Number($('#stageActorFrameWidth').value), frameHeight: Number($('#stageActorFrameHeight').value),
        defaultScale: Number($('#stageActorScale').value), animations,
        ...(atlasMode ? { atlasHandle: stageActorDraftAtlas.handle } : {}),
        ...(templateMode ? { templateId: $('#stageActorTemplateId').value, templateTextureHandle: stageActorDraftTexture.handle } : {})
      });
      state.stageActors = result.catalog;
      stageActorDraftStrips.clear();
      stageActorDraftTexture = null;
      stageActorDraftAtlas = null;
      $('#stageActorTemplateTexture').textContent = 'Required · no file chosen';
      $('#stageActorAtlasTexture').textContent = 'Required · no file chosen';
      for (const stateName of states) $(`#${stageActorInputId(stateName, 'Strip')}`).textContent = stateName === 'idle' ? 'Required · no file chosen' : 'Optional';
      $('#stageActorName').value = '';
      await refreshInteractiveWorld();
      toast(`${result.manifest.name} is ready for the Interactive Stage.`);
    } catch (error) { toast(error.message, true); }
  }

  async function exportStageActorPack(packId) {
    try {
      const result = await window.tempestStudio.exportStageActorPack({ packId });
      if (result) toast(`${result.name} exported with ${result.assetCount} animation asset${result.assetCount === 1 ? '' : 's'}.`);
    } catch (error) { toast(error.message, true); }
  }

  function openStageActorEditor(packId) {
    const pack = state.stageActors?.packs?.find((entry) => entry.id === packId);
    if (!pack) return;
    $('#stageActorEditId').value = pack.id;
    $('#stageActorEditName').value = pack.name || '';
    $('#stageActorEditVersion').value = pack.version || '1.0.0';
    $('#stageActorEditCreator').value = pack.creator || '';
    $('#stageActorEditScale').value = String(pack.defaultScale || 1);
    $('#stageActorEditLicense').value = pack.license || '';
    $('#stageActorEditDescription').value = pack.description || '';
    $('#stageActorEditDialog').showModal();
  }

  async function saveStageActorEdit(event) {
    event.preventDefault();
    try {
      const result = await window.tempestStudio.updateStageActorPack({ packId: $('#stageActorEditId').value, name: $('#stageActorEditName').value.trim(), version: $('#stageActorEditVersion').value.trim(), creator: $('#stageActorEditCreator').value.trim(), defaultScale: Number($('#stageActorEditScale').value), license: $('#stageActorEditLicense').value.trim(), description: $('#stageActorEditDescription').value.trim() });
      state.stageActors = result.catalog;
      $('#stageActorEditDialog').close();
      await refreshInteractiveWorld();
      toast(`${result.manifest.name} updated.`);
    } catch (error) { toast(error.message, true); }
  }

  async function importStageActorPack() {
    try {
      const result = await window.tempestStudio.importStageActorPack();
      if (!result) return;
      state.stageActors = result.catalog;
      await refreshInteractiveWorld();
      toast(`${result.manifest.name} imported as a new managed pack.`);
    } catch (error) { toast(error.message, true); }
  }

  async function importStreamingAvatarsLibrary() {
    try {
      const result = await window.tempestStudio.importStreamingAvatarsLibrary();
      if (!result) return;
      state.stageActors = result.catalog;
      await refreshInteractiveWorld();
      const skipped = Number(result.skipped?.length || 0);
      toast(`${result.imported} avatar${result.imported === 1 ? '' : 's'} imported from ${result.discovered} metadata record${result.discovered === 1 ? '' : 's'}${skipped ? `; ${skipped} skipped` : ''}.`, skipped > 0);
    } catch (error) { toast(error.message, true); }
  }

  async function removeStageActorPack(packId) {
    const pack = state.stageActors?.packs?.find((entry) => entry.id === packId);
    try {
      const result = await window.tempestStudio.removeStageActorPack({ packId, name: pack?.name || packId });
      if (!result) return;
      state.stageActors = result;
      await refreshInteractiveWorld();
      toast(`${pack?.name || 'Stage Actor pack'} removed${result.affectedViewers ? `; ${result.affectedViewers} viewer${result.affectedViewers === 1 ? '' : 's'} returned to placeholders` : ''}.`);
    } catch (error) { toast(error.message, true); }
  }

  function renderInteractiveWorld() {
    const world = state.interactiveWorld;
    if (!world) return;
    renderStageActors();
    const viewers = Array.isArray(world.viewers) ? world.viewers : [];
    const pet = world.pet || {};
    const battle = world.battle;
    const gaze = world.gaze || {};
    const safety = world.safety || {};
    const presence = world.presence || {};
    $('#worldStateBadge').textContent = safety.interactionsEnabled ? 'WORLD READY' : 'PAUSED';
    $('#worldStateBadge').classList.toggle('offline', !safety.interactionsEnabled);
    $('#worldCrowdMetric').textContent = String(viewers.length);
    $('#worldCrowdBadge').textContent = `${viewers.length} / ${safety.maximumCrowd || 0}`;
    $('#worldPetMetric').textContent = pet.enabled ? 'LIVE' : 'OFF';
    $('#worldPetMetricNote').textContent = pet.enabled ? `${pet.name} · ${pet.state}` : 'Not on Stage';
    $('#worldPetBadge').textContent = pet.enabled ? String(pet.state || 'LIVE').toUpperCase() : 'OFF STAGE';
    $('#worldPetBadge').classList.toggle('online', Boolean(pet.enabled));
    $('#worldPetMood').textContent = String(Math.round(Number(pet.mood || 0)));
    $('#worldPetEnergy').textContent = String(Math.round(Number(pet.energy || 0)));
    $('#worldPetHunger').textContent = String(Math.round(Number(pet.hunger || 0)));
    $('#worldPetLevel').textContent = String(pet.level || 1);
    if (!$('#worldPetForm').contains(document.activeElement)) {
      $('#worldPetName').value = pet.name || 'Nimbus';
      $('#worldPetAccessory').value = pet.accessory || '';
      $('#worldPetEnabled').checked = Boolean(pet.enabled);
    }
    const battleState = battle?.state || 'idle';
    $('#worldBattleMetric').textContent = battleState.toUpperCase();
    $('#worldBattleMetricNote').textContent = battle ? `${battle.mode === 'boss' ? 'Boss battle' : 'Viewer duel'} · ${battle.winner ? `Winner ${battle.winner}` : `Round ${battle.round || 1}`}` : 'No active session';
    $('#worldBattleBadge').textContent = battleState.toUpperCase();
    $('#worldBattleBadge').classList.toggle('online', battleState === 'active');
    $('#worldGazeMetric').textContent = gaze.connected ? 'LIVE' : gaze.enabled ? 'READY' : 'OFF';
    $('#worldGazeMetricNote').textContent = gaze.enabled ? `${gaze.adapter || 'Local adapter'} · ${gaze.effect || 'cursor'}` : 'Local adapter disabled';
    $('#worldGazeBadge').textContent = gaze.connected ? 'TRACKING' : gaze.enabled ? 'WAITING' : 'DISABLED';
    $('#worldGazeBadge').classList.toggle('online', Boolean(gaze.connected));
    if ($('#worldTobiiStatus')) $('#worldTobiiStatus').innerHTML = `<strong>Tobii:</strong> ${escapeHtml(state.tobiiAdapter?.message || 'Adapter status is available after this workspace refresh.')}`;
    if (!$('#worldGazeForm').contains(document.activeElement)) {
      $('#worldGazeEnabled').checked = Boolean(gaze.enabled);
      $('#worldGazeAdapter').value = gaze.adapter || 'generic-local';
      $('#worldGazeEffect').value = gaze.effect || 'cursor';
      $('#worldGazeOffsetX').value = String(gaze.calibration?.offsetX || 0);
      $('#worldGazeOffsetY').value = String(gaze.calibration?.offsetY || 0);
      $('#worldGazeScaleX').value = String(gaze.calibration?.scaleX || 1);
      $('#worldGazeScaleY').value = String(gaze.calibration?.scaleY || 1);
    }
    $('#worldSafetyBadge').textContent = safety.interactionsEnabled ? 'ACTIVE' : 'PAUSED';
    $('#worldSafetyBadge').classList.toggle('offline', !safety.interactionsEnabled);
    if (!$('#worldSafetyForm').contains(document.activeElement)) {
      $('#worldMaximumCrowd').value = String(safety.maximumCrowd || 30);
      $('#worldMaximumObjects').value = String(safety.maximumStageObjects || 60);
      $('#worldMaximumEffects').value = String(safety.maximumConcurrentEffects || 8);
      $('#worldAttackCooldown').value = String((Number(safety.minimumAttackCooldownMs || 1500) / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
      $('#worldVolumeCeiling').value = String(Math.round(Number(safety.volumeCeiling ?? 0.8) * 100));
      $('#worldInteractionsEnabled').checked = safety.interactionsEnabled !== false;
      $('#worldAllowJumpscares').checked = safety.allowJumpscares !== false;
      $('#worldReducedMotion').checked = safety.reducedMotion === true;
      $('#worldReducedFlashing').checked = safety.reducedFlashing !== false;
    }
    if (!$('#worldPresenceForm').contains(document.activeElement)) {
      $('#worldPresenceEnabled').checked = presence.enabled !== false;
      $('#worldAvatarSize').value = String(Math.round(Number(presence.avatarScale || 1) * 100));
      $('#worldAvatarSizeValue').textContent = `${$('#worldAvatarSize').value}%`;
      $('#worldPresenceMessages').value = String(presence.minimumMessages || 1);
      $('#worldPresenceInactive').value = String(Math.round(Number(presence.inactiveAfterMs || 1200000) / 60000));
      $('#worldPresenceRemove').value = String(Math.round(Number(presence.removeFromStageAfterMs || 2700000) / 60000));
    }

    const avatarRedeems = Array.isArray(world.avatarChannelPointRedeems) ? world.avatarChannelPointRedeems : [];
    const avatarRewardSession = world.avatarRewardSession || {};
    $('#worldAvatarRedeemBadge').textContent = `${avatarRedeems.length} REDEEM${avatarRedeems.length === 1 ? '' : 'S'}`;
    const avatarRedeemList = $('#worldAvatarRedeemList');
    avatarRedeemList.classList.toggle('empty-state', !avatarRedeems.length);
    const effectNames = { 'primary-color': 'Primary color', 'secondary-color': 'Secondary color', accessory: 'Accessory', title: 'Avatar title', emote: 'Emote', celebrate: 'Celebrate' };
    avatarRedeemList.innerHTML = avatarRedeems.length ? avatarRedeems.map((redeem) => `<div><div><strong>${escapeHtml(redeem.name)}</strong><small>${escapeHtml(redeem.rewardId ? `Reward ID: ${redeem.rewardId}` : `Exact title: ${redeem.rewardTitle || ''}`)} · ${escapeHtml(effectNames[redeem.effect] || redeem.effect)}${redeem.value ? ` · ${escapeHtml(redeem.value)}` : ''} · ${redeem.persistence === 'profile' ? 'saved unlock' : 'this stream'}</small></div><div class="world-row-actions"><button type="button" class="secondary-button" data-world-avatar-redeem-test="${escapeHtml(redeem.id)}">Test</button><button type="button" class="secondary-button danger-outline" data-world-avatar-redeem-remove="${escapeHtml(redeem.id)}">Remove</button></div></div>`).join('') : 'No avatar Channel Point redeems configured.';
    const activeRewardViewers = Number(avatarRewardSession.activeViewerCount || 0);
    const rewardHistoryCount = Array.isArray(avatarRewardSession.redemptions) ? avatarRewardSession.redemptions.length : 0;
    $('#worldAvatarRedeemSessionNote').textContent = activeRewardViewers ? `${activeRewardViewers} viewer${activeRewardViewers === 1 ? '' : 's'} wearing temporary rewards · ${rewardHistoryCount} redeemed this session` : 'No temporary avatar rewards are active.';

    const viewerList = $('#worldViewerList');
    viewerList.classList.toggle('empty-state', !viewers.length);
    const actorPacks = Array.isArray(state.stageActors?.packs) ? state.stageActors.packs : [];
    viewerList.innerHTML = viewers.length ? viewers.map((viewer) => `<div class="world-viewer-row ${viewer.onStage === false ? 'inactive' : ''}"><i class="world-viewer-avatar" style="--viewer-accent:${escapeHtml(viewer.accent || '#54f2eb')}">${escapeHtml(String(viewer.displayName || '?').slice(0, 1).toUpperCase())}</i><div><strong>${escapeHtml(viewer.displayName)}${viewer.cosmetics?.title ? ` · ${escapeHtml(viewer.cosmetics.title)}` : ''}</strong><small>${escapeHtml(viewer.key)} · ${escapeHtml(viewer.presence || 'active')} · ${escapeHtml(viewer.avatarState || 'idle')} · ${escapeHtml(actorPacks.find((pack) => pack.id === viewer.actorPackId)?.name || 'placeholder')}</small></div><div class="world-row-actions"><select data-world-viewer-actor="${escapeHtml(viewer.key)}" aria-label="Actor pack for ${escapeHtml(viewer.displayName)}"><option value="">Placeholder</option>${actorPacks.map((pack) => `<option value="${escapeHtml(pack.id)}" ${pack.id === viewer.actorPackId ? 'selected' : ''}>${escapeHtml(pack.name)}</option>`).join('')}</select><button data-world-viewer-cosmetics="${escapeHtml(viewer.key)}" class="secondary-button">Look</button><button data-world-viewer-control="${escapeHtml(viewer.key)}" data-world-control="left" class="secondary-button" title="Move left">←</button><button data-world-viewer-control="${escapeHtml(viewer.key)}" data-world-control="right" class="secondary-button" title="Move right">→</button><button data-world-viewer-control="${escapeHtml(viewer.key)}" data-world-control="jump" class="secondary-button">Jump</button><button data-world-viewer-control="${escapeHtml(viewer.key)}" data-world-control="interact" class="secondary-button">Use</button><button data-world-viewer-state="${escapeHtml(viewer.key)}" data-world-state="celebrate" class="secondary-button">Cheer</button><button data-world-viewer-remove="${escapeHtml(viewer.key)}" class="secondary-button danger-outline">×</button></div></div>`).join('') : 'No viewer avatars are active.';

    const participants = battle ? [...(battle.participants || []), ...(battle.boss ? [battle.boss] : [])] : [];
    const battleDisplay = $('#worldBattleDisplay');
    battleDisplay.classList.toggle('empty-state', !participants.length);
    battleDisplay.innerHTML = participants.length ? participants.map((participant) => `<div class="world-battle-row"><div><strong>${escapeHtml(participant.displayName)}${participant.defeated ? ' · DEFEATED' : ''}</strong><small>${escapeHtml(participant.team || '')} · ${Math.round(Number(participant.health || 0))} HP · ${Math.round(Number(participant.shield || 0))} shield</small></div><span class="world-health"><i style="width:${Math.max(0, Math.min(100, Number(participant.health || 0) / Math.max(1, Number(participant.maximumHealth || 1)) * 100))}%"></i></span></div>`).join('') : 'Add crowd avatars, then start a duel or boss encounter.';
    document.querySelectorAll('[data-world-battle-action]').forEach((button) => { button.disabled = battleState !== 'active'; });
    $('#worldEndBattle').disabled = !battle || !['active', 'waiting'].includes(battleState);
    renderInteractionComposer();
  }

  async function refreshInteractiveWorld() {
    [state.interactiveWorld, state.interactiveStage, state.stageActors, state.interactionComposer, state.tobiiAdapter] = await Promise.all([api('/v1/interactive-world'), api('/v1/interactive-stage'), api('/v1/stage-actors'), api('/v1/interaction-composer'), api('/v1/interactive-world/gaze/adapter')]);
    renderInteractiveWorld();
    renderInteractiveStage();
  }

  async function addWorldViewer(event) {
    event.preventDefault();
    const displayName = $('#worldViewerName').value.trim();
    if (!displayName) return;
    try {
      state.interactiveWorld = await api('/v1/interactive-world/viewers', { method: 'POST', body: { platform: $('#worldViewerPlatform').value, userId: `${$('#worldViewerPlatform').value}-${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || crypto.randomUUID()}`, displayName, accent: $('#worldViewerAccent').value, actorPackId: $('#worldViewerActorPack').value || undefined } });
      $('#worldViewerName').value = '';
      await refreshInteractiveWorld();
      toast(`${displayName} joined the Stage crowd.`);
    } catch (error) { toast(error.message, true); }
  }

  async function spawnWorldDemoCrowd() {
    const samples = [['Nova', '#54F2EB'], ['Rook', '#FF667A'], ['Pixel', '#B99CFF'], ['Echo', '#FFB45C']];
    try {
      for (const [displayName, accent] of samples) await api('/v1/interactive-world/viewers', { method: 'POST', body: { platform: 'studio', userId: `demo-${displayName.toLowerCase()}`, displayName, accent } });
      await refreshInteractiveWorld();
      toast('Demo crowd added to Interactive Stage.');
    } catch (error) { toast(error.message, true); }
  }

  async function clearWorldCrowd() {
    try { await api('/v1/interactive-world/viewers/clear', { method: 'POST', body: {} }); await refreshInteractiveWorld(); toast('Stage crowd cleared.'); }
    catch (error) { toast(error.message, true); }
  }

  async function saveWorldAvatarRedeem(event) {
    event.preventDefault();
    const matchType = $('#worldAvatarRedeemMatchType').value;
    const match = $('#worldAvatarRedeemMatch').value.trim();
    const effect = $('#worldAvatarRedeemEffect').value;
    const value = $('#worldAvatarRedeemValue').value.trim();
    const redeems = [...(state.interactiveWorld?.avatarChannelPointRedeems || []), {
      id: `avatar-redeem-${crypto.randomUUID()}`,
      name: $('#worldAvatarRedeemName').value.trim(),
      ...(matchType === 'id' ? { rewardId: match } : { rewardTitle: match }),
      effect,
      ...(value ? { value } : {}),
      persistence: $('#worldAvatarRedeemPersistence').value,
      enabled: true
    }];
    try {
      state.interactiveWorld = await api('/v1/interactive-world/avatar-redeems', { method: 'POST', body: { redeems } });
      $('#worldAvatarRedeemForm').reset();
      $('#worldAvatarRedeemMatchType').value = 'title';
      $('#worldAvatarRedeemEffect').value = 'primary-color';
      $('#worldAvatarRedeemPersistence').value = 'session';
      $('#worldAvatarRedeemValue').placeholder = '#B99CFF';
      renderInteractiveWorld();
      toast('Avatar Channel Point redeem added.');
    } catch (error) { toast(error.message, true); }
  }

  async function removeWorldAvatarRedeem(redeemId) {
    const redeems = (state.interactiveWorld?.avatarChannelPointRedeems || []).filter((entry) => entry.id !== redeemId);
    try { state.interactiveWorld = await api('/v1/interactive-world/avatar-redeems', { method: 'POST', body: { redeems } }); renderInteractiveWorld(); toast('Avatar redeem removed.'); }
    catch (error) { toast(error.message, true); }
  }

  async function testWorldAvatarRedeem(redeemId) {
    try { state.interactiveWorld = await api('/v1/interactive-world/avatar-redeems/test', { method: 'POST', body: { redeemId, viewerName: 'Redeem Tester' } }); await refreshInteractiveWorld(); toast('Avatar redeem sent to the Browser Source.'); }
    catch (error) { toast(error.message, true); }
  }

  async function resetWorldAvatarRewardSession() {
    try { state.interactiveWorld = await api('/v1/interactive-world/avatar-redeems/reset-session', { method: 'POST', body: {} }); await refreshInteractiveWorld(); toast('Temporary avatar rewards reset for the next stream session.'); }
    catch (error) { toast(error.message, true); }
  }

  function updateWorldAvatarRedeemValueHint() {
    const effect = $('#worldAvatarRedeemEffect').value;
    const hints = { 'primary-color': '#54F2EB', 'secondary-color': '#B99CFF', accessory: 'Storm crown', title: 'Wisp Champion', emote: 'No value needed', celebrate: 'No value needed' };
    $('#worldAvatarRedeemValue').placeholder = hints[effect] || 'Effect value';
    $('#worldAvatarRedeemValue').disabled = effect === 'emote' || effect === 'celebrate';
    $('#worldAvatarRedeemPersistence').disabled = effect === 'emote' || effect === 'celebrate';
    if ($('#worldAvatarRedeemPersistence').disabled) $('#worldAvatarRedeemPersistence').value = 'session';
    if ($('#worldAvatarRedeemValue').disabled) $('#worldAvatarRedeemValue').value = '';
  }

  async function setWorldViewerState(key, avatarState) {
    try { await api(`/v1/interactive-world/viewers/${encodeURIComponent(key)}/state`, { method: 'POST', body: { state: avatarState } }); await refreshInteractiveWorld(); }
    catch (error) { toast(error.message, true); }
  }

  async function controlWorldViewer(key, action) {
    try { await api(`/v1/interactive-world/viewers/${encodeURIComponent(key)}/control`, { method: 'POST', body: { action } }); await refreshInteractiveWorld(); }
    catch (error) { toast(error.message, true); }
  }

  async function setWorldViewerActor(key, actorPackId) {
    try { await api(`/v1/interactive-world/viewers/${encodeURIComponent(key)}/actor`, { method: 'POST', body: { actorPackId } }); await refreshInteractiveWorld(); }
    catch (error) { toast(error.message, true); }
  }

  function updateWorldViewerColorPreview() {
    const primary = $('#worldViewerPrimaryColor').value || '#54F2EB';
    const secondary = $('#worldViewerSecondaryColor').value || '#B99CFF';
    $('#worldViewerPrimarySwatch').style.setProperty('--swatch', primary);
    $('#worldViewerSecondarySwatch').style.setProperty('--swatch', secondary);
    $('#worldViewerColorCombination').textContent = `${$('#worldViewerPrimaryColor').selectedOptions[0]?.textContent || primary} + ${$('#worldViewerSecondaryColor').selectedOptions[0]?.textContent || secondary}`;
  }

  function populateWorldViewerColorSelect(select, slot, currentColor, fallbackName) {
    const options = Array.isArray(slot?.options) && slot.options.length ? slot.options : [{ id: 'current', name: fallbackName, color: currentColor }];
    select.innerHTML = options.map((option) => `<option value="${escapeHtml(option.color)}">${escapeHtml(option.name)}</option>`).join('');
    const match = options.find((option) => String(option.color).toUpperCase() === String(currentColor).toUpperCase()) || options.find((option) => option.id === slot?.defaultOptionId) || options[0];
    select.value = match.color;
  }

  function editWorldViewerCosmetics(key) {
    const viewer = state.interactiveWorld?.viewers?.find((entry) => entry.key === key);
    if (!viewer) return;
    const pack = state.stageActors?.packs?.find((entry) => entry.id === viewer.actorPackId);
    const primary = viewer.cosmetics?.primaryColor || viewer.accent || '#54F2EB';
    const secondary = viewer.cosmetics?.secondaryColor || '#B99CFF';
    $('#worldViewerLookKey').value = key;
    $('#worldViewerLookTitle').textContent = `Customize ${viewer.displayName}`;
    $('#worldViewerPrimaryLabel').textContent = pack?.appearance?.colorSlots?.primary?.label || 'Primary color';
    $('#worldViewerSecondaryLabel').textContent = pack?.appearance?.colorSlots?.secondary?.label || 'Secondary color';
    populateWorldViewerColorSelect($('#worldViewerPrimaryColor'), pack?.appearance?.colorSlots?.primary, primary, 'Current primary');
    populateWorldViewerColorSelect($('#worldViewerSecondaryColor'), pack?.appearance?.colorSlots?.secondary, secondary, 'Current secondary');
    $('#worldViewerLookTitleInput').value = viewer.cosmetics?.title || viewer.title || '';
    $('#worldViewerLookAccessories').value = (viewer.cosmetics?.accessories || []).join(', ');
    $('#worldViewerLookGlyphs').value = (viewer.cosmetics?.layers || []).map((layer) => layer.glyph).join(', ');
    $('#worldViewerLookHelp').textContent = pack?.appearance ? `${pack.name} includes ${pack.appearance.colorSlots.primary.options.length} ${pack.appearance.colorSlots.primary.label.toLowerCase()} colors and ${pack.appearance.colorSlots.secondary.options.length} ${pack.appearance.colorSlots.secondary.label.toLowerCase()} colors.` : 'This pack does not publish a fixed color palette yet.';
    updateWorldViewerColorPreview();
    $('#worldViewerLookDialog').showModal();
  }

  async function saveWorldViewerCosmetics(event) {
    event.preventDefault();
    const key = $('#worldViewerLookKey').value;
    const viewer = state.interactiveWorld?.viewers?.find((entry) => entry.key === key);
    if (!viewer) return;
    const primaryColor = $('#worldViewerPrimaryColor').value;
    const secondaryColor = $('#worldViewerSecondaryColor').value;
    const accessories = $('#worldViewerLookAccessories').value.split(',').map((entry) => entry.trim()).filter(Boolean).slice(0, 4);
    const layers = $('#worldViewerLookGlyphs').value.split(',').map((glyph, index) => ({ id: `layer-${index + 1}`, glyph: glyph.trim(), color: index % 2 ? primaryColor : secondaryColor, position: ['head', 'front', 'behind'][index % 3] })).filter((layer) => layer.glyph).slice(0, 6);
    try { await api(`/v1/interactive-world/viewers/${encodeURIComponent(key)}/cosmetics`, { method: 'POST', body: { title: $('#worldViewerLookTitleInput').value, accessories, layers, primaryColor, secondaryColor } }); $('#worldViewerLookDialog').close(); await refreshInteractiveWorld(); toast(`${viewer.displayName}'s look updated.`); }
    catch (error) { toast(error.message, true); }
  }

  async function saveWorldPresence(event) {
    event.preventDefault();
    try { await api('/v1/interactive-world/presence/settings', { method: 'POST', body: { enabled: $('#worldPresenceEnabled').checked, avatarScale: Number($('#worldAvatarSize').value) / 100, minimumMessages: Number($('#worldPresenceMessages').value), inactiveAfterMs: Number($('#worldPresenceInactive').value) * 60000, removeFromStageAfterMs: Number($('#worldPresenceRemove').value) * 60000 } }); await refreshInteractiveWorld(); toast('Viewer avatar size and presence saved.'); }
    catch (error) { toast(error.message, true); }
  }

  async function controlTobiiAdapter(action) {
    try { state.tobiiAdapter = await api(`/v1/interactive-world/gaze/adapter/${action}`, { method: 'POST', body: {} }); await refreshInteractiveWorld(); toast(action === 'connect' ? 'Tobii adapter connection requested.' : 'Tobii adapter disconnected.'); }
    catch (error) { toast(error.message, true); }
  }

  function renderInteractionComposer() {
    const recipes = state.interactionComposer?.recipes || [];
    if (!$('#interactionComposerBadge')) return;
    $('#interactionComposerBadge').textContent = `${recipes.length} RECIPE${recipes.length === 1 ? '' : 'S'}`;
    const list = $('#interactionComposerList');
    list.classList.toggle('empty-state', !recipes.length);
    list.innerHTML = recipes.length ? recipes.map((recipe) => `<div><div><strong>${escapeHtml(recipe.name)}</strong><small>${escapeHtml(recipe.trigger.type)} · ${escapeHtml(recipe.trigger.value)} · ${recipe.actions.length} action${recipe.actions.length === 1 ? '' : 's'}</small></div><div class="world-row-actions"><button class="secondary-button" data-interaction-recipe-run="${escapeHtml(recipe.id)}">Rehearse</button><button class="secondary-button danger-outline" data-interaction-recipe-remove="${escapeHtml(recipe.id)}">Remove</button></div></div>`).join('') : 'No interaction recipes yet.';
  }

  async function saveInteractionRecipe(event) {
    event.preventDefault();
    const type = $('#interactionRecipeActionType').value;
    const value = $('#interactionRecipeActionValue').value.trim();
    const settingKey = { alert: 'alertId', 'stage-message': 'message', 'viewer-state': 'state', 'pet-action': 'action', 'battle-start': 'mode' }[type];
    const settings = settingKey ? { [settingKey]: value || ({ 'stage-message': 'Viewer interaction', 'viewer-state': 'emote', 'pet-action': 'play', 'battle-start': 'duel' }[type] || '') } : { intensity: 0.8 };
    try { state.interactionComposer = await api('/v1/interaction-composer/recipes', { method: 'POST', body: { id: $('#interactionRecipeId').value.trim().toLowerCase(), name: $('#interactionRecipeName').value.trim(), enabled: true, trigger: { type: $('#interactionRecipeTriggerType').value, value: $('#interactionRecipeTriggerValue').value.trim() }, cooldownMs: Number($('#interactionRecipeCooldown').value) * 1000, actions: [{ id: 'action-1', type, delayMs: 0, settings }] } }); renderInteractionComposer(); toast('Interaction recipe saved.'); }
    catch (error) { toast(error.message, true); }
  }

  async function runInteractionRecipe(id) { try { await api(`/v1/interaction-composer/recipes/${encodeURIComponent(id)}/run`, { method: 'POST', body: { viewerName: 'Studio Rehearsal' } }); toast('Interaction recipe rehearsed.'); } catch (error) { toast(error.message, true); } }
  async function removeInteractionRecipe(id) { try { state.interactionComposer = await api(`/v1/interaction-composer/recipes/${encodeURIComponent(id)}`, { method: 'DELETE' }); renderInteractionComposer(); toast('Interaction recipe removed.'); } catch (error) { toast(error.message, true); } }

  async function removeWorldViewer(key) {
    try { await api(`/v1/interactive-world/viewers/${encodeURIComponent(key)}`, { method: 'DELETE' }); await refreshInteractiveWorld(); }
    catch (error) { toast(error.message, true); }
  }

  async function saveWorldPet(event) {
    event.preventDefault();
    try { state.interactiveWorld = await api('/v1/interactive-world/pet/settings', { method: 'POST', body: { enabled: $('#worldPetEnabled').checked, name: $('#worldPetName').value.trim(), accessory: $('#worldPetAccessory').value.trim() } }); await refreshInteractiveWorld(); toast('Community pet saved.'); }
    catch (error) { toast(error.message, true); }
  }

  async function runWorldPetAction(action) {
    try { state.interactiveWorld = await api('/v1/interactive-world/pet/actions', { method: 'POST', body: { action, actor: 'Studio Operator' } }); await refreshInteractiveWorld(); toast(`Pet action: ${action}.`); }
    catch (error) { toast(error.message, true); }
  }

  async function startWorldBattle() {
    try { state.interactiveWorld = await api('/v1/interactive-world/battle/start', { method: 'POST', body: { mode: $('#worldBattleMode').value, bossName: $('#worldBossName').value.trim(), inviteOnly: $('#worldBattleInviteOnly').checked } }); await refreshInteractiveWorld(); toast($('#worldBattleInviteOnly').checked ? 'Game invitations opened. Viewers can join with !accept.' : 'Game started on Interactive Stage.'); }
    catch (error) { toast(error.message, true); }
  }

  async function runWorldBattleAction(action) {
    const battle = state.interactiveWorld?.battle;
    if (!battle) return;
    const attacker = battle.participants?.find((entry) => !entry.defeated);
    const target = battle.mode === 'boss' ? battle.boss : battle.participants?.find((entry) => entry.viewerKey !== attacker?.viewerKey && !entry.defeated);
    try { state.interactiveWorld = await api('/v1/interactive-world/battle/action', { method: 'POST', body: { action, attackerKey: attacker?.viewerKey, targetKey: action === 'attack' ? target?.viewerKey : attacker?.viewerKey, bypassCooldown: true } }); await refreshInteractiveWorld(); }
    catch (error) { toast(error.message, true); }
  }

  async function endWorldBattle() {
    try { await api('/v1/interactive-world/battle/end', { method: 'POST', body: { reason: 'studio-operator' } }); await refreshInteractiveWorld(); toast('Battle ended and Stage objects cleaned up.'); }
    catch (error) { toast(error.message, true); }
  }

  async function saveWorldGaze(event) {
    event.preventDefault();
    try { state.interactiveWorld = await api('/v1/interactive-world/gaze/settings', { method: 'POST', body: { enabled: $('#worldGazeEnabled').checked, adapter: $('#worldGazeAdapter').value, effect: $('#worldGazeEffect').value, calibration: { offsetX: Number($('#worldGazeOffsetX').value), offsetY: Number($('#worldGazeOffsetY').value), scaleX: Number($('#worldGazeScaleX').value), scaleY: Number($('#worldGazeScaleY').value) } } }); await refreshInteractiveWorld(); toast('Local eye-tracking setup saved.'); }
    catch (error) { toast(error.message, true); }
  }

  async function simulateWorldGaze() {
    try {
      if (!state.interactiveWorld?.gaze?.enabled) await api('/v1/interactive-world/gaze/settings', { method: 'POST', body: { enabled: true, adapter: 'simulator', effect: $('#worldGazeEffect').value } });
      state.interactiveWorld = await api('/v1/interactive-world/gaze/sample', { method: 'POST', body: { x: Number($('#worldGazeX').value), y: Number($('#worldGazeY').value), confidence: 1 } });
      await refreshInteractiveWorld();
      toast('Test gaze point sent to Stage.');
    } catch (error) { toast(error.message, true); }
  }

  async function saveWorldSafety(event) {
    event.preventDefault();
    try {
      state.interactiveWorld = await api('/v1/interactive-world/safety', { method: 'POST', body: { interactionsEnabled: $('#worldInteractionsEnabled').checked, maximumCrowd: Number($('#worldMaximumCrowd').value), maximumStageObjects: Number($('#worldMaximumObjects').value), maximumConcurrentEffects: Number($('#worldMaximumEffects').value), minimumAttackCooldownMs: Number($('#worldAttackCooldown').value) * 1000, allowJumpscares: $('#worldAllowJumpscares').checked, reducedMotion: $('#worldReducedMotion').checked, reducedFlashing: $('#worldReducedFlashing').checked, volumeCeiling: Number($('#worldVolumeCeiling').value) / 100 } });
      await refreshInteractiveWorld();
      toast('Interactive World safety policy saved.');
    } catch (error) { toast(error.message, true); }
  }

  function switchInteractiveStageTab(tab) {
    if (!['overview', 'layout', 'objects', 'safety'].includes(tab)) return;
    interactiveStageTab = tab;
    document.querySelectorAll('[data-stage-tab]').forEach((button) => {
      const active = button.dataset.stageTab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-stage-panel]').forEach((panel) => { panel.hidden = panel.dataset.stagePanel !== tab; });
    if (tab === 'layout') renderInteractiveStage();
  }

  function switchChatbotTab(tab) {
    if (!['chat', 'polls', 'commands', 'automation', 'moderation', 'setup'].includes(tab)) return;
    chatbotWorkspaceTab = tab;
    document.querySelectorAll('[data-chatbot-tab]').forEach((button) => {
      const active = button.dataset.chatbotTab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-chatbot-panel]').forEach((panel) => { panel.hidden = panel.dataset.chatbotPanel !== tab; });
  }

  async function refreshInteractiveStage() {
    state.interactiveStage = await api('/v1/interactive-stage');
    renderInteractiveStage();
  }

  function selectInteractiveStageObject(id, openLayout = false) {
    interactiveStageSelectedId = String(id || '');
    if (openLayout) switchInteractiveStageTab('layout');
    renderInteractiveStage();
  }

  function stagePlacementFromSelection() {
    return {
      x: Number($('#interactiveStageSelectedX').value),
      y: Number($('#interactiveStageSelectedY').value),
      scale: Number($('#interactiveStageSelectedScale').value),
      anchor: 'center',
      layer: Number($('#interactiveStageSelectedLayer').value)
    };
  }

  async function createInteractiveStageObject(event) {
    event.preventDefault();
    const lifetimeSeconds = Number($('#interactiveStageCreateLifetime').value);
    const body = {
      kind: $('#interactiveStageCreateKind').value,
      state: 'idle',
      owner: { platform: 'studio', userId: 'operator', displayName: 'Studio Operator' },
      placement: {
        x: Number($('#interactiveStageCreateX').value), y: Number($('#interactiveStageCreateY').value),
        scale: Number($('#interactiveStageCreateScale').value), anchor: 'center', layer: Number($('#interactiveStageCreateLayer').value)
      },
      properties: { label: $('#interactiveStageCreateLabel').value.trim(), glyph: $('#interactiveStageCreateGlyph').value.trim() || 'STAGE', accent: $('#interactiveStageCreateAccent').value },
      ...(lifetimeSeconds > 0 ? { lifetimeMs: lifetimeSeconds * 1000 } : {})
    };
    try {
      const result = await api('/v1/interactive-stage/objects', { method: 'POST', body });
      state.interactiveStage = result;
      interactiveStageSelectedId = result.object.id;
      renderInteractiveStage();
      toast(`${result.object.properties.label} added to the Interactive Stage.`);
    } catch (error) { toast(error.message, true); }
  }

  async function updateInteractiveStageObject(id, patch, message) {
    const result = await api(`/v1/interactive-stage/objects/${encodeURIComponent(id)}`, { method: 'POST', body: patch });
    await refreshInteractiveStage();
    if (message) toast(message.replace('{name}', String(result.object.properties?.label || result.object.id)));
    return result.object;
  }

  async function saveInteractiveStageSelection(event) {
    event.preventDefault();
    const object = state.interactiveStage?.objects?.find((entry) => entry.id === interactiveStageSelectedId);
    if (!object) return;
    const placement = stagePlacementFromSelection();
    const patch = {
      state: $('#interactiveStageSelectedState').value.trim(),
      properties: {
        label: $('#interactiveStageSelectedLabel').value.trim(),
        glyph: $('#interactiveStageSelectedGlyph').value.trim() || 'STAGE',
        accent: $('#interactiveStageSelectedAccent').value
      },
      ...(interactiveStageOrientation === 'vertical'
        ? { scenePlacements: { ...(object.scenePlacements || {}), vertical: placement } }
        : { placement })
    };
    try { await updateInteractiveStageObject(object.id, patch, '{name} layout saved.'); }
    catch (error) { toast(error.message, true); }
  }

  async function dismissInteractiveStageObject(id) {
    if (!id) return;
    try {
      await api(`/v1/interactive-stage/objects/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (interactiveStageSelectedId === id) interactiveStageSelectedId = '';
      await refreshInteractiveStage();
      toast('Stage object dismissed.');
    } catch (error) { toast(error.message, true); }
  }

  function beginInteractiveStageDrag(event) {
    const objectNode = event.target.closest('.stage-layout-object');
    if (!objectNode) return;
    event.preventDefault();
    interactiveStageSelectedId = objectNode.dataset.stageSelect;
    const canvas = $('#interactiveStageLayoutCanvas');
    canvas.querySelectorAll('.stage-layout-object').forEach((node) => node.classList.toggle('selected', node === objectNode));
    const selected = state.interactiveStage?.objects?.find((object) => object.id === interactiveStageSelectedId);
    if (!selected) return;
    const placement = interactiveStageOrientation === 'vertical' ? selected.scenePlacements?.vertical || selected.placement : selected.placement;
    $('#interactiveStageSelectionForm').querySelectorAll('input,button').forEach((input) => { input.disabled = false; });
    $('#interactiveStageSelectedName').textContent = String(selected.properties?.label || selected.id);
    $('#interactiveStageSelectedId').textContent = `${selected.kind} · ${selected.id}`;
    $('#interactiveStageSelectedLabel').value = String(selected.properties?.label || selected.properties?.text || selected.id);
    $('#interactiveStageSelectedGlyph').value = String(selected.properties?.glyph || 'STAGE');
    $('#interactiveStageSelectedState').value = String(selected.state || 'idle');
    $('#interactiveStageSelectedAccent').value = /^#[0-9a-f]{6}$/i.test(String(selected.properties?.accent || '')) ? selected.properties.accent : '#54f2eb';
    $('#interactiveStageSelectedX').value = Number(placement?.x || 0).toFixed(3);
    $('#interactiveStageSelectedY').value = Number(placement?.y || 0).toFixed(3);
    $('#interactiveStageSelectedScale').value = String(Number(placement?.scale || 1));
    $('#interactiveStageSelectedLayer').value = String(Number(placement?.layer || 0));
    const bounds = canvas.getBoundingClientRect();
    interactiveStageDrag = { id: interactiveStageSelectedId, pointerId: event.pointerId, node: objectNode, bounds };
    objectNode.setPointerCapture?.(event.pointerId);
    objectNode.classList.add('dragging');
  }

  function moveInteractiveStageDrag(event) {
    if (!interactiveStageDrag || interactiveStageDrag.pointerId !== event.pointerId) return;
    const x = Math.max(0, Math.min(1, (event.clientX - interactiveStageDrag.bounds.left) / interactiveStageDrag.bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - interactiveStageDrag.bounds.top) / interactiveStageDrag.bounds.height));
    interactiveStageDrag.node.style.left = `${x * 100}%`;
    interactiveStageDrag.node.style.top = `${y * 100}%`;
    $('#interactiveStageSelectedX').value = x.toFixed(3);
    $('#interactiveStageSelectedY').value = y.toFixed(3);
  }

  async function endInteractiveStageDrag(event) {
    if (!interactiveStageDrag || interactiveStageDrag.pointerId !== event.pointerId) return;
    const drag = interactiveStageDrag;
    interactiveStageDrag = null;
    drag.node.classList.remove('dragging');
    const object = state.interactiveStage?.objects?.find((entry) => entry.id === drag.id);
    if (!object) return;
    const placement = stagePlacementFromSelection();
    try {
      if (interactiveStageOrientation === 'vertical') await updateInteractiveStageObject(object.id, { scenePlacements: { ...(object.scenePlacements || {}), vertical: placement } });
      else {
        await api(`/v1/interactive-stage/objects/${encodeURIComponent(object.id)}/move`, { method: 'POST', body: { placement } });
        await refreshInteractiveStage();
      }
      toast(`${object.properties?.label || object.id} moved.`);
    } catch (error) { toast(error.message, true); await refreshInteractiveStage().catch(() => {}); }
  }

  async function previewInteractiveStage() {
    try {
      state.interactiveStage = await api('/v1/interactive-stage/preview', { method: 'POST', body: {} });
      renderInteractiveStage();
      toast('Test object sent to the Interactive Stage for 10 seconds.');
    } catch (error) { toast(error.message, true); }
  }

  async function clearInteractiveStage() {
    try {
      state.interactiveStage = await api('/v1/interactive-stage/clear', { method: 'POST', body: { reason: 'studio-operator' } });
      renderInteractiveStage();
      toast('Interactive Stage cleared.');
    } catch (error) { toast(error.message, true); }
  }

  async function saveInteractiveStageZone(event) {
    event.preventDefault();
    const name = $('#interactiveStageZoneName').value.trim() || 'Protected zone';
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `zone-${Date.now()}`;
    const zones = [...(state.interactiveStage?.protectedZones || []).filter((zone) => zone.id !== id), { id, name, x: Number($('#interactiveStageZoneX').value), y: Number($('#interactiveStageZoneY').value), width: Number($('#interactiveStageZoneWidth').value), height: Number($('#interactiveStageZoneHeight').value), enabled: true, orientations: ['horizontal', 'vertical'] }];
    try { state.interactiveStage = await api('/v1/interactive-stage/layout', { method: 'POST', body: { protectedZones: zones, collisionAvoidance: $('#interactiveStageCollision').checked } }); renderInteractiveStage(); toast('Protected Stage zone saved.'); }
    catch (error) { toast(error.message, true); }
  }

  async function clearInteractiveStageZones() {
    try { state.interactiveStage = await api('/v1/interactive-stage/layout', { method: 'POST', body: { protectedZones: [], collisionAvoidance: $('#interactiveStageCollision').checked } }); renderInteractiveStage(); toast('Protected Stage zones cleared.'); }
    catch (error) { toast(error.message, true); }
  }

  function interactiveStageWorldPayload(platforms = state.interactiveStage?.worldMap?.platforms || [], interactables = state.interactiveStage?.worldMap?.interactables || []) {
    return {
      enabled: $('#interactiveStageWorldEnabled').checked,
      wanderEnabled: $('#interactiveStageWanderEnabled').checked,
      jumpEnabled: $('#interactiveStageJumpEnabled').checked,
      floorY: Number($('#interactiveStageFloorY').value),
      speed: Number($('#interactiveStageWorldSpeed').value),
      gravity: Number($('#interactiveStageWorldGravity').value),
      jumpStrength: Number($('#interactiveStageJumpStrength').value),
      platforms,
      interactables
    };
  }

  async function saveInteractiveStageWorld(event) {
    event.preventDefault();
    try {
      state.interactiveStage = await api('/v1/interactive-stage/layout', { method: 'POST', body: { worldMap: interactiveStageWorldPayload() } });
      renderInteractiveStage();
      toast('Avatar floor and movement physics saved.');
    } catch (error) { toast(error.message, true); }
  }

  async function saveInteractiveStagePlatform(event) {
    event.preventDefault();
    const name = $('#interactiveStagePlatformName').value.trim() || 'Stage platform';
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `platform-${Date.now()}`;
    const platform = {
      id,
      name,
      x: Number($('#interactiveStagePlatformX').value),
      y: Number($('#interactiveStagePlatformY').value),
      width: Number($('#interactiveStagePlatformWidth').value),
      height: Number($('#interactiveStagePlatformHeight').value),
      color: $('#interactiveStagePlatformColor').value,
      collision: $('#interactiveStagePlatformCollision').value === 'solid' ? 'solid' : 'one-way',
      enabled: true,
      orientations: [interactiveStageOrientation]
    };
    const existing = state.interactiveStage?.worldMap?.platforms || [];
    const platforms = [...existing.filter((entry) => entry.id !== id), platform];
    try {
      state.interactiveStage = await api('/v1/interactive-stage/layout', { method: 'POST', body: { worldMap: interactiveStageWorldPayload(platforms) } });
      renderInteractiveStage();
      toast(`${name} added to the ${interactiveStageOrientation} avatar map.`);
    } catch (error) { toast(error.message, true); }
  }

  async function loadInteractiveStageStarterMap() {
    const platforms = [
      { id: 'starter-lower-left', name: 'Lower left', x: 0.12, y: 0.78, width: 0.24, height: 0.025, color: '#54f2eb', collision: 'one-way', enabled: true, orientations: ['horizontal', 'vertical'] },
      { id: 'starter-center', name: 'Center bridge', x: 0.41, y: 0.68, width: 0.2, height: 0.025, color: '#b99cff', collision: 'one-way', enabled: true, orientations: ['horizontal', 'vertical'] },
      { id: 'starter-upper-right', name: 'Upper right', x: 0.68, y: 0.57, width: 0.22, height: 0.025, color: '#ffbd59', collision: 'one-way', enabled: true, orientations: ['horizontal', 'vertical'] },
      { id: 'starter-center-wall', name: 'Center wall', x: 0.49, y: 0.72, width: 0.025, height: 0.2, color: '#ff667a', collision: 'solid', enabled: true, orientations: ['horizontal', 'vertical'] }
    ];
    try {
      state.interactiveStage = await api('/v1/interactive-stage/layout', { method: 'POST', body: { worldMap: interactiveStageWorldPayload(platforms) } });
      renderInteractiveStage();
      toast('Starter platform map loaded for both canvases.');
    } catch (error) { toast(error.message, true); }
  }

  async function clearInteractiveStagePlatforms() {
    try {
      state.interactiveStage = await api('/v1/interactive-stage/layout', { method: 'POST', body: { worldMap: interactiveStageWorldPayload([]) } });
      renderInteractiveStage();
      toast('Platforms cleared. Avatars will use the canvas floor.');
    } catch (error) { toast(error.message, true); }
  }

  async function saveInteractiveStageInteractable(event) {
    event.preventDefault();
    const name = $('#interactiveStageInteractableName').value.trim() || 'Gameplay object';
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `interactable-${Date.now()}`;
    const item = {
      id,
      name,
      kind: $('#interactiveStageInteractableKind').value,
      glyph: $('#interactiveStageInteractableGlyph').value.trim().slice(0, 8) || 'USE',
      linkId: $('#interactiveStageInteractableLink').value.trim() || undefined,
      x: Number($('#interactiveStageInteractableX').value),
      y: Number($('#interactiveStageInteractableY').value),
      width: Number($('#interactiveStageInteractableWidth').value),
      height: Number($('#interactiveStageInteractableHeight').value),
      color: $('#interactiveStageInteractableColor').value,
      enabled: true,
      orientations: [interactiveStageOrientation]
    };
    const existing = state.interactiveStage?.worldMap?.interactables || [];
    const interactables = [...existing.filter((entry) => entry.id !== id), item];
    try {
      state.interactiveStage = await api('/v1/interactive-stage/layout', { method: 'POST', body: { worldMap: interactiveStageWorldPayload(undefined, interactables) } });
      renderInteractiveStage();
      toast(`${name} added to the ${interactiveStageOrientation} game map.`);
    } catch (error) { toast(error.message, true); }
  }

  async function loadInteractiveStageGameplaySet() {
    const interactables = [
      { id: 'starter-checkpoint', name: 'Home beacon', kind: 'checkpoint', glyph: 'HOME', x: 0.04, y: 0.82, width: 0.055, height: 0.09, color: '#54f2eb', enabled: true, orientations: ['horizontal', 'vertical'] },
      { id: 'starter-pickup', name: 'Storm shard', kind: 'pickup', glyph: 'STAR', x: 0.27, y: 0.69, width: 0.045, height: 0.07, color: '#ffbd59', enabled: true, orientations: ['horizontal', 'vertical'] },
      { id: 'starter-switch', name: 'Gate switch', kind: 'switch', glyph: 'USE', linkId: 'starter-gate', x: 0.54, y: 0.82, width: 0.05, height: 0.08, color: '#b99cff', enabled: true, orientations: ['horizontal', 'vertical'] },
      { id: 'starter-pressure', name: 'Team plate', kind: 'pressure-plate', glyph: 'TEAM', linkId: 'starter-gate', x: 0.66, y: 0.885, width: 0.11, height: 0.025, color: '#66e08a', enabled: true, orientations: ['horizontal', 'vertical'] },
      { id: 'starter-door', name: 'Storm gate', kind: 'door', glyph: 'GATE', linkId: 'starter-gate', x: 0.75, y: 0.69, width: 0.035, height: 0.22, color: '#b99cff', enabled: true, orientations: ['horizontal', 'vertical'] },
      { id: 'starter-block', name: 'Puzzle block', kind: 'push-block', glyph: 'PUSH', x: 0.42, y: 0.83, width: 0.065, height: 0.08, color: '#44aaff', enabled: true, orientations: ['horizontal', 'vertical'] },
      { id: 'starter-hazard', name: 'Static spikes', kind: 'hazard', glyph: 'HIT', x: 0.8, y: 0.855, width: 0.08, height: 0.055, color: '#ff667a', enabled: true, orientations: ['horizontal', 'vertical'] },
      { id: 'starter-toy', name: 'Bounce orb', kind: 'toy', glyph: 'BOUNCE', x: 0.91, y: 0.82, width: 0.06, height: 0.09, color: '#44aaff', enabled: true, orientations: ['horizontal', 'vertical'] }
    ];
    try {
      state.interactiveStage = await api('/v1/interactive-stage/layout', { method: 'POST', body: { worldMap: interactiveStageWorldPayload(undefined, interactables) } });
      renderInteractiveStage();
      toast('Starter gameplay objects loaded for both canvases.');
    } catch (error) { toast(error.message, true); }
  }

  async function clearInteractiveStageInteractables() {
    try {
      state.interactiveStage = await api('/v1/interactive-stage/layout', { method: 'POST', body: { worldMap: interactiveStageWorldPayload(undefined, []) } });
      renderInteractiveStage();
      toast('Gameplay objects cleared.');
    } catch (error) { toast(error.message, true); }
  }

  function renderOverview() {
    const active = state.runs.filter(activeRun);
    $('#activeRunMetric').textContent = active.length;
    $('#connectionMetric').textContent = state.connections.length;
    $('#activeRunMetricNote').textContent = active.length ? `${active[0].workflowName} in progress` : 'Runtime standing by';
    $('#connectionMetricNote').textContent = state.connections.length ? 'Connected tools are ready' : 'Waiting for connected tools';
    $('#heroCore').classList.toggle('active', Boolean(active.length));

    const display = $('#activeRunDisplay');
    const run = active[0];
    display.classList.toggle('empty-state', !run);
    if (!run) display.textContent = 'No interaction is active.';
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

  function renderInterfaceMode() {
    const advanced = readOnboardingPreferences().advancedMode === true;
    document.body.classList.toggle('advanced-mode', advanced);
    $('#advancedInterfaceMode').checked = advanced;
    $('#interfaceModeBadge').textContent = advanced ? 'ADVANCED' : 'SIMPLE';
    $('#interfaceModeBadge').classList.toggle('offline', advanced);
    $('#interfaceModeStatus').textContent = advanced
      ? 'Advanced Mode is showing technical and developer controls.'
      : 'Streamer Mode is active.';
  }

  function saveInterfaceMode() {
    const advancedMode = $('#advancedInterfaceMode').checked;
    writeOnboardingPreferences({ advancedMode });
    renderInterfaceMode();
    if (!advancedMode && $('#eventsSection').classList.contains('active')) showSection('overview');
    toast(advancedMode ? 'Advanced Mode enabled.' : 'Streamer Mode enabled.');
  }

  function validCanvasDimension(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 320 && number <= 16384 ? number : null;
  }

  function broadcastCanvasProfile() {
    const connection = state.connections.find((entry) => entry.capabilities?.includes('broadcast.status') || entry.applicationId === 'com.tempestmainframe.tempest-broadcast');
    const profile = connection?.status?.canvasProfile;
    if (!profile || typeof profile !== 'object') return null;
    const baseWidth = validCanvasDimension(profile.baseWidth);
    const baseHeight = validCanvasDimension(profile.baseHeight);
    const outputWidth = validCanvasDimension(profile.outputWidth);
    const outputHeight = validCanvasDimension(profile.outputHeight);
    if (!baseWidth || !baseHeight || !outputWidth || !outputHeight) return null;
    const fpsNumerator = Number(profile.fpsNumerator) || 0;
    const fpsDenominator = Number(profile.fpsDenominator) || 1;
    return { baseWidth, baseHeight, outputWidth, outputHeight, fps: fpsNumerator > 0 ? fpsNumerator / fpsDenominator : 0, source: 'broadcast', label: 'Live from Broadcast' };
  }

  function activeCanvasProfile() {
    const preferences = readOnboardingPreferences();
    const mode = preferences.canvasProfileMode || 'auto';
    const live = broadcastCanvasProfile();
    if (mode === 'auto' && live) return { ...live, mode };
    const presets = {
      standard: { baseWidth: 1920, baseHeight: 1080, outputWidth: 1920, outputHeight: 1080, label: 'Standard HD' },
      qhd: { baseWidth: 2560, baseHeight: 1440, outputWidth: 2560, outputHeight: 1440, label: 'QHD' },
      ultrawide: { baseWidth: 3440, baseHeight: 1440, outputWidth: 2580, outputHeight: 1080, label: 'Ultrawide' }
    };
    if (mode === 'custom') {
      const custom = preferences.customCanvasProfile || {};
      return {
        baseWidth: validCanvasDimension(custom.baseWidth) || 1920,
        baseHeight: validCanvasDimension(custom.baseHeight) || 1080,
        outputWidth: validCanvasDimension(custom.outputWidth) || 1920,
        outputHeight: validCanvasDimension(custom.outputHeight) || 1080,
        fps: Number(custom.fps) || 60,
        source: 'manual', label: 'Custom', mode
      };
    }
    const selected = presets[mode] || presets.standard;
    return { ...selected, fps: 60, source: mode === 'auto' ? 'fallback' : 'manual', mode };
  }

  function canvasAspectLabel(profile) {
    const divisor = (a, b) => b ? divisor(b, a % b) : a;
    const common = divisor(profile.baseWidth, profile.baseHeight);
    return `${profile.baseWidth / common}:${profile.baseHeight / common}`;
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
    const emoteWallSourceReady = Boolean(state.emoteWall?.connectedClients) || flags.emoteWallSource === true;
    const twitchExperienceSourceReady = Boolean(state.twitchExperiences?.connectedClients) || flags.twitchExperienceSource === true;
    const pollSourceReady = flags.pollSource === true;
    const unifiedSourceReady = Boolean(state.unifiedStage?.connectedClients) || flags.unifiedSource === true;
    const browserSourcesReady = unifiedSourceReady || (twitchSourceReady && interactionSourceReady);
    const canvasReady = Boolean(broadcastCanvasProfile()) || flags.canvasConfigured === true;
    const liveTestReady = Number(state.chatbot?.commandsTriggered || 0) > 0 || flags.alertTested === true;
    const checks = [Boolean(state.health), broadcasterReady && chatbotReady, browserSourcesReady, canvasReady, liveTestReady];
    return {
      preferences, flags, broadcasterReady, chatbotReady, twitchSourceReady, interactionSourceReady, unifiedSourceReady, chatSourceReady, emoteWallSourceReady, twitchExperienceSourceReady, pollSourceReady,
      browserSourcesReady, canvasReady, liveTestReady, canvasProfile: activeCanvasProfile(), checks, readyCount: checks.filter(Boolean).length
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
    return `<article class="onboarding-source-card"><div><strong>${escapeHtml(title)}</strong><code data-sensitive>${escapeHtml(url)}</code><small>${escapeHtml(detail)}</small></div>${copyButton(url, label)}</article>`;
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
    const emoteWallUrl = state.emoteWall?.url || `${baseUrl}/emote-wall`;
    const pollUrl = state.chatbot?.pollOverlay?.url || `${baseUrl}/poll-overlay`;
    const twitchExperienceUrl = state.twitchExperiences?.url || `${baseUrl}/twitch-experiences`;
    const discordVoiceUrl = state.discordVoice?.url || `${baseUrl}/discord-voice`;
    const unifiedUrl = state.unifiedStage?.url || `${baseUrl}/unified-stage?orientation=horizontal`;
    const interactionAudioUrl = state.unifiedStage?.interactionAudioUrl || `${baseUrl}/visual-alerts/interactions?visual=0&audio=1`;
    const broadcasterLogin = state.twitch?.oauth?.account?.login;
    const botLogin = state.chatbot?.oauth?.account?.login;
    const canvas = setup.canvasProfile;
    const canvasAspect = canvasAspectLabel(canvas);
    $('#onboardingKicker').textContent = `STEP ${onboardingStep + 1} OF ${onboardingSteps.length}`;
    $('#onboardingTitle').textContent = onboardingSteps[onboardingStep].title;
    $('#onboardingStepList').innerHTML = onboardingSteps.map((step, index) => `<button class="onboarding-step-button ${index === onboardingStep ? 'active' : ''} ${setup.checks[index] ? 'done' : ''}" type="button" data-onboarding-step="${index}"><b>${String(index + 1).padStart(2, '0')}</b><span><strong>${escapeHtml(step.title)}</strong><small>${escapeHtml(step.short)}</small></span><i></i></button>`).join('');
    let markup = '';
    if (onboardingStep === 0) {
      markup = `<div class="onboarding-intro"><p class="eyebrow">TEMPEST STREAMING STUDIO</p><h3>One guided path from installation to an on-air test</h3><p>This setup checks the local Bridge, Twitch identities, browser sources, canvas dimensions, and one real command or alert. It never asks for a Twitch client secret and can be reviewed again from Studio Home.</p><div class="onboarding-check-grid">${setupCheckCard(Boolean(state.health), 'Local Studio Bridge', state.health ? `API ${state.health.protocolVersion || '1.0'} is online on this computer.` : 'Studio is waiting for its local control plane.')}${setupCheckCard(setup.broadcasterReady, 'Broadcaster identity', setup.broadcasterReady ? `Authorized as @${broadcasterLogin}.` : 'Connect the channel owner in Twitch Gateway.')}${setupCheckCard(setup.chatbotReady, 'Secondary bot identity', setup.chatbotReady ? `@${botLogin} can listen and reply.` : 'Authorize a separate Twitch user for chat operations.')}${setupCheckCard(setup.browserSourcesReady, 'Unified Stage source', setup.browserSourcesReady ? 'The Unified Stage or legacy alert pair is confirmed.' : 'Add the Unified Stage Browser Source to OBS or Broadcast.')}${setupCheckCard(setup.canvasReady, 'Canvas + audio routing', setup.canvasReady ? `${canvas.baseWidth} × ${canvas.baseHeight} ${canvas.source === 'broadcast' ? 'detected from Broadcast.' : 'profile confirmed.'}` : `Confirm the ${canvas.baseWidth} × ${canvas.baseHeight} source dimensions and VOD routing.`)}${setupCheckCard(setup.liveTestReady, 'Live route test', setup.liveTestReady ? 'At least one real command or alert reached Studio.' : 'Run one safe test before going live.')}</div></div>`;
    } else if (onboardingStep === 1) {
      markup = `<div class="onboarding-intro"><p>Twitch uses two deliberately separate authorizations: the broadcaster owns channel events, while the bot account reads and replies in chat.</p><div class="onboarding-check-grid">${setupCheckCard(setup.broadcasterReady, 'Broadcaster account', setup.broadcasterReady ? `@${broadcasterLogin} is authorized.` : 'Sign in with the Twitch account that owns your channel. No developer account is needed.')}${setupCheckCard(setup.chatbotReady, 'Secondary bot account', setup.chatbotReady ? `@${botLogin} is connected for EventSub and chat output.` : 'Connect a second Twitch user account in the isolated sign-in window.')}</div><div class="onboarding-actions"><button class="secondary-button" type="button" data-onboarding-go="twitch">Open Twitch Gateway</button><button class="secondary-button" type="button" data-onboarding-go="chatbot">Open Chatbot Setup</button></div><div class="onboarding-note"><strong>Why two accounts?</strong> The broadcaster remains the channel owner. The secondary account gives chat automation its own visible identity and keeps those credentials isolated.</div></div>`;
    } else if (onboardingStep === 2) {
      markup = `<div class="onboarding-intro"><p>Add Unified Stage as the single transparent visual Browser Source. Add the optional audio-only lane only when interaction music must be excluded from the YouTube/VOD track.</p><div class="onboarding-source-list">${onboardingSourceCard('Unified Stage', unifiedUrl, 'Avatars, alerts, experiences, chat, emotes, dice, guests, and polls selected in Studio.', 'Unified Stage browser-source URL')}${onboardingSourceCard('Interaction Audio · optional', interactionAudioUrl, 'Audio only; route this source away from the VOD track. It renders no graphics.', 'Interaction audio browser-source URL')}</div><div class="onboarding-confirm-list">${onboardingFlag('unifiedSource', setup.unifiedSourceReady, 'Unified Stage source added', 'Disable or remove the old individual Tempest visual sources so they stop using GPU.')}${onboardingFlag('interactionSource', setup.interactionSourceReady, 'Interaction audio lane added · optional', 'Use Control audio via OBS only when separate VOD routing is needed.')}</div><div class="onboarding-note"><strong>Legacy URLs:</strong> Individual overlay URLs remain available for unusual per-scene routing, but they should not stay active beside Unified Stage.</div></div>`;
    } else if (onboardingStep === 3) {
      markup = `<div class="onboarding-intro"><p>Studio follows Broadcast’s live canvas automatically. If Broadcast is unavailable, Standard HD is the default; a manual profile can override either value.</p><div class="onboarding-profile-controls"><label>Canvas profile<select id="onboardingCanvasProfileMode"><option value="auto" ${canvas.mode === 'auto' ? 'selected' : ''}>Automatic — follow Broadcast</option><option value="standard" ${canvas.mode === 'standard' ? 'selected' : ''}>Standard HD — 1920 × 1080</option><option value="qhd" ${canvas.mode === 'qhd' ? 'selected' : ''}>QHD — 2560 × 1440</option><option value="ultrawide" ${canvas.mode === 'ultrawide' ? 'selected' : ''}>Ultrawide — 3440 × 1440 / 2580 × 1080</option><option value="custom" ${canvas.mode === 'custom' ? 'selected' : ''}>Custom</option></select></label><span class="status-badge ${canvas.source === 'broadcast' ? 'online' : ''}">${canvas.source === 'broadcast' ? 'LIVE FROM BROADCAST' : canvas.source === 'fallback' ? 'STANDARD FALLBACK' : 'MANUAL PROFILE'}</span></div><div id="onboardingCustomCanvas" class="onboarding-custom-canvas" ${canvas.mode === 'custom' ? '' : 'hidden'}><label>Base width<input data-canvas-field="baseWidth" type="number" min="320" max="16384" value="${canvas.baseWidth}" /></label><label>Base height<input data-canvas-field="baseHeight" type="number" min="320" max="16384" value="${canvas.baseHeight}" /></label><label>Output width<input data-canvas-field="outputWidth" type="number" min="320" max="16384" value="${canvas.outputWidth}" /></label><label>Output height<input data-canvas-field="outputHeight" type="number" min="320" max="16384" value="${canvas.outputHeight}" /></label><label>FPS<input data-canvas-field="fps" type="number" min="1" max="240" value="${Math.round(canvas.fps || 60)}" /></label></div><div class="onboarding-canvas-card"><div><span>BASE CANVAS + BROWSER SOURCES</span><strong>${canvas.baseWidth} × ${canvas.baseHeight}</strong><small>${canvasAspect} placement space used by the alert designer.</small></div><div><span>OUTPUT (SCALED)</span><strong>${canvas.outputWidth} × ${canvas.outputHeight}</strong><small>${canvas.fps ? `${canvas.fps.toFixed(2).replace(/\.00$/, '')} FPS · ` : ''}${escapeHtml(canvas.label)}.</small></div></div><div class="onboarding-confirm-list">${onboardingFlag('canvasConfigured', setup.canvasReady, 'Canvas dimensions confirmed', `Unified Stage uses the ${canvas.baseWidth} × ${canvas.baseHeight} base canvas.`)}${onboardingFlag('vodRouting', setup.flags.vodRouting === true, 'Interaction audio routed off the VOD track · optional', 'Use the separate audio-only lane to keep interaction audio live while excluding it from the recording track uploaded to YouTube.')}</div><div class="onboarding-note"><strong>Browser Source sizing:</strong> use the base canvas dimensions above. Studio updates the Alert Designer automatically when Broadcast changes profiles.</div></div>`;
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

  function renderAlertHistory() {
    const history = state.alertHistory || { summary: {}, records: [] };
    const summary = history.summary || {};
    const diagnostics = state.alertDiagnostics || { configured: {}, sources: {}, issues: [] };
    const audioPlayback = diagnostics.audioPlayback || { pending: 0, started: 0, failed: 0, latest: [] };
    $('#alertHistory24h').textContent = summary.last24Hours || 0;
    $('#alertHistoryFailures').textContent = (summary.failures || 0) + (audioPlayback.failed || 0);
    $('#alertHistoryWait').textContent = (summary.averageWaitMs || 0) < 1000 ? `${summary.averageWaitMs || 0} ms` : durationLabel(summary.averageWaitMs);
    $('#alertDiagnosticIssueCount').textContent = diagnostics.configured?.unavailableAssets || 0;
    const interactionClients = diagnostics.sources?.interactionClients || 0;
    const twitchClients = diagnostics.sources?.twitchClients || 0;
    const interactionAudioClients = diagnostics.sources?.interactionAudioClients || 0;
    const twitchAudioClients = diagnostics.sources?.twitchAudioClients || 0;
    const latestAudio = audioPlayback.latest?.[0];
    const audioProof = latestAudio ? `${String(latestAudio.state || 'unknown').toUpperCase()}${latestAudio.method ? ` via ${String(latestAudio.method).replaceAll('-', ' ')}` : ''}${Number.isFinite(latestAudio.latencyMs) ? ` in ${latestAudio.latencyMs} ms` : ''}` : 'waiting for the next alert';
    $('#alertSourceDiagnostic').innerHTML = `<strong>Browser Sources:</strong> Twitch ${twitchClients} connected / ${twitchAudioClients} audio · Interaction ${interactionClients} connected / ${interactionAudioClients} audio · <strong>Playback proof:</strong> ${escapeHtml(audioProof)} · ${(diagnostics.configured?.assignedAssets || 0)} assigned media files checked.`;
    const issues = diagnostics.issues || [];
    const issueList = $('#alertDiagnosticIssues');
    issueList.classList.toggle('empty-state', !issues.length);
    issueList.innerHTML = issues.length ? issues.map((issue) => `<article><b>!</b><div><strong>${escapeHtml(issue.alertName)}${issue.variantId ? ` · ${escapeHtml(issue.variantId)}` : ''}</strong><small>${escapeHtml(issue.message)} Reassign the ${escapeHtml(issue.role)} file from the alert card.</small></div><code>${escapeHtml(issue.kind)}</code></article>`).join('') : 'No assigned-media problems detected.';
    const query = $('#alertHistorySearch').value.trim().toLowerCase();
    const kind = $('#alertHistoryKind').value;
    const playbackState = $('#alertHistoryState').value;
    const records = (history.records || []).filter((record) => {
      const searchable = [record.alertName, record.alertId, record.viewerName, record.variantName, record.variantId, record.source, record.audioRoute].join(' ').toLowerCase();
      return (!query || searchable.includes(query)) && (!kind || record.kind === kind) && (!playbackState || record.state === playbackState);
    });
    const list = $('#alertHistoryList');
    list.classList.toggle('empty-state', !records.length);
    list.innerHTML = records.length ? records.map((record) => `<article class="alert-history-record ${escapeHtml(record.state)}"><i></i><time>${new Date(record.startedAt || record.enqueuedAt).toLocaleString()}</time><div class="alert-history-primary"><strong>${escapeHtml(record.alertName)}${record.variantName ? ` · ${escapeHtml(record.variantName)}` : ''}</strong><small>${escapeHtml(record.kind === 'twitch' ? 'Twitch Alert' : 'Interaction Alert')}${record.viewerName ? ` · ${escapeHtml(record.viewerName)}` : ''} · ${escapeHtml(record.source)}</small></div><div class="alert-history-route"><span>${record.audioAssigned ? `AUDIO: ${escapeHtml(String(record.audioRoute).replaceAll('-', ' ').toUpperCase())}` : 'NO AUDIO'}</span><span>${record.visualAssigned ? 'VISUAL READY' : 'NO VISUAL'}</span><small>Wait ${record.waitMs < 1000 ? `${record.waitMs} ms` : durationLabel(record.waitMs)} · Play ${durationLabel(record.durationMs)}</small></div><code>${escapeHtml(record.state)}</code>${record.error ? `<p>${escapeHtml(record.error)}</p>` : ''}</article>`).join('') : ((history.records || []).length ? 'No alert playback matches these filters.' : 'No alert playback has been recorded yet.');
  }

  async function clearAlertHistory() {
    if (!confirm('Clear the durable Alert History? This does not remove alerts or media.')) return;
    try {
      await api('/v1/alert-history', { method: 'DELETE' });
      state.alertHistory = await api('/v1/alert-history?limit=200');
      renderAlertHistory();
      toast('Alert History cleared.');
    } catch (error) { toast(error.message, true); }
  }

  function soundAlertAudioName(uri) {
    if (!uri) return 'No local audio assigned';
    const managed = state.assets.find((asset) => asset.uri === uri);
    if (managed) return managed.name;
    try {
      const pathname = decodeURIComponent(new URL(uri).pathname);
      return pathname.split('/').filter(Boolean).at(-1) || 'Local audio assigned';
    } catch { return 'Local audio assigned'; }
  }

  function soundAlertVisualName(uri) {
    if (!uri) return 'No local visual assigned';
    const managed = state.assets.find((asset) => asset.uri === uri);
    if (managed) return managed.name;
    try {
      const pathname = decodeURIComponent(new URL(uri).pathname);
      return pathname.split('/').filter(Boolean).at(-1) || 'Local visual assigned';
    } catch { return 'Local visual assigned'; }
  }

  function broadcastSourceInventory() {
    const connection = state.connections.find((entry) => entry.capabilities?.includes('broadcast.status') || entry.capabilities?.includes('broadcast.audio.play') || entry.applicationId === 'com.tempestmainframe.tempest-broadcast');
    const inventory = connection?.status?.sourceInventory;
    const scenes = Array.isArray(inventory?.scenes) ? inventory.scenes.map((entry) => typeof entry === 'string' ? entry : entry?.name).filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim()) : [];
    return {
      connected: Boolean(connection),
      currentScene: typeof inventory?.currentScene === 'string' ? inventory.currentScene.trim().slice(0, 120) : '',
      scenes,
      audio: Array.isArray(inventory?.audio) ? inventory.audio.filter((entry) => typeof entry === 'string') : [],
      visual: Array.isArray(inventory?.visual) ? inventory.visual.filter((entry) => typeof entry === 'string') : []
    };
  }

  function assetRole(asset) {
    if (asset?.type === 'tempest.media.audio') return 'audio';
    if (asset?.type === 'tempest.media.visual') return 'visual';
    return 'other';
  }

  function assetUses(uri) {
    if (!uri) return [];
    const uses = [];
    for (const alert of state.soundAlerts?.alerts || []) {
      if (alert.audioUri === uri) uses.push(`Interaction · ${alert.name} sound`);
      if (alert.visualUri === uri) uses.push(`Interaction · ${alert.name} visual`);
    }
    for (const alert of state.twitchVisualAlerts?.alerts || []) {
      if (alert.audioUri === uri) uses.push(`Twitch · ${alert.name} sound`);
      if (alert.visualUri === uri) uses.push(`Twitch · ${alert.name} visual`);
      for (const variant of alert.alertVariants || []) {
        if (variant.audioUri === uri) uses.push(`Variant · ${variant.name} sound`);
        if (variant.visualUri === uri) uses.push(`Variant · ${variant.name} visual`);
      }
    }
    return uses;
  }

  function assignedMediaUris() {
    const uris = [];
    const remember = (entry) => {
      if (entry?.audioUri) uris.push(entry.audioUri);
      if (entry?.visualUri) uris.push(entry.visualUri);
    };
    for (const alert of state.soundAlerts?.alerts || []) remember(alert);
    for (const alert of state.twitchVisualAlerts?.alerts || []) {
      remember(alert);
      for (const variant of alert.alertVariants || []) remember(variant);
    }
    return [...new Set(uris)];
  }

  function unmanagedAssignedMediaUris() {
    const managedUris = new Set((state.assets || []).filter((asset) => asset.metadata?.managed === true).map((asset) => asset.uri));
    return assignedMediaUris().filter((uri) => !managedUris.has(uri));
  }

  function assetTargetOptions() {
    const interactions = (state.soundAlerts?.alerts || []).map((alert) => `<option value="interaction|${escapeHtml(alert.id)}">Interaction · ${escapeHtml(alert.name)}</option>`);
    const twitch = (state.twitchVisualAlerts?.alerts || []).flatMap((alert) => [
      `<option value="twitch|${escapeHtml(alert.id)}">Twitch · ${escapeHtml(alert.name)}</option>`,
      ...(alert.alertVariants || []).map((variant) => `<option value="twitch-variant|${escapeHtml(alert.id)}|${escapeHtml(variant.id)}">Variant · ${escapeHtml(variant.name)}</option>`)
    ]);
    return '<option value="">Choose an alert</option>' + [...interactions, ...twitch].join('');
  }

  function formatAssetBytes(value) {
    const bytes = Math.max(0, Number(value || 0));
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
  }

  function assetExtension(asset) {
    return String(asset?.metadata?.extension || '').toLowerCase();
  }

  function assetPreviewMarkup(asset, role) {
    if (!assetPreviewIds.has(asset.id) || role !== 'visual') return '';
    const extension = assetExtension(asset);
    if (extension === '.mp4' || extension === '.webm') return `<div class="asset-library-preview"><video src="${escapeHtml(asset.uri)}" controls muted playsinline preload="metadata"></video></div>`;
    return `<div class="asset-library-preview"><img src="${escapeHtml(asset.uri)}" alt="Preview of ${escapeHtml(asset.name)}" loading="lazy" /></div>`;
  }

  function renderAssetLibrary() {
    const assets = state.assets || [];
    const query = ($('#assetLibrarySearch')?.value || '').trim().toLowerCase();
    const filter = $('#assetLibraryFilter')?.value || 'all';
    const collectionFilter = $('#assetLibraryCollection')?.value || '';
    const enriched = assets.map((asset) => ({ asset, role: assetRole(asset), uses: assetUses(asset.uri) }))
      .sort((left, right) => Number(Boolean(right.asset.metadata?.favorite)) - Number(Boolean(left.asset.metadata?.favorite)) || left.asset.name.localeCompare(right.asset.name));
    const targetSelect = $('#assetLibraryTarget');
    const selectedTarget = targetSelect?.value || '';
    if (targetSelect) {
      targetSelect.innerHTML = assetTargetOptions();
      if ([...targetSelect.options].some((option) => option.value === selectedTarget)) targetSelect.value = selectedTarget;
    }
    const collectionSelect = $('#assetLibraryCollection');
    if (collectionSelect) {
      const collections = [...new Set(assets.map((asset) => String(asset.metadata?.collection || '').trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
      collectionSelect.innerHTML = '<option value="">All collections</option>' + collections.map((collection) => `<option value="${escapeHtml(collection)}">${escapeHtml(collection)}</option>`).join('');
      if (collections.includes(collectionFilter)) collectionSelect.value = collectionFilter;
    }
    const filtered = enriched.filter(({ asset, role, uses }) => {
      if (filter === 'favorites' && asset.metadata?.favorite !== true) return false;
      if (filter === 'audio' && role !== 'audio') return false;
      if (filter === 'visual' && role !== 'visual') return false;
      if (filter === 'used' && !uses.length) return false;
      if (filter === 'unused' && uses.length) return false;
      if (collectionFilter && asset.metadata?.collection !== collectionFilter) return false;
      return !query || [asset.name, asset.type, asset.metadata?.collection || '', ...(asset.tags || [])].join(' ').toLowerCase().includes(query);
    });
    $('#assetLibraryCount').textContent = assets.length;
    $('#assetLibraryAudioCount').textContent = enriched.filter((entry) => entry.role === 'audio').length;
    $('#assetLibraryVisualCount').textContent = enriched.filter((entry) => entry.role === 'visual').length;
    $('#assetLibraryUsedCount').textContent = enriched.filter((entry) => entry.uses.length).length;
    const adoptButton = $('#adoptAssignedMedia');
    const unmanagedCount = unmanagedAssignedMediaUris().length;
    adoptButton.disabled = unmanagedCount === 0;
    adoptButton.textContent = unmanagedCount ? `Adopt Assigned Media (${unmanagedCount})` : 'Assigned Media Managed';
    const grid = $('#assetLibraryGrid');
    grid.classList.toggle('empty-state', !filtered.length);
    grid.innerHTML = filtered.length ? filtered.map(({ asset, role, uses }) => {
      const size = Number(asset.metadata?.size || 0);
      const managed = asset.metadata?.managed === true;
      const checksum = String(asset.checksum || '').replace(/^sha256:/, '').slice(0, 12);
      const favorite = asset.metadata?.favorite === true;
      const collection = String(asset.metadata?.collection || '').trim();
      return `<article class="asset-library-card ${uses.length ? 'used' : ''} ${favorite ? 'favorite' : ''}">
        <div class="asset-library-icon ${escapeHtml(role)}">${role === 'audio' ? '♪' : role === 'visual' ? '▣' : '◇'}</div>
        <div class="asset-library-copy"><span>${favorite ? '★ FAVORITE · ' : ''}${escapeHtml(role.toUpperCase())} · ${managed ? 'STUDIO MANAGED' : 'INDEXED'}</span><h3>${escapeHtml(asset.name)}</h3><p>${escapeHtml((asset.tags || []).join(' · ') || asset.type)}</p><small>${collection ? `${escapeHtml(collection)} · ` : ''}${formatAssetBytes(size)}${checksum ? ` · SHA-256 ${escapeHtml(checksum)}…` : ''}</small><em>${uses.length ? escapeHtml(uses.slice(0, 2).join(' · ')) : 'Not assigned to an alert'}</em></div>
        ${assetPreviewMarkup(asset, role)}
        <div class="asset-library-actions"><button data-asset-preview="${escapeHtml(asset.id)}" ${role === 'other' ? 'disabled' : ''}>${assetPreviewIds.has(asset.id) && role === 'visual' ? 'Hide Preview' : 'Preview'}</button><button data-asset-edit="${escapeHtml(asset.id)}">Edit Details</button><button data-asset-assign="${escapeHtml(asset.id)}" ${role === 'other' ? 'disabled' : ''}>Assign</button><button class="danger-outline" data-asset-remove="${escapeHtml(asset.id)}" ${uses.length ? 'disabled title="Remove this media from every alert before deleting it"' : ''}>Remove</button></div>
      </article>`;
    }).join('') : (assets.length ? 'No media matches this search or filter.' : 'No media has been imported yet.');
  }

  async function importMediaAsset() {
    try {
      const imported = await window.tempestStudio.selectAsset();
      if (!imported) return;
      const result = await api('/v1/assets', { method: 'POST', body: imported.manifest });
      state.assets = [result.asset, ...state.assets.filter((asset) => asset.id !== result.asset.id)].sort((left, right) => left.name.localeCompare(right.name));
      renderAssetLibrary();
      toast(`${result.asset.name} ${imported.reused ? 'was already in' : 'was copied into'} the Media Library.`);
    } catch (error) { toast(error.message, true); }
  }

  async function previewLibraryAsset(id) {
    const asset = state.assets.find((entry) => entry.id === id);
    if (!asset) return;
    if (assetRole(asset) === 'audio') {
      try {
        if (assetPreviewAudio) { assetPreviewAudio.pause(); assetPreviewAudio = null; }
        const audio = new Audio(asset.uri);
        assetPreviewAudio = audio;
        audio.volume = 0.75;
        audio.addEventListener('ended', () => { if (assetPreviewAudio === audio) assetPreviewAudio = null; }, { once: true });
        await audio.play();
        toast(`Previewing ${asset.name}.`);
      } catch (error) { toast(`Could not preview ${asset.name}: ${error.message}`, true); }
      return;
    }
    if (assetPreviewIds.has(id)) assetPreviewIds.delete(id);
    else assetPreviewIds.add(id);
    renderAssetLibrary();
  }

  function openAssetEditor(id) {
    const asset = state.assets.find((entry) => entry.id === id);
    if (!asset) return;
    $('#assetEditorId').value = asset.id;
    $('#assetEditorName').value = asset.name;
    $('#assetEditorTags').value = (asset.tags || []).filter((tag) => !['audio', 'visual', 'managed'].includes(tag)).join(', ');
    $('#assetEditorCollection').value = String(asset.metadata?.collection || '');
    $('#assetEditorFavorite').checked = asset.metadata?.favorite === true;
    $('#assetEditorDialog').showModal();
    $('#assetEditorName').focus();
  }

  async function saveAssetDetails(event) {
    event.preventDefault();
    const id = $('#assetEditorId').value;
    const asset = state.assets.find((entry) => entry.id === id);
    if (!asset) return $('#assetEditorDialog').close();
    const name = $('#assetEditorName').value.trim().slice(0, 120);
    if (!name) return toast('Media display name is required.', true);
    const reservedTags = [assetRole(asset), assetExtension(asset).replace(/^\./, ''), ...(asset.metadata?.managed === true ? ['managed'] : [])].filter(Boolean);
    const customTags = $('#assetEditorTags').value.split(',').map((tag) => tag.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40)).filter(Boolean);
    const tags = [...new Set([...reservedTags, ...customTags])].slice(0, 20);
    const collection = $('#assetEditorCollection').value.trim().replace(/[\r\n\0]/g, ' ').slice(0, 60);
    try {
      const result = await api('/v1/assets', { method: 'POST', body: {
        ...asset,
        name,
        tags,
        metadata: { ...(asset.metadata || {}), favorite: $('#assetEditorFavorite').checked, collection }
      } });
      state.assets = [result.asset, ...state.assets.filter((entry) => entry.id !== id)].sort((left, right) => left.name.localeCompare(right.name));
      $('#assetEditorDialog').close();
      renderAssetLibrary();
      renderSoundAlerts();
      renderVisualAlerts();
      toast(`${result.asset.name} details saved.`);
    } catch (error) { toast(error.message, true); }
  }

  async function registerManagedManifests(manifests) {
    for (const manifest of manifests || []) {
      const existing = state.assets.find((asset) => asset.id === manifest.id && asset.metadata?.managed === true);
      const merged = existing ? {
        ...manifest,
        name: existing.name,
        tags: [...new Set([...(existing.tags || []), ...(manifest.tags || [])])],
        metadata: { ...(manifest.metadata || {}), ...(existing.metadata || {}), managed: true }
      } : manifest;
      const result = await api('/v1/assets', { method: 'POST', body: merged });
      state.assets = [result.asset, ...state.assets.filter((asset) => asset.id !== result.asset.id)];
    }
    state.assets.sort((left, right) => left.name.localeCompare(right.name));
  }

  async function adoptAssignedMedia() {
    const candidates = unmanagedAssignedMediaUris();
    if (!candidates.length) return toast('Every assigned alert file is already managed by the Media Library.');
    if (!confirm(`Copy ${candidates.length} assigned media file${candidates.length === 1 ? '' : 's'} into Studio-managed storage and update the alerts to use those verified copies? Your original files will remain untouched.`)) return;
    const button = $('#adoptAssignedMedia');
    button.disabled = true;
    button.textContent = 'Adopting…';
    try {
      const result = await window.tempestStudio.adoptAssignedAssets(candidates);
      for (const imported of result.imports || []) await registerManagedSelection(imported);
      const replacements = new Map((result.imports || []).map((entry) => [entry.sourceUri, entry.manifest.uri]));
      let updatedAlerts = 0;
      for (const alert of [...(state.soundAlerts?.alerts || [])]) {
        const patch = {};
        if (replacements.has(alert.audioUri) && replacements.get(alert.audioUri) !== alert.audioUri) patch.audioUri = replacements.get(alert.audioUri);
        if (replacements.has(alert.visualUri) && replacements.get(alert.visualUri) !== alert.visualUri) patch.visualUri = replacements.get(alert.visualUri);
        if (Object.keys(patch).length) {
          const response = await api(`/v1/sound-alerts/${encodeURIComponent(alert.id)}`, { method: 'POST', body: patch });
          state.soundAlerts.alerts[state.soundAlerts.alerts.findIndex((entry) => entry.id === alert.id)] = response.alert;
          updatedAlerts += 1;
        }
      }
      for (const alert of [...(state.twitchVisualAlerts?.alerts || [])]) {
        const patch = {};
        if (replacements.has(alert.audioUri) && replacements.get(alert.audioUri) !== alert.audioUri) patch.audioUri = replacements.get(alert.audioUri);
        if (replacements.has(alert.visualUri) && replacements.get(alert.visualUri) !== alert.visualUri) patch.visualUri = replacements.get(alert.visualUri);
        let variantsChanged = false;
        const alertVariants = (alert.alertVariants || []).map((variant) => {
          const next = { ...variant };
          if (replacements.has(variant.audioUri) && replacements.get(variant.audioUri) !== variant.audioUri) { next.audioUri = replacements.get(variant.audioUri); variantsChanged = true; }
          if (replacements.has(variant.visualUri) && replacements.get(variant.visualUri) !== variant.visualUri) { next.visualUri = replacements.get(variant.visualUri); variantsChanged = true; }
          return next;
        });
        if (variantsChanged) patch.alertVariants = alertVariants;
        if (Object.keys(patch).length) {
          const response = await api(`/v1/visual-alerts/twitch/${encodeURIComponent(alert.id)}`, { method: 'POST', body: patch });
          state.twitchVisualAlerts.alerts[state.twitchVisualAlerts.alerts.findIndex((entry) => entry.id === alert.id)] = response.alert;
          updatedAlerts += 1;
        }
      }
      renderSoundAlerts();
      renderVisualAlerts();
      renderAssetLibrary();
      const failed = result.failures?.length || 0;
      toast(`${result.imports.length} assigned media file${result.imports.length === 1 ? '' : 's'} adopted and ${updatedAlerts} alert${updatedAlerts === 1 ? '' : 's'} updated.${failed ? ` ${failed} file${failed === 1 ? '' : 's'} could not be adopted.` : ''}`, failed > 0);
    } catch (error) { toast(error.message, true); }
    finally { renderAssetLibrary(); }
  }

  async function assignLibraryAsset(id) {
    const asset = state.assets.find((entry) => entry.id === id);
    const target = $('#assetLibraryTarget').value;
    if (!asset || !target) return toast('Choose an alert before assigning this media.', true);
    const [kind, alertId, variantId] = target.split('|');
    const field = assetRole(asset) === 'audio' ? 'audioUri' : 'visualUri';
    let updated;
    if (kind === 'interaction') updated = await updateSoundAlert(alertId, { [field]: asset.uri }, `${asset.name} assigned from the Media Library.`);
    else if (kind === 'twitch') updated = await updateTwitchVisualAlert(alertId, { [field]: asset.uri }, `${asset.name} assigned from the Media Library.`);
    else if (kind === 'twitch-variant') updated = await updateTwitchVariant(alertId, variantId, { [field]: asset.uri }, `${asset.name} assigned from the Media Library.`);
    if (updated) renderAssetLibrary();
  }

  async function removeLibraryAsset(id) {
    const asset = state.assets.find((entry) => entry.id === id);
    if (!asset) return;
    const uses = assetUses(asset.uri);
    if (uses.length) return toast('Remove this media from every alert before deleting it.', true);
    if (!confirm(`Remove ${asset.name} from the Media Library?${asset.metadata?.managed === true ? " Studio's managed copy will be deleted; your original file will stay untouched." : ''}`)) return;
    try {
      await api(`/v1/assets/${encodeURIComponent(id)}`, { method: 'DELETE' });
      state.assets = state.assets.filter((entry) => entry.id !== id);
      if (asset.metadata?.managed === true) await window.tempestStudio.removeManagedAsset(asset.uri);
      renderAssetLibrary();
      toast(`${asset.name} removed from the Media Library.`);
    } catch (error) { toast(error.message, true); }
  }

  function soundAlertOptions(values, selected) {
    return values.map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${value.toUpperCase()}</option>`).join('');
  }

  function interactionCounterOptions(selected = '') {
    const counters = (state.chatbot?.commands || []).filter((command) => command.handler === 'counter');
    const preserved = selected && !counters.some((command) => command.id === selected) ? `<option value="${escapeHtml(selected)}" selected>Previously selected counter</option>` : '';
    return preserved + '<option value="">No counter change</option>' + counters.map((command) => `<option value="${escapeHtml(command.id)}" ${command.id === selected ? 'selected' : ''}>${escapeHtml(command.counterLabel || command.name)} · ${Number(command.counterValue || 0).toLocaleString()}</option>`).join('');
  }

  function vtubeStudioHotkeyOptions(selected = '') {
    const hotkeys = state.vtubeStudio?.hotkeys || [];
    const known = hotkeys.some((hotkey) => hotkey.hotkeyID === selected);
    const preserved = selected && !known ? `<option value="${escapeHtml(selected)}" selected>Previously selected hotkey</option>` : '';
    const placeholder = hotkeys.length ? '<option value="">Choose a VTube Studio hotkey</option>' : '<option value="">Connect VTube Studio in Connections first</option>';
    return preserved + placeholder + hotkeys.map((hotkey) => `<option value="${escapeHtml(hotkey.hotkeyID)}" ${hotkey.hotkeyID === selected ? 'selected' : ''}>${escapeHtml(hotkey.name)} · ${escapeHtml(hotkey.type)}</option>`).join('');
  }

  function viewerGroupOptions(selected = '') {
    const groups = state.chatbot?.viewerGroups || [];
    const known = groups.some((group) => group.id === selected);
    const preserved = selected && !known ? `<option value="${escapeHtml(selected)}" selected>Unavailable viewer group</option>` : '';
    const placeholder = groups.length ? '<option value="">Choose a viewer group</option>' : '<option value="">Create a viewer group above</option>';
    return preserved + placeholder + groups.map((group) => `<option value="${escapeHtml(group.id)}" ${group.id === selected ? 'selected' : ''}>${escapeHtml(group.name)} · ${group.resolvedViewers}/${group.logins.length} verified</option>`).join('');
  }

  function renderViewerGroups() {
    const groups = state.chatbot?.viewerGroups || [];
    $('#viewerGroupCount').textContent = `${groups.length} GROUP${groups.length === 1 ? '' : 'S'}`;
    const list = $('#viewerGroupList');
    list.classList.toggle('empty-state', !groups.length);
    list.innerHTML = groups.length ? groups.map((group) => `<article class="viewer-group-card">
      <div><strong>${escapeHtml(group.name)}</strong><span>${group.resolvedViewers}/${group.logins.length} Twitch accounts verified</span><small>${group.logins.map((login) => `@${escapeHtml(login)}`).join(', ')}</small></div>
      <div><button type="button" data-viewer-group-edit="${escapeHtml(group.id)}">Edit</button><button type="button" class="danger-outline" data-viewer-group-delete="${escapeHtml(group.id)}">Delete</button></div>
    </article>`).join('') : 'No reusable viewer groups yet.';
  }

  function resetViewerGroupForm() {
    editingViewerGroupId = '';
    $('#viewerGroupForm').reset();
    $('#viewerGroupId').value = '';
    $('#cancelViewerGroupEdit').hidden = true;
  }

  function editViewerGroup(id) {
    const group = state.chatbot?.viewerGroups?.find((entry) => entry.id === id);
    if (!group) return;
    editingViewerGroupId = group.id;
    $('#viewerGroupId').value = group.id;
    $('#viewerGroupName').value = group.name;
    $('#viewerGroupLogins').value = group.logins.join(', ');
    $('#cancelViewerGroupEdit').hidden = false;
    $('#viewerGroupName').focus();
  }

  async function saveViewerGroup(event) {
    event.preventDefault();
    const name = $('#viewerGroupName').value.trim();
    const logins = $('#viewerGroupLogins').value.split(/[\s,]+/).map((login) => login.trim().replace(/^@+/, '').toLowerCase()).filter(Boolean);
    const current = state.chatbot?.viewerGroups || [];
    let id = editingViewerGroupId;
    if (!id) {
      const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42) || 'viewer-group';
      id = base;
      for (let suffix = 2; current.some((group) => group.id === id); suffix += 1) id = `${base}-${suffix}`.slice(0, 48);
    }
    const viewerGroups = editingViewerGroupId
      ? current.map((group) => group.id === editingViewerGroupId ? { id, name, logins } : { id: group.id, name: group.name, logins: group.logins })
      : [...current.map((group) => ({ id: group.id, name: group.name, logins: group.logins })), { id, name, logins }];
    try {
      state.chatbot = await api('/v1/chatbot/configuration', { method: 'POST', body: { viewerGroups } });
      resetViewerGroupForm();
      renderSoundAlerts();
      toast(`${name} saved as a reusable viewer group.`);
    } catch (error) { toast(error.message, true); }
  }

  async function deleteViewerGroup(id) {
    const group = state.chatbot?.viewerGroups?.find((entry) => entry.id === id);
    if (!group || !confirm(`Delete ${group.name}? Alerts assigned to it will remain locked until you choose another group.`)) return;
    const viewerGroups = state.chatbot.viewerGroups.filter((entry) => entry.id !== id).map((entry) => ({ id: entry.id, name: entry.name, logins: entry.logins }));
    try {
      state.chatbot = await api('/v1/chatbot/configuration', { method: 'POST', body: { viewerGroups } });
      if (editingViewerGroupId === id) resetViewerGroupForm();
      renderSoundAlerts();
      toast(`${group.name} removed.`);
    } catch (error) { toast(error.message, true); }
  }

  function renderSoundAlerts() {
    renderViewerGroups();
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
      <div class="sound-alert-cue"><span>${alert.warudoEnabled || alert.vtubeStudioEnabled ? `${alert.warudoEnabled ? 'WARUDO' : ''}${alert.warudoEnabled && alert.vtubeStudioEnabled ? ' + ' : ''}${alert.vtubeStudioEnabled ? 'VTUBE STUDIO' : ''} + OVERLAY` : 'OVERLAY'}</span><span>MAX ${durationLabel(alert.durationMs)}</span></div>
      <div class="alert-media-summary">
        <div class="alert-media-slot"><span>SOUND</span><strong>${escapeHtml(soundAlertAudioName(alert.audioUri))}</strong></div>
        <div class="alert-media-slot"><span>VISUAL</span><strong>${escapeHtml(soundAlertVisualName(alert.visualUri))}</strong></div>
      </div>
      <div class="sound-alert-settings interaction-primary-settings">
        <label title="Hard stop for sound, visuals, TTS, avatar actions, and queue playback">Maximum runtime <span><input data-alert-duration="${escapeHtml(alert.id)}" type="number" min="1" max="60" value="${Math.round(alert.durationMs / 1000)}" /> sec</span></label>
        <label title="The visual can leave earlier, but never exceeds maximum runtime">Visual duration <span><input data-visual-alert-duration="${escapeHtml(alert.id)}" type="number" min="1" max="60" value="${Math.round((alert.visualDurationMs || 6000) / 1000)}" /> sec</span></label>
        <label>Volume <span><input data-alert-volume="${escapeHtml(alert.id)}" type="number" min="0" max="100" value="${Math.round(alert.volume * 100)}" /> %</span></label>
        <label>Alert accent <input data-visual-alert-accent="${escapeHtml(alert.id)}" type="color" value="${escapeHtml(alert.accent || '#54f2eb')}" /></label>
      </div>
      <label class="interaction-integration-toggle compact"><input data-alert-warudo-enabled="${escapeHtml(alert.id)}" type="checkbox" ${alert.warudoEnabled ? 'checked' : ''} /><span><strong>Use Warudo</strong><small>Trigger an avatar performance with this alert.</small></span></label>
      <div class="interaction-integration-options card-options" data-alert-warudo-options="${escapeHtml(alert.id)}" ${alert.warudoEnabled ? '' : 'hidden'}>
        <span>WARUDO PERFORMANCE</span>
        <div class="sound-alert-cue"><span class="copyable-value"><code>${escapeHtml(alert.cue)}</code>${copyButton(alert.cue, 'Warudo cue')}</span><small>Releases at maximum runtime.</small></div>
      </div>
      <label class="interaction-integration-toggle compact"><input data-alert-vtube-studio-enabled="${escapeHtml(alert.id)}" type="checkbox" ${alert.vtubeStudioEnabled ? 'checked' : ''} /><span><strong>Use VTube Studio</strong><small>Trigger a Live2D model hotkey with this alert.</small></span></label>
      <div class="interaction-integration-options card-options" data-alert-vtube-studio-options="${escapeHtml(alert.id)}" ${alert.vtubeStudioEnabled ? '' : 'hidden'}>
        <span>VTUBE STUDIO HOTKEY</span>
        <label>Loaded-model hotkey<select data-alert-vtube-studio-hotkey="${escapeHtml(alert.id)}">${vtubeStudioHotkeyOptions(alert.vtubeStudioHotkey || '')}</select></label>
        <small>Hotkey duration and auto-deactivation are controlled in VTube Studio.</small>
      </div>
      <details class="interaction-routing-details"><summary>Request + Broadcast routing</summary><div class="alert-settings-groups">
        <div class="alert-settings-group"><span>REQUEST</span><div class="sound-alert-settings">
          <label>Interaction type <select data-alert-category="${escapeHtml(alert.id)}">${soundAlertOptions(['sticker', 'gif', 'jumpscare', 'screen-effect', 'sound', 'counter', 'community', 'other'], alert.interactionCategory || 'other')}</select></label>
          <label>Placement <select data-alert-placement="${escapeHtml(alert.id)}"><option value="fixed" ${(alert.placementMode || 'fixed') === 'fixed' ? 'selected' : ''}>STREAMER PLACED</option><option value="viewer" ${alert.placementMode === 'viewer' ? 'selected' : ''}>VIEWER CLICK / TAP</option></select></label>
          <label>Viewer cooldown <span><input data-alert-viewer-cooldown="${escapeHtml(alert.id)}" type="number" min="0" max="86400" value="${Math.round(alert.viewerCooldownMs / 1000)}" /> sec</span></label>
          <label>Global cooldown <span><input data-alert-global-cooldown="${escapeHtml(alert.id)}" type="number" min="0" max="86400" value="${Math.round(alert.globalCooldownMs / 1000)}" /> sec</span></label>
          <label>Who can activate <select data-alert-access="${escapeHtml(alert.id)}"><option value="everyone" ${(alert.accessMode || 'everyone') === 'everyone' ? 'selected' : ''}>EVERYONE</option><option value="staff" ${alert.accessMode === 'staff' ? 'selected' : ''}>BROADCASTER + MODS</option><option value="assigned-creators" ${alert.accessMode === 'assigned-creators' ? 'selected' : ''}>ASSIGNED CREATORS</option><option value="viewer-group" ${alert.accessMode === 'viewer-group' ? 'selected' : ''}>VIEWER GROUP</option><option value="specific-viewers" ${alert.accessMode === 'specific-viewers' ? 'selected' : ''}>SPECIFIC TWITCH IDS</option></select></label>
          <label>Viewer group <select data-alert-viewer-group="${escapeHtml(alert.id)}">${viewerGroupOptions(alert.viewerGroupId || '')}</select></label>
          <label>Allowed Twitch IDs <input data-alert-allowed-viewers="${escapeHtml(alert.id)}" maxlength="3200" placeholder="Comma-separated numeric IDs" value="${escapeHtml((alert.allowedViewerIds || []).join(', '))}" /></label>
          <label>Blocked Twitch IDs <input data-alert-blocked-viewers="${escapeHtml(alert.id)}" maxlength="3200" placeholder="Optional numeric IDs" value="${escapeHtml((alert.blockedViewerIds || []).join(', '))}" /></label>
          <label class="toggle-label"><input data-alert-hide-locked="${escapeHtml(alert.id)}" type="checkbox" ${alert.hideWhenLocked ? 'checked' : ''} /> Hide when viewer is locked out</label>
          <label>Counter target <select data-alert-counter-command="${escapeHtml(alert.id)}">${interactionCounterOptions(alert.counterCommandId || '')}</select></label>
          <label>Counter change <input data-alert-counter-delta="${escapeHtml(alert.id)}" type="number" min="-1000" max="1000" step="1" value="${Number.isInteger(alert.counterDelta) ? alert.counterDelta : 1}" /></label>
          <label>Separate OBS audio <input data-alert-broadcast-audio="${escapeHtml(alert.id)}" list="broadcastAudioSourceOptions" maxlength="128" placeholder="Optional override" value="${escapeHtml(alert.broadcastAudioSource || '')}" /></label>
        </div></div>
        <div class="alert-settings-group"><span>BROADCAST REACTION</span><div class="sound-alert-settings">
          <label>Additional OBS visual <input data-visual-alert-broadcast-source="${escapeHtml(alert.id)}" list="visualAlertBroadcastSourceOptions" maxlength="128" placeholder="Optional source" value="${escapeHtml(alert.broadcastVisualSource || '')}" /></label>
          <label>HUD effect <select data-visual-alert-effect="${escapeHtml(alert.id)}">${soundAlertOptions(['pulse', 'glow', 'glitch', 'spectrum', 'surge'], alert.broadcastEffect || 'spectrum')}</select></label>
          <label>HUD circuit <select data-visual-alert-circuit="${escapeHtml(alert.id)}">${soundAlertOptions(['all', 'core', 'frame', 'chat', 'plates', 'alerts'], alert.broadcastCircuit || 'all')}</select></label>
          <label>Effect strength <span><input data-visual-alert-strength="${escapeHtml(alert.id)}" type="number" min="5" max="150" value="${Math.round((alert.broadcastEffectStrength || 1) * 100)}" /> %</span></label>
        </div></div>
      </div></details>
      <div class="sound-alert-actions interaction-alert-actions"><button data-interaction-alert-save="${escapeHtml(alert.id)}">Save Alert</button><button data-interaction-alert-design="${escapeHtml(alert.id)}">Customize Design</button><button data-export-interaction-alert-pack="${escapeHtml(alert.id)}">Export Pack</button><button data-sound-alert-audio="${escapeHtml(alert.id)}">Assign Sound</button><button data-sound-alert-visual="${escapeHtml(alert.id)}">Assign Visual</button><button data-giphy-alert-target="interaction|${escapeHtml(alert.id)}">GIPHY Visual</button><button data-sound-alert-toggle="${escapeHtml(alert.id)}">${alert.enabled ? 'Disable' : 'Enable'}</button><button data-visual-alert-preview="${escapeHtml(alert.id)}">Preview Alert</button><button class="primary-button" data-sound-alert-trigger="${escapeHtml(alert.id)}" ${!alert.enabled || !state.safety.armed ? 'disabled' : ''}>Test Interaction</button></div>
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
      ? `<strong>Unified Stage · Twitch Alerts:</strong> <span class="copyable-value"><code data-sensitive>${escapeHtml(unifiedVisualUrl('twitchAlerts', twitch.url))}</code>${copyButton(unifiedVisualUrl('twitchAlerts', twitch.url), 'Unified Stage Browser Source URL')}</span> · ${twitch.connectedClients ? `${twitch.connectedClients} connected` : 'waiting for Broadcast'} <button class="inline-note-button" data-visual-alert-clear="true" ${outputs.state !== 'showing' ? 'disabled' : ''}>Clear Alerts</button>`
      : '<strong>Twitch Alert source:</strong> Studio is preparing the local overlay.';
    $('#interactionAlertOverlayStatus').innerHTML = interaction
      ? `<strong>Unified Stage · Interaction visuals:</strong> <span class="copyable-value"><code data-sensitive>${escapeHtml(unifiedVisualUrl('interactionAlerts', interaction.url))}</code>${copyButton(unifiedVisualUrl('interactionAlerts', interaction.url), 'Unified Stage Browser Source URL')}</span> · ${interaction.connectedClients ? `${interaction.connectedClients} connected` : 'waiting for Broadcast'} · optional VOD audio lane: <span class="copyable-value"><code data-sensitive>${escapeHtml(state.unifiedStage?.interactionAudioUrl || interaction.url)}</code>${copyButton(state.unifiedStage?.interactionAudioUrl || interaction.url, 'Interaction audio-only URL')}</span>`
      : '<strong>Interaction Alert source:</strong> Studio is preparing the local overlay.';
    renderUnifiedAlerts();
  }

  function renderUnifiedAlerts() {
    const interactionAlerts = state.soundAlerts?.alerts || [];
    const twitchAlerts = state.twitchVisualAlerts?.alerts || [];
    const allAlerts = [...interactionAlerts, ...twitchAlerts];
    const outputs = state.visualAlerts;
    const queue = outputs?.queue;
    const active = queue?.active;
    const waiting = queue?.waiting || [];
    const connectedSources = Number(outputs?.twitch?.connectedClients || 0) + Number(outputs?.interaction?.connectedClients || 0);
    const enabledCount = allAlerts.filter((alert) => alert.enabled).length;
    const mediaCount = allAlerts.filter((alert) => alert.audioUri || alert.visualUri).length;

    $('#unifiedAlertTotalCount').textContent = allAlerts.length;
    $('#unifiedAlertEnabledCount').textContent = enabledCount;
    $('#unifiedAlertMediaCount').textContent = mediaCount;
    $('#unifiedAlertQueueCount').textContent = (active ? 1 : 0) + waiting.length;
    $('#unifiedAlertStateBadge').textContent = active ? 'ALERT PLAYING' : 'ENGINE READY';
    $('#unifiedAlertStateBadge').classList.toggle('offline', !outputs);
    $('#unifiedAlertQueueBadge').textContent = active ? 'PLAYING' : 'IDLE';
    $('#unifiedAlertQueueBadge').classList.toggle('online', Boolean(active));
    $('#unifiedAlertSourceCount').textContent = `${connectedSources} CONNECTED`;
    $('#unifiedAlertSourceCount').classList.toggle('online', connectedSources > 0);
    $('#unifiedTwitchCatalogSummary').textContent = `${twitchAlerts.length} alert type${twitchAlerts.length === 1 ? '' : 's'} · ${twitchAlerts.filter((alert) => alert.enabled).length} enabled`;
    $('#unifiedInteractionCatalogSummary').textContent = `${interactionAlerts.length} interaction${interactionAlerts.length === 1 ? '' : 's'} · ${interactionAlerts.filter((alert) => alert.enabled).length} enabled`;

    const now = $('#unifiedAlertNow');
    now.classList.toggle('empty-state', !active);
    now.innerHTML = active
      ? `<div class="unified-alert-kind ${escapeHtml(active.kind)}">${active.kind === 'twitch' ? 'TWITCH EVENT' : 'VIEWER INTERACTION'}</div><div><strong>${escapeHtml(active.name)}</strong><small>${escapeHtml(active.diagnostics?.viewerName || active.source)} · ${durationLabel(active.durationMs)}</small></div><i>PLAYING</i>`
      : 'No alert is playing.';

    const waitingList = $('#unifiedAlertWaiting');
    waitingList.classList.toggle('empty-state', !waiting.length);
    waitingList.innerHTML = waiting.length
      ? waiting.map((item, index) => `<div class="unified-alert-queue-item"><b>${index + 1}</b><div><strong>${escapeHtml(item.name)}</strong><small>${item.kind === 'twitch' ? 'Twitch event' : 'Viewer interaction'} · ${escapeHtml(item.diagnostics?.viewerName || item.source)}</small></div><span>${durationLabel(item.durationMs)}</span></div>`).join('')
      : 'The queue is empty.';
    $('#clearUnifiedAlertQueue').disabled = !waiting.length;

    const renderSource = (target, output, title, copyLabel, moduleId, overrideUrl) => {
      const sourceUrl = overrideUrl || unifiedVisualUrl(moduleId, output?.url);
      target.classList.toggle('connected', Boolean(output?.connectedClients));
      target.innerHTML = output
        ? `<span>${title}</span><strong>${output.connectedClients ? `${output.connectedClients} Unified Stage connection${output.connectedClients === 1 ? '' : 's'}` : 'Waiting for Unified Stage'}</strong><div class="unified-alert-source-url"><code data-sensitive>${escapeHtml(sourceUrl)}</code>${copyButton(sourceUrl, copyLabel)}</div>`
        : `<span>${title}</span><strong>Preparing source…</strong>`;
    };
    renderSource($('#unifiedTwitchAlertSource'), outputs?.twitch, 'TWITCH EVENTS · UNIFIED VISUAL', 'Unified Stage Browser Source URL', 'twitchAlerts');
    renderSource($('#unifiedInteractionAlertSource'), outputs?.interaction, 'VIEWER INTERACTIONS · OPTIONAL AUDIO LANE', 'Interaction audio-only URL', 'interactionAlerts', state.unifiedStage?.interactionAudioUrl);
  }

  function giphyAlertTargets() {
    const targets = [];
    for (const alert of state.soundAlerts?.alerts || []) targets.push({ key: `interaction|${alert.id}`, kind: 'interaction', alertId: alert.id, name: alert.name, group: 'Interaction Alerts' });
    for (const alert of state.twitchVisualAlerts?.alerts || []) {
      targets.push({ key: `twitch|${alert.id}`, kind: 'twitch', alertId: alert.id, name: alert.name, group: 'Twitch Alerts' });
      for (const variant of alert.alertVariants || []) targets.push({ key: `twitch-variant|${alert.id}|${variant.id}`, kind: 'twitch-variant', alertId: alert.id, variantId: variant.id, name: `${alert.name} · ${variant.name}`, group: 'Twitch Alert Variants' });
    }
    return targets;
  }

  function selectedGiphyTarget() {
    const key = $('#giphyTargetAlert').value;
    return giphyAlertTargets().find((entry) => entry.key === key);
  }

  function updateGiphyTargetContext() {
    const target = selectedGiphyTarget();
    const summary = $('#giphyTargetSummary');
    if (summary) summary.textContent = target
      ? `Your selection will be downloaded and assigned to ${target.name}.`
      : 'Choose an alert before selecting a GIF.';
    document.querySelectorAll('[data-giphy-result]').forEach((button) => {
      button.setAttribute('aria-label', `Assign this GIF to ${target?.name || 'the selected alert'}`);
    });
  }

  function openGiphyForAlert(targetKey) {
    showSection('soundalerts');
    renderVisualAlerts();
    const target = giphyAlertTargets().find((entry) => entry.key === targetKey);
    if (!target) return toast('That alert is no longer available as a GIPHY target.', true);
    const variantDialog = $('#twitchVariantDialog');
    if (variantDialog.open) variantDialog.close();
    $('#giphyTargetAlert').value = target.key;
    updateGiphyTargetContext();
    $('.giphy-picker-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#giphySearchQuery').focus({ preventScroll: true });
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
    const selectedGiphyTargetKey = giphyTarget.value;
    const targets = giphyAlertTargets();
    const targetOptions = ['Interaction Alerts', 'Twitch Alerts', 'Twitch Alert Variants'].map((group) => {
      const options = targets.filter((target) => target.group === group).map((target) => `<option value="${escapeHtml(target.key)}">${escapeHtml(target.name)}</option>`).join('');
      return options ? `<optgroup label="${group}">${options}</optgroup>` : '';
    }).join('');
    if (giphyTarget.innerHTML !== targetOptions) giphyTarget.innerHTML = targetOptions;
    if (targets.some((target) => target.key === selectedGiphyTargetKey)) giphyTarget.value = selectedGiphyTargetKey;
    else if (targets[0]) giphyTarget.value = targets[0].key;
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
        <label title="Hard stop for sound, visuals, TTS, reactions, and queue playback">Maximum runtime <span><input data-twitch-visual-duration="${escapeHtml(alert.id)}" type="number" min="1" max="60" value="${Math.round(alert.durationMs / 1000)}" /> sec</span></label>
        <label>Volume <span><input data-twitch-alert-volume="${escapeHtml(alert.id)}" type="number" min="0" max="100" value="${Math.round((alert.volume ?? 0.8) * 100)}" /> %</span></label>
        <label>Alert accent <input data-twitch-visual-accent="${escapeHtml(alert.id)}" type="color" value="${escapeHtml(alert.accent || '#54f2eb')}" /></label>
      </div>
      <div class="twitch-variant-summary"><span>VARIANTS</span><strong>${(alert.alertVariants || []).filter((variant) => variant.enabled).length} active · ${(alert.alertVariants || []).length} total</strong><small>Amount, tier, tenure, raid size, or reward rules</small></div>
      <div class="sound-alert-actions twitch-alert-actions"><button data-twitch-visual-save="${escapeHtml(alert.id)}">Save Alert</button><button data-twitch-alert-design="${escapeHtml(alert.id)}">Customize Design</button><button data-export-twitch-alert-pack="${escapeHtml(alert.id)}">Export Pack</button>${variantConditionChoices(alert.topic).length ? `<button data-twitch-alert-variants="${escapeHtml(alert.id)}">Manage Variants${(alert.alertVariants || []).length ? ` (${(alert.alertVariants || []).length})` : ''}</button>` : '<button disabled title="This event has no amount, tier, tenure, raid-size, or reward field">Variants unavailable</button>'}<button data-twitch-alert-audio="${escapeHtml(alert.id)}">Assign Sound</button><button data-twitch-visual-file="${escapeHtml(alert.id)}">Assign Visual</button><button data-giphy-alert-target="twitch|${escapeHtml(alert.id)}">GIPHY Visual</button><button data-twitch-visual-toggle="${escapeHtml(alert.id)}">${alert.enabled ? 'Disable' : 'Enable'}</button><button class="primary-button" data-twitch-visual-preview="${escapeHtml(alert.id)}">Preview Base Alert</button></div>
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
      ? `<strong>Unified Stage · Chat:</strong> <span class="copyable-value"><code data-sensitive>${escapeHtml(unifiedVisualUrl('chatOverlay', overlay.url))}</code>${copyButton(unifiedVisualUrl('chatOverlay', overlay.url), 'Unified Stage Browser Source URL')}</span> · ${overlay.connectedClients ? `${overlay.connectedClients} connected` : 'waiting for Broadcast'}`
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

  function discordProfileFor(userId) {
    const saved = (state.discordVoice?.profiles || []).find((entry) => entry.userId === userId) || {};
    return { ...saved, ...(discordProfileDrafts.get(userId) || {}) };
  }

  function rememberDiscordProfileDraft(event) {
    const target = event.target;
    const definitions = [
      ['discordProfileName', 'displayName', (value) => value],
      ['discordProfileOrder', 'order', (value) => value],
      ['discordProfileAccent', 'accent', (value) => value],
      ['discordProfileX', 'positionX', (value) => value],
      ['discordProfileY', 'positionY', (value) => value],
      ['discordProfileVisible', 'visible', (_value, input) => input.checked]
    ];
    const match = definitions.find(([datasetKey]) => target.dataset?.[datasetKey] !== undefined);
    if (!match) return;
    const [datasetKey, profileKey, transform] = match;
    const userId = target.dataset[datasetKey];
    discordProfileDrafts.set(userId, { ...(discordProfileDrafts.get(userId) || {}), [profileKey]: transform(target.value, target) });
    const canvasPerson = document.querySelector(`[data-discord-canvas-id="${CSS.escape(userId)}"]`);
    if (!canvasPerson) return;
    if (profileKey === 'positionX' || profileKey === 'positionY') {
      const value = Number(target.value);
      if (Number.isFinite(value)) canvasPerson.style[profileKey === 'positionX' ? 'left' : 'top'] = `${Math.max(0, Math.min(100, value))}%`;
    } else if (profileKey === 'accent') canvasPerson.style.setProperty('--participant-accent', target.value);
    else if (profileKey === 'displayName') canvasPerson.querySelector('strong').textContent = target.value || canvasPerson.querySelector('strong').textContent;
    else if (profileKey === 'visible') canvasPerson.hidden = !target.checked;
  }

  function localMediaName(uri, fallback) {
    if (!uri) return fallback;
    try { return decodeURIComponent(new URL(uri).pathname.split('/').pop()) || fallback; }
    catch { return fallback; }
  }

  function discordProfileImage(participant, profile) {
    if (participant.deaf && profile.deafenUri) return profile.deafenUri;
    if (participant.mute && profile.muteUri) return profile.muteUri;
    if (participant.speaking && profile.speakingUri) return profile.speakingUri;
    return profile.idleUri || participant.avatarUrl || profile.avatarUrl || '';
  }

  function discordImagePreview(uri, displayName, className = '') {
    const initials = String(displayName || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
    return `<span class="discord-image-preview ${className}">${uri ? `<img src="${escapeHtml(uri)}" alt="" />` : `<i>${escapeHtml(initials || '?')}</i>`}</span>`;
  }

  function discordMediaSlot(participant, profile, kind, title, fallback) {
    const uri = profile[`${kind}Uri`] || '';
    const previewUri = uri || (kind === 'idle' ? participant.avatarUrl || profile.avatarUrl || '' : profile.idleUri || participant.avatarUrl || profile.avatarUrl || '');
    const name = localMediaName(uri, fallback);
    return `<div class="discord-media-slot ${uri ? 'assigned' : 'fallback'}">${discordImagePreview(previewUri, participant.displayName, 'discord-media-thumb')}<div><span>${title}</span><strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong></div><button data-discord-image-id="${escapeHtml(participant.id)}" data-discord-image-kind="${kind}">${uri ? 'Replace' : 'Assign'}</button></div>`;
  }

  function discordCanvasPosition(participant, index, total) {
    const profile = discordProfileFor(participant.id);
    return {
      x: Number.isFinite(Number(profile.positionX)) ? Number(profile.positionX) : ((index + 1) / (total + 1)) * 100,
      y: Number.isFinite(Number(profile.positionY)) ? Number(profile.positionY) : 82
    };
  }

  function discordGuestStateLabel(guest) {
    if (guest.inChannel) return guest.speaking ? 'SPEAKING' : guest.mute ? 'MUTED' : 'IN CHANNEL';
    if (!guest.lastSeenAt) return 'SAVED · NOT SEEN YET';
    const seen = new Date(guest.lastSeenAt);
    return `OFFLINE · LAST SEEN ${Number.isNaN(seen.getTime()) ? 'EARLIER' : seen.toLocaleDateString()}`;
  }

  function renderDiscordVoice({ settings = false, force = false } = {}) {
    const overlay = state.discordVoice;
    const rpc = state.discordRpc || {};
    const configuration = overlay?.settings || {};
    const connection = overlay?.connection || {};
    const participants = overlay?.participants || [];
    const guests = [...(overlay?.guests || participants)].sort((left, right) => Number(right.inChannel) - Number(left.inChannel) || (left.order - right.order) || String(left.displayName).localeCompare(String(right.displayName)));
    const connected = rpc.state === 'connected';
    $('#discordVoiceBadge').textContent = overlay?.previewing ? 'PREVIEW' : connected ? 'CONNECTED' : overlay ? 'OVERLAY READY' : 'CHECKING';
    $('#discordVoiceBadge').classList.toggle('offline', !connected && !overlay?.previewing);
    $('#discordVoiceConnectionMetric').textContent = rpc.state === 'unconfigured' ? 'PREVIEW READY' : String(rpc.state || 'offline').replaceAll('-', ' ').toUpperCase();
    $('#discordVoiceChannelMetric').textContent = String(connection.channelName || rpc.channelName || 'NONE').toUpperCase();
    $('#discordVoiceGuildMetric').textContent = connection.guildName || rpc.guildName || 'Open Discord and join voice';
    $('#discordVoiceParticipantMetric').textContent = participants.length;
    $('#discordVoiceSavedMetric').textContent = `${overlay?.savedGuestCount || 0} saved guest profile${overlay?.savedGuestCount === 1 ? '' : 's'}`;
    $('#discordVoiceClientMetric').textContent = overlay?.connectedClients || 0;
    $('#discordVoiceBrowserStatus').innerHTML = overlay
      ? `<strong>Unified Stage · Discord Guests:</strong> <span class="copyable-value"><code data-sensitive>${escapeHtml(unifiedVisualUrl('discordVoice', overlay.url))}</code>${copyButton(unifiedVisualUrl('discordVoice', overlay.url), 'Unified Stage Browser Source URL')}</span> · ${overlay.connectedClients ? `${overlay.connectedClients} connected` : 'waiting for Broadcast'}`
      : '<strong>Browser Source:</strong> Studio is preparing the local Discord Guests overlay.';
    const connectionMessage = rpc.lastError || (rpc.state === 'connected'
      ? `Following ${rpc.channelName || 'your selected voice channel'}${rpc.guildName ? ` in ${rpc.guildName}` : ''}.`
      : rpc.state === 'authorization-required' ? 'Click Connect Discord and approve Tempest once inside Discord Desktop.'
        : rpc.state === 'unconfigured' ? 'The local overlay and image designer are ready. One-click Discord sign-in is being prepared for the public build; Preview Guests works now.'
          : 'Open Discord Desktop, join a voice channel, then connect Tempest.');
    $('#discordVoiceConnectionStatus').innerHTML = `<strong>Discord:</strong> ${escapeHtml(connectionMessage)}`;
    $('#connectDiscordVoice').disabled = rpc.state === 'connecting' || rpc.state === 'connected' || !rpc.configured;
    $('#disconnectDiscordVoice').disabled = rpc.state !== 'connected' && rpc.state !== 'error';
    $('#forgetDiscordVoice').disabled = rpc.state === 'unconfigured';
    const editingDiscordProfile = discordCanvasDrag || document.activeElement?.closest?.('#discordVoiceParticipantGrid');
    if (editingDiscordProfile && !force) return;
    const useStoredSettings = settings && !discordSettingsDirty;
    const selectedLayout = useStoredSettings ? configuration.layout || 'horizontal' : $('#discordVoiceLayout').value || configuration.layout || 'horizontal';
    const hideSelf = useStoredSettings ? configuration.hideSelf === true : $('#discordVoiceHideSelf').checked;
    const hideBots = useStoredSettings ? configuration.hideBots !== false : $('#discordVoiceHideBots').checked;
    const grid = $('#discordVoiceParticipantGrid');
    grid.classList.toggle('empty-state', !guests.length);
    grid.innerHTML = guests.length ? guests.map((participant, index) => {
      const profile = discordProfileFor(participant.id);
      const position = discordCanvasPosition(participant, index, guests.length);
      const currentImage = discordProfileImage(participant, profile);
      return `<article class="discord-participant-card ${participant.speaking ? 'speaking' : ''} ${participant.inChannel ? '' : 'offline'}" data-discord-profile-card="${escapeHtml(participant.id)}">
        <div class="discord-participant-head">${discordImagePreview(currentImage, participant.displayName, 'discord-participant-avatar')}<div><span>${participant.self ? 'YOU · ' : ''}${participant.bot ? 'BOT · ' : ''}${escapeHtml(discordGuestStateLabel(participant))}</span><h3>${escapeHtml(participant.displayName)}</h3><small class="discord-user-id">Discord ID ${escapeHtml(participant.id)}</small></div></div>
        <div class="discord-profile-fields"><label>Overlay name<input data-discord-profile-name="${escapeHtml(participant.id)}" maxlength="100" value="${escapeHtml(profile.displayName || '')}" placeholder="${escapeHtml(participant.displayName)}" /></label><label>Order<input data-discord-profile-order="${escapeHtml(participant.id)}" type="number" min="0" max="999" value="${profile.order ?? 500}" /></label><label>Accent<input data-discord-profile-accent="${escapeHtml(participant.id)}" type="color" value="${escapeHtml(profile.accent || configuration.speakingAccent || '#54f2eb')}" /></label><label>Canvas X<input data-discord-profile-x="${escapeHtml(participant.id)}" type="number" min="0" max="100" step="0.1" value="${position.x.toFixed(1)}" /><small>percent</small></label><label>Canvas Y<input data-discord-profile-y="${escapeHtml(participant.id)}" type="number" min="0" max="100" step="0.1" value="${position.y.toFixed(1)}" /><small>percent</small></label><label class="checkbox-label"><input data-discord-profile-visible="${escapeHtml(participant.id)}" type="checkbox" ${profile.visible === false ? '' : 'checked'} /> ${participant.self ? 'Show streamer profile on canvas' : 'Show this person'}</label></div>
        <div class="discord-media-slots">${discordMediaSlot(participant, profile, 'idle', 'IDLE IMAGE', 'Default Discord avatar')}${discordMediaSlot(participant, profile, 'speaking', 'SPEAKING IMAGE', 'Falls back to idle')}${discordMediaSlot(participant, profile, 'mute', 'MUTE IMAGE', 'Falls back to idle')}${discordMediaSlot(participant, profile, 'deafen', 'DEAFEN IMAGE', 'Falls back to mute or idle')}</div>
        <div class="chat-overlay-actions"><button data-discord-profile-save="${escapeHtml(participant.id)}" class="primary-button">Save Person</button><button data-discord-profile-export="${escapeHtml(participant.id)}" class="secondary-button">Export Profile</button>${participant.self && profile.visible !== false ? `<button data-discord-profile-hide-self="${escapeHtml(participant.id)}" class="secondary-button danger-outline">Hide Streamer</button>` : ''}<button data-discord-profile-reset="${escapeHtml(participant.id)}" class="secondary-button">Reset Style</button><button data-discord-profile-forget="${escapeHtml(participant.id)}" class="secondary-button danger-outline">Forget User</button></div>
      </article>`;
    }).join('') : 'Connect Discord, add someone by User ID, or load sample guests to assign images.';
    guests.forEach((participant) => document.querySelector(`[data-discord-profile-card="${CSS.escape(participant.id)}"]`)?.style.setProperty('--participant-accent', discordProfileFor(participant.id).accent || configuration.speakingAccent || '#54f2eb'));
    const canvas = activeCanvasProfile();
    const canvasPreview = $('#discordVoiceCanvasPreview');
    const canvasGuests = guests.filter((participant) => discordProfileFor(participant.id).visible !== false && !(hideSelf && participant.self) && !(hideBots && participant.bot));
    canvasPreview.style.aspectRatio = `${canvas.baseWidth} / ${canvas.baseHeight}`;
    canvasPreview.classList.toggle('manual', selectedLayout === 'manual');
    canvasPreview.innerHTML = canvasGuests.length ? canvasGuests.map((participant) => {
      const profile = discordProfileFor(participant.id);
      return `<button type="button" class="discord-canvas-person ${participant.self ? 'self' : ''}" data-discord-canvas-id="${escapeHtml(participant.id)}" title="${selectedLayout === 'manual' ? 'Drag to place' : 'Choose Manual canvas placement to drag'}">${discordImagePreview(discordProfileImage(participant, profile), profile.displayName || participant.displayName, 'discord-canvas-avatar')}<strong>${escapeHtml(profile.displayName || participant.displayName)}</strong></button>`;
    }).join('') : '<div class="discord-canvas-empty">Add or preview a guest to place profiles.</div>';
    canvasGuests.forEach((participant, index) => {
      const person = document.querySelector(`[data-discord-canvas-id="${CSS.escape(participant.id)}"]`);
      const profile = discordProfileFor(participant.id);
      const position = discordCanvasPosition(participant, index, canvasGuests.length);
      person?.style.setProperty('left', `${position.x}%`);
      person?.style.setProperty('top', `${position.y}%`);
      person?.style.setProperty('--participant-accent', profile.accent || configuration.speakingAccent || '#54f2eb');
    });
    $('#discordCanvasProfile').textContent = `${canvas.baseWidth} × ${canvas.baseHeight}`;
    $('#discordCanvasHelp').textContent = selectedLayout === 'manual' ? 'Drag any profile to place it. The new X/Y position saves when you release it.' : 'Automatic layouts preview their default row. Select Manual canvas placement to drag profiles.';
    if (useStoredSettings && overlay) {
      $('#discordVoiceEnabled').checked = configuration.enabled !== false;
      $('#discordVoiceLayout').value = configuration.layout || 'horizontal';
      $('#discordVoiceAvatarSize').value = configuration.avatarSize || 160;
      $('#discordVoiceGap').value = configuration.gap ?? 24;
      $('#discordVoiceInactiveOpacity').value = Math.round((configuration.inactiveOpacity ?? 0.72) * 100);
      $('#discordVoiceSpeakingScale').value = Math.round((configuration.speakingScale ?? 1.08) * 100);
      $('#discordVoiceAccent').value = configuration.speakingAccent || '#54f2eb';
      $('#discordVoiceShowNames').checked = configuration.showNames !== false;
      $('#discordVoiceShowStatus').checked = configuration.showStatusIcons !== false;
      $('#discordVoiceHideSelf').checked = configuration.hideSelf === true;
      $('#discordVoiceHideBots').checked = configuration.hideBots !== false;
    }
  }

  function renderEmoteWall({ settings = false } = {}) {
    const wall = state.emoteWall;
    const configuration = wall?.settings || {};
    const sourceConnected = Number(wall?.connectedClients || 0) > 0;
    $('#emoteWallStateBadge').textContent = !wall ? 'CHECKING' : configuration.enabled === false ? 'DISABLED' : sourceConnected ? 'SOURCE CONNECTED' : 'SOURCE DISCONNECTED';
    $('#emoteWallStateBadge').classList.toggle('offline', !wall || configuration.enabled === false || !sourceConnected);
    $('#emoteWallActiveCount').textContent = `${wall?.activeCount || 0} ACTIVE`;
    $('#emoteWallPyramidStatus').textContent = configuration.enablePyramids === false ? 'PYRAMIDS OFF' : wall?.pyramid?.building ? `BUILDING ${wall.pyramid.step}/5` : `${wall?.pyramid?.completed || 0} PYRAMIDS`;
    $('#emoteWallPyramidStatus').classList.toggle('installed', configuration.enablePyramids !== false);
    $('#emoteWallBrowserStatus').innerHTML = wall
      ? `<strong>Unified Stage · Emote Wall:</strong> <span class="copyable-value"><code data-sensitive>${escapeHtml(unifiedVisualUrl('emoteWall', wall.url))}</code>${copyButton(unifiedVisualUrl('emoteWall', wall.url), 'Unified Stage Browser Source URL')}</span> · ${sourceConnected ? `${wall.connectedClients} connected` : 'waiting for Unified Stage in Broadcast'}`
      : '<strong>Browser Source:</strong> Studio is preparing the local Emote Wall.';
    const providerLabels = { seventv: '7TV', bttv: 'BetterTTV', ffz: 'FrankerFaceZ' };
    $('#emoteProviderCatalogCount').textContent = `${wall?.providerCatalogCount || 0} CATALOGED`;
    $('#emoteProviderStatusGrid').innerHTML = (wall?.providers || []).map((provider) => {
      const stateLabel = provider.state === 'ready' ? 'READY' : provider.state === 'waiting' ? 'WAITING FOR TWITCH' : provider.state === 'error' ? 'ERROR' : 'OFF';
      const detail = provider.state === 'ready' ? `${provider.emoteCount || 0} exact-name emotes loaded` : provider.state === 'error' ? escapeHtml(provider.error || 'Catalog refresh failed.') : provider.state === 'waiting' ? 'Connect Twitch, then refresh.' : 'Provider is opt-in.';
      return `<div class="emote-provider-status-card"><div><strong>${providerLabels[provider.id] || escapeHtml(provider.id)}</strong><span class="state-chip ${provider.state === 'ready' ? 'installed' : provider.state === 'error' ? 'error' : ''}">${stateLabel}</span></div><p>${detail}</p></div>`;
    }).join('') || '<div class="empty-state">Provider status will appear after Studio connects.</div>';
    if (settings && wall) {
      $('#emoteWallEnabled').checked = configuration.enabled !== false;
      $('#emoteWallMaxActive').value = configuration.maxActive || 18;
      $('#emoteWallLifetime').value = Math.round((configuration.lifetimeMs || 10000) / 1000);
      $('#emoteWallSize').value = configuration.sizePx || 96;
      $('#emoteWallSpeed').value = configuration.speed || 100;
      $('#emoteWallAnimated').checked = configuration.includeAnimated !== false;
      $('#emoteWallGifs').checked = configuration.includeGifs !== false;
      $('#emoteWallPyramids').checked = configuration.enablePyramids !== false;
      $('#emoteWallPyramidWindow').value = Math.round((configuration.pyramidWindowMs || 20000) / 1000);
      $('#emoteWallPyramidCooldown').value = Math.round((configuration.pyramidCooldownMs || 30000) / 1000);
      $('#emoteWallSevenTv').checked = configuration.enableSevenTv === true;
      $('#emoteWallBttv').checked = configuration.enableBttv === true;
      $('#emoteWallFfz').checked = configuration.enableFfz === true;
      $('#emoteWallProviderOrder').value = configuration.providerOrder || 'seventv,bttv,ffz';
    }
  }

  const twitchExperienceDesigners = {
    'hype-train': { prefix: 'Hype', designKey: 'hypeTrainDesign', defaultPreset: 'tempest' },
    'raid-portal': { prefix: 'Raid', designKey: 'raidPortalDesign', defaultPreset: 'mainframe-breach' },
    'goal-overlay': { prefix: 'Goal', designKey: 'goalOverlayDesign', defaultPreset: 'tempest' }
  };

  function twitchExperienceMediaName(uri) {
    if (!uri) return 'None';
    try { return decodeURIComponent(new URL(uri).pathname.split('/').filter(Boolean).at(-1) || 'Assigned media'); }
    catch { return 'Assigned media'; }
  }

  function populateTwitchExperienceDesign(kind, design = {}) {
    const meta = twitchExperienceDesigners[kind];
    const prefix = `#twitchExperience${meta.prefix}`;
    $(`${prefix}Preset`).value = design.preset || meta.defaultPreset;
    $(`${prefix}MediaLayer`).value = design.mediaLayer || 'background';
    $(`${prefix}MediaFit`).value = design.mediaFit || 'cover';
    const opacity = Math.round((Number.isFinite(Number(design.mediaOpacity)) ? Number(design.mediaOpacity) : 0.5) * 100);
    $(`${prefix}MediaOpacity`).value = opacity;
    $(`${prefix}MediaOpacityValue`).textContent = `${opacity}%`;
    $(`${prefix}CustomHtml`).value = design.customHtml || '';
    $(`${prefix}CustomCss`).value = design.customCss || '';
    $(`${prefix}CustomJavaScript`).value = design.customJavaScript || '';
    const mediaUri = Object.hasOwn(twitchExperienceDraftMedia, kind) ? twitchExperienceDraftMedia[kind] : design.mediaUri || '';
    $(`${prefix}MediaName`).textContent = twitchExperienceMediaName(mediaUri);
  }

  function twitchExperienceDesignFromForm(kind) {
    const meta = twitchExperienceDesigners[kind];
    const prefix = `#twitchExperience${meta.prefix}`;
    const saved = state.twitchExperiences?.settings?.[meta.designKey] || {};
    return {
      preset: $(`${prefix}Preset`).value,
      mediaUri: Object.hasOwn(twitchExperienceDraftMedia, kind) ? twitchExperienceDraftMedia[kind] : saved.mediaUri || '',
      mediaLayer: $(`${prefix}MediaLayer`).value,
      mediaFit: $(`${prefix}MediaFit`).value,
      mediaOpacity: Number($(`${prefix}MediaOpacity`).value) / 100,
      customHtml: $(`${prefix}CustomHtml`).value,
      customCss: $(`${prefix}CustomCss`).value,
      customJavaScript: $(`${prefix}CustomJavaScript`).value
    };
  }

  function studioGoalFromForm(active = state.twitchExperiences?.settings?.studioGoal?.active === true) {
    return {
      active,
      kind: $('#twitchExperienceGoalKind').value,
      title: $('#twitchExperienceGoalTitle').value.trim(),
      currentAmount: Number($('#twitchExperienceGoalCurrent').value),
      targetAmount: Number($('#twitchExperienceGoalTarget').value),
      unit: $('#twitchExperienceGoalUnit').value.trim()
    };
  }

  function updateGoalEditorAvailability() {
    const managed = $('#twitchExperienceGoalSource').value === 'studio';
    document.querySelectorAll('[data-studio-goal-field]').forEach((label) => {
      label.classList.toggle('disabled', !managed);
      label.querySelectorAll('input,select').forEach((input) => { input.disabled = !managed; });
    });
    document.querySelectorAll('[data-twitch-goal-action]').forEach((button) => { button.disabled = !managed; });
    $('#twitchGoalSourceBadge').textContent = managed ? 'STUDIO MANAGED' : 'TWITCH AUTO';
    $('#twitchGoalControlNote').innerHTML = managed
      ? '<strong>Studio managed:</strong> Show or update this goal immediately, then use −1 and +1 while live. The value persists across restarts.'
      : '<strong>Twitch automatic:</strong> Create or manage the goal in Twitch; Studio will mirror its title and progress.';
  }

  function renderTwitchExperiences({ settings = false } = {}) {
    const experience = state.twitchExperiences;
    const configuration = experience?.settings || {};
    const active = experience?.active || {};
    const features = state.twitch?.eventSubFeatures || {};
    const missingScopes = state.twitch?.oauth?.missingScopes || [];
    $('#twitchExperienceBadge').textContent = !experience ? 'CHECKING' : configuration.enabled === false ? 'DISABLED' : experience.connectedClients ? 'SOURCE CONNECTED' : 'READY';
    $('#twitchExperienceBadge').classList.toggle('offline', !experience || configuration.enabled === false);
    $('#twitchExperienceSourceStatus').innerHTML = experience
      ? `<strong>Unified Stage · Twitch Experiences:</strong> <span class="copyable-value"><code data-sensitive>${escapeHtml(unifiedVisualUrl('twitchExperiences', experience.url))}</code>${copyButton(unifiedVisualUrl('twitchExperiences', experience.url), 'Unified Stage Browser Source URL')}</span> · ${experience.connectedClients ? `${experience.connectedClients} connected` : 'waiting for Broadcast'}`
      : '<strong>Browser Source:</strong> Studio is preparing the Twitch Experiences canvas.';
    const needsGoals = missingScopes.includes('channel:read:goals');
    const studioManagedGoal = configuration.goalSource === 'studio';
    $('#twitchExperienceAuthorizationNote').innerHTML = needsGoals && !studioManagedGoal
      ? '<strong>Reauthorization required:</strong> Disconnect and reconnect the broadcaster once to grant <code>channel:read:goals</code>. Raid Portal and existing features remain available.'
      : `<strong>EventSub:</strong> Raid Portal ${features.raidPortal ? 'ready' : 'waiting'} · Hype Train ${features.hypeTrain ? 'ready' : 'waiting'} · Goal ${studioManagedGoal ? 'managed by Studio' : features.goals ? 'ready' : 'waiting'}.`;
    $('#twitchExperienceHypeState').textContent = active.hypeTrain ? 'LIVE' : features.hypeTrain ? 'STANDBY' : 'WAITING';
    $('#twitchExperienceRaidState').textContent = active.raidPortal ? 'OPEN' : features.raidPortal ? 'STANDBY' : 'WAITING';
    $('#twitchExperienceGoalState').textContent = active.goalOverlay ? 'TRACKING' : studioManagedGoal ? 'READY' : features.goals ? 'STANDBY' : needsGoals ? 'REAUTHORIZE' : 'WAITING';
    const useStoredSettings = settings && !twitchExperienceSettingsDirty;
    if (useStoredSettings && experience) {
      $('#twitchExperienceEnabled').checked = configuration.enabled !== false;
      $('#twitchExperienceHype').checked = configuration.hypeTrainEnabled !== false;
      $('#twitchExperienceRaid').checked = configuration.raidPortalEnabled !== false;
      $('#twitchExperienceGoal').checked = configuration.goalOverlayEnabled !== false;
      $('#twitchExperienceRaidDuration').value = Math.round((configuration.raidDurationMs || 12000) / 1000);
      $('#twitchExperienceHypeAccent').value = configuration.hypeAccent || '#FF4CCF';
      $('#twitchExperienceRaidAccent').value = configuration.raidAccent || '#54F2EB';
      $('#twitchExperienceGoalAccent').value = configuration.goalAccent || '#A7FF5C';
      $('#twitchExperienceGoalSource').value = configuration.goalSource || 'twitch';
      const studioGoal = configuration.studioGoal || {};
      $('#twitchExperienceGoalKind').value = studioGoal.kind || 'subscriptions';
      $('#twitchExperienceGoalTitle').value = studioGoal.title || 'Subscriber Goal';
      $('#twitchExperienceGoalCurrent').value = Number.isFinite(Number(studioGoal.currentAmount)) ? studioGoal.currentAmount : 0;
      $('#twitchExperienceGoalTarget').value = Number.isFinite(Number(studioGoal.targetAmount)) ? studioGoal.targetAmount : 25;
      $('#twitchExperienceGoalUnit').value = studioGoal.unit ?? 'subs';
      for (const [kind, meta] of Object.entries(twitchExperienceDesigners)) populateTwitchExperienceDesign(kind, configuration[meta.designKey]);
    }
    updateGoalEditorAvailability();
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

  function renderDualFormat() {
    const status = state.dualFormat;
    if (!status) return;
    const labels = {
      'broadcast-offline': 'BROADCAST OFFLINE',
      'update-required': 'UPDATE REQUIRED',
      'setup-required': 'SETUP REQUIRED',
      ready: 'READY', live: 'LIVE', error: 'NEEDS ATTENTION'
    };
    const stateLabel = labels[status.state] || String(status.state || 'checking').replaceAll('-', ' ').toUpperCase();
    $('#dualFormatBadge').textContent = stateLabel;
    $('#dualFormatBadge').classList.toggle('offline', !status.ready);
    $('#dualFormatStateMetric').textContent = status.streaming && status.ready ? 'LIVE' : status.ready ? 'READY' : status.enabled ? 'INCOMPLETE' : 'OFF';
    $('#dualFormatStateNote').textContent = status.streaming ? 'Broadcast is currently live' : status.connected ? 'Configured in Broadcast while off air' : 'Waiting for Broadcast';
    const horizontal = broadcastCanvasProfile();
    $('#dualFormatHorizontalMetric').textContent = horizontal ? `${horizontal.outputWidth} × ${horizontal.outputHeight}` : '—';
    const vertical = status.canvas;
    $('#dualFormatVerticalMetric').textContent = vertical?.outputWidth && vertical?.outputHeight ? `${vertical.outputWidth} × ${vertical.outputHeight}` : '—';
    $('#dualFormatEnhancedMetric').textContent = status.enhancedBroadcastingEnabled ? 'ON' : 'OFF';

    const detailById = {
      broadcast: status.connected ? 'Broadcast is reporting to Studio.' : 'Open Broadcast and connect its Studio Integration dock.',
      controller: status.controllerSupported && status.statusReported ? 'The production control contract is available.' : 'Install a Broadcast build with Dual Format control support.',
      'enhanced-broadcasting': status.enhancedBroadcastingEnabled ? 'Twitch multitrack output is enabled.' : 'Enhanced Broadcasting must be enabled in Broadcast.',
      'vertical-canvas': status.additionalCanvasSelected && vertical ? `${vertical.name || 'Vertical canvas'} · ${vertical.outputWidth} × ${vertical.outputHeight}.` : 'Select a 1080 × 1920 or 720 × 1280 additional canvas.',
      'scene-links': status.sceneLinksReady ? 'Primary scene changes will follow on the vertical canvas.' : 'Link the horizontal and vertical versions of on-air scenes.',
      audio: status.audioReady ? 'Program audio is available in both orientations.' : 'Confirm microphone and program audio reach the vertical output.',
      'browser-sources': status.browserSourcesReady ? 'Portrait-safe alert sources are present without duplicate audio.' : 'Add the visual-only vertical alert sources shown beside this checklist.'
    };
    const checks = Array.isArray(status.checks) ? status.checks : [];
    const checkList = $('#dualFormatChecks');
    checkList.classList.toggle('empty-state', !checks.length);
    checkList.innerHTML = checks.length ? checks.map((check) => `<div class="dual-format-check ${check.ready ? 'ready' : ''}"><i>${check.ready ? '✓' : '!'}</i><div><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(detailById[check.id] || '')}</small></div></div>`).join('') : 'Connect Tempest Broadcast to inspect Dual Format readiness.';

    const messages = {
      'broadcast-offline': 'Open Tempest Broadcast, then connect its Studio Integration dock.',
      'update-required': 'The connected Broadcast build reports ordinary output but not the Dual Format production contract.',
      'setup-required': 'Broadcast is connected. Complete the unchecked items before going live.',
      ready: 'Both Twitch orientations are configured and ready for an off-air verification.',
      live: 'Dual Format is live. Configuration controls remain locked until streaming stops.',
      error: status.lastError || 'Broadcast reported a Dual Format error.'
    };
    $('#dualFormatStatusMessage').textContent = messages[status.state] || 'Checking Broadcast Dual Format status.';
    $('#previewDualFormatButton').disabled = !status.connected || !status.previewSupported || !status.canvas;
    $('#refreshDualFormatButton').disabled = !status.connected;
    const verticalSources = state.visualAlerts?.vertical;
    const sourceList = $('#verticalAlertSources');
    sourceList.classList.toggle('empty-state', !verticalSources);
    sourceList.innerHTML = verticalSources ? `<span>VERTICAL-SAFE BROWSER SOURCES · VISUAL ONLY</span><div><small>Twitch Alerts</small><code>${escapeHtml(verticalSources.twitchUrl)}</code>${copyButton(verticalSources.twitchUrl, 'vertical Twitch Alert source')}</div><div><small>Interaction Alerts</small><code>${escapeHtml(verticalSources.interactionUrl)}</code>${copyButton(verticalSources.interactionUrl, 'vertical Interaction Alert source')}</div><p>These variants keep alerts above Twitch's mobile chat area and mute duplicate alert audio. Keep the horizontal Browser Sources as the only audio-producing copies.</p>` : 'Vertical-safe alert sources will appear when Studio is online.';
  }

  async function previewDualFormat() {
    try {
      await api('/v1/broadcast/dual-format/preview', { method: 'POST', body: {} });
      toast('Vertical preview requested in Broadcast.');
    } catch (error) { toast(error.message, true); }
  }

  async function refreshDualFormat() {
    try {
      await api('/v1/broadcast/dual-format/refresh', { method: 'POST', body: {} });
      toast('Broadcast status refresh requested.');
    } catch (error) { toast(error.message, true); }
  }

  function renderSimulcast() {
    const status = state.simulcast || { state: 'broadcast-offline', twitch: {}, kick: {}, checks: [] };
    const labels = {
      'broadcast-offline': 'BROADCAST OFFLINE', 'update-required': 'UPDATE REQUIRED',
      'setup-required': 'SETUP REQUIRED', ready: 'READY', live: 'LIVE',
      'degraded-live': 'DEGRADED LIVE', error: 'OUTPUT ERROR'
    };
    const badge = $('#simulcastBadge');
    badge.textContent = labels[status.state] || 'CHECKING';
    badge.className = `status-badge ${status.state === 'live' ? 'online' : status.state === 'ready' ? 'armed' : status.state === 'degraded-live' || status.state === 'error' ? 'stopped' : 'offline'}`;
    $('#simulcastTwitchMetric').textContent = String(status.twitch?.state || 'offline').toUpperCase();
    $('#simulcastKickMetric').textContent = String(status.kick?.state || 'offline').toUpperCase();
    const capacity = Number(status.uploadCapacityKbps || 0);
    const required = Number(status.estimatedRequiredKbps || 0);
    $('#simulcastUploadMetric').textContent = capacity ? `${Math.round(capacity / 100) / 10} Mbps` : 'NOT SET';
    $('#simulcastUploadNote').textContent = required ? `Estimated ${Math.round(required / 100) / 10} Mbps · 20% reserve required` : 'Set measured sustained capacity';
    $('#simulcastRecordingMetric').textContent = status.recording ? 'RECORDING' : status.recordingWithStream ? 'ARMED' : 'OFF';
    const telemetry = (name, output) => `<div><b>${name}</b><strong>${(Number(output?.bytesSent || 0) / 1048576).toFixed(1)} MB</strong><small>${Number(output?.droppedFrames || 0).toLocaleString()} dropped / ${Number(output?.totalFrames || 0).toLocaleString()} · ${Math.round(Number(output?.congestion || 0) * 100)}% congestion</small></div>`;
    $('#simulcastOutputTelemetry').innerHTML = telemetry('TWITCH', status.twitch) + telemetry('KICK', status.kick);

    const detailById = {
      broadcast: status.connected ? 'Broadcast is reporting destination health.' : 'Open Broadcast and connect its Studio Integration dock.',
      controller: status.controllerSupported && status.statusReported ? 'Coordinated output control is available.' : 'Install a Broadcast build with production simulcast support.',
      twitch: status.twitchServiceReady ? 'The primary output is configured for Twitch.' : 'Select Twitch as the primary streaming service in Broadcast.',
      'dual-format': status.dualFormatReady ? 'Twitch horizontal and vertical routes are prepared.' : 'Complete the Dual Format readiness checklist first.',
      'kick-server': status.kickServerConfigured ? 'A Kick RTMP/RTMPS ingest destination is stored in Broadcast.' : 'Paste the ingest URL from the Kick creator dashboard.',
      'kick-key': status.credentialsStored && status.secureStorageAvailable ? 'The key is protected with Windows user encryption.' : 'Enter the Kick stream key so Broadcast can encrypt it.',
      upload: !status.uploadCapacityConfigured ? 'Enter measured sustained upload capacity before Go Live.' : status.uploadHeadroomReady ? 'The configured budget keeps at least 20% headroom.' : 'Measured upload capacity is below the estimated output budget plus reserve.',
      preflight: status.preflightReady ? `Passed ${new Date(status.lastPreflightAt).toLocaleString()}; valid for four hours.` : status.lastPreflightError || 'Run the local preflight after configuration changes or a Broadcast restart.'
    };
    const checks = Array.isArray(status.checks) ? status.checks : [];
    const checkList = $('#simulcastChecks');
    checkList.classList.toggle('empty-state', !checks.length);
    checkList.innerHTML = checks.length ? checks.map((check) => `<div class="dual-format-check ${check.ready ? 'ready' : ''}"><i>${check.ready ? '✓' : '!'}</i><div><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(detailById[check.id] || '')}</small></div></div>`).join('') : 'Connect Tempest Broadcast to inspect output readiness.';
    const messages = {
      'broadcast-offline': 'Open Tempest Broadcast and connect the Studio Integration dock.',
      'update-required': 'The connected Broadcast build does not yet provide the production simulcast controller.',
      'setup-required': 'Complete the unchecked items. No output can start until the full preflight passes.',
      ready: 'Twitch Dual Format and Kick are ready for coordinated Go Live.',
      live: 'Twitch and Kick are live. Monitor both destination health indicators.',
      'degraded-live': 'One destination is live without the other. Check the error and use the independent stop controls if needed.',
      error: status.lastError || 'Broadcast reported an output error.'
    };
    $('#simulcastStatusMessage').textContent = status.lastError && status.state !== 'live' ? status.lastError : messages[status.state] || 'Checking output status.';
    const live = status.twitch?.active || status.kick?.active;
    const transitioning = ['starting', 'stopping', 'reconnecting'].includes(status.twitch?.state) || ['starting', 'stopping', 'reconnecting'].includes(status.kick?.state);
    const manualChecks = [...document.querySelectorAll('.simulcast-manual-check')];
    const completedChecks = manualChecks.filter((input) => input.checked).length;
    const operatorReady = manualChecks.length > 0 && completedChecks === manualChecks.length;
    $('#simulcastChecklistStatus').textContent = !status.preflightReady
      ? 'Run and pass the automatic preflight, then complete all operator checks.'
      : operatorReady ? `Automatic preflight passed ${new Date(status.lastPreflightAt).toLocaleTimeString()}. Operator sign-off is complete for this Studio session.`
        : `Automatic preflight passed. Complete ${manualChecks.length - completedChecks} remaining operator check${manualChecks.length - completedChecks === 1 ? '' : 's'}.`;
    $('#runSimulcastPreflightButton').disabled = !status.connected || !status.controllerSupported || live || transitioning || !status.configured;
    $('#startSimulcastButton').disabled = !status.ready || !operatorReady || live || transitioning;
    $('#retryKickOutputButton').disabled = !status.twitch?.active || status.kick?.active || ['starting', 'stopping', 'reconnecting'].includes(status.kick?.state);
    $('#stopKickOutputButton').disabled = !status.kick?.active;
    $('#stopAllOutputsButton').disabled = !live && !status.recording && !transitioning;
    updateSimulcastOperations(status);
  }

  async function startSimulcast() {
    const operatorChecklistAccepted = [...document.querySelectorAll('.simulcast-manual-check')].every((input) => input.checked);
    if (!operatorChecklistAccepted) return toast('Complete every operator rehearsal check before going live.', true);
    if (!confirm('Go live now on Twitch (horizontal + vertical) and Kick (horizontal)?')) return;
    try {
      await api('/v1/broadcast/simulcast/start', { method: 'POST', body: { operatorChecklistAccepted } });
      toast('Coordinated Go Live sent to Broadcast. Twitch will connect before Kick.');
      await refreshRuntime();
    } catch (error) { toast(error.message, true); }
  }

  async function runSimulcastPreflight() {
    try {
      await api('/v1/broadcast/simulcast/preflight', { method: 'POST', body: {} });
      toast('Production preflight requested. Waiting for Broadcast results…');
      setTimeout(() => { void refreshRuntime({ quiet: false }); }, 400);
    } catch (error) { toast(error.message, true); }
  }

  async function retryKickOutput() {
    try {
      await api('/v1/broadcast/simulcast/retry-kick', { method: 'POST', body: {} });
      toast('Kick recovery requested. Twitch remains live.');
      await refreshRuntime();
    } catch (error) { toast(error.message, true); }
  }

  function saveSimulcastChecklist() {
    const selected = [...document.querySelectorAll('.simulcast-manual-check')].filter((input) => input.checked).map((input) => input.value);
    sessionStorage.setItem(simulcastChecklistStorageKey, JSON.stringify(selected));
    renderSimulcast();
  }

  function restoreSimulcastChecklist() {
    let selected = [];
    try { selected = JSON.parse(sessionStorage.getItem(simulcastChecklistStorageKey) || '[]'); } catch { selected = []; }
    if (!Array.isArray(selected)) selected = [];
    document.querySelectorAll('.simulcast-manual-check').forEach((input) => { input.checked = selected.includes(input.value); });
  }

  async function stopSimulcast(scope, force = false) {
    const prompt = scope === 'kick' ? 'Stop only the Kick output and leave Twitch live?' : 'Emergency stop Twitch, Kick, and any recording started by this controller?';
    if (!confirm(prompt)) return;
    try {
      await api('/v1/broadcast/simulcast/stop', { method: 'POST', body: { scope, force } });
      toast(scope === 'kick' ? 'Kick stop requested. Twitch remains live.' : 'Emergency stop sent to all coordinated outputs.');
      await refreshRuntime();
    } catch (error) { toast(error.message, true); }
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

  function renderVTubeStudio() {
    const status = state.vtubeStudio;
    if (!status) return;
    const connected = status.vtubeStudio === 'connected';
    const authorized = status.authorization === 'authorized';
    const badge = $('#vtubeStudioBadge');
    badge.textContent = authorized ? 'AUTHORIZED' : connected ? 'APPROVAL NEEDED' : 'VTS OFFLINE';
    badge.classList.toggle('offline', !authorized);
    $('#vtubeStudioModel').textContent = status.modelLoaded ? status.modelName || 'Loaded model' : connected ? 'No model loaded' : 'Not connected';
    $('#vtubeStudioHotkeyCount').textContent = `${status.hotkeys?.length || status.hotkeyCount || 0} available`;
    $('#vtubeStudioStatusMessage').textContent = status.lastError || (authorized
      ? 'Ready. Choose any loaded-model hotkey on an Interaction Alert.'
      : connected ? 'Click Authorize, then approve Tempest Studio once in VTube Studio.'
        : 'Open VTube Studio and enable Allow Plugin API access. Studio reconnects automatically.');
    $('#authorizeVTubeStudio').hidden = authorized;
    $('#authorizeVTubeStudio').disabled = !connected || status.authorization === 'pending' || status.credentialStorage === 'unavailable';
    $('#refreshVTubeStudioHotkeys').disabled = !authorized;
    $('#forgetVTubeStudio').hidden = !authorized;
  }

  async function saveWarudoReceiver() {
    try {
      const result = await window.tempestStudio.saveWarudoReceiver();
      if (result) toast('Warudo receiver saved. Copy it into the Warudo Playground folder.');
    } catch (error) { toast(error.message, true); }
  }

  async function authorizeVTubeStudio() {
    try {
      state.vtubeStudio = { ...(state.vtubeStudio || {}), authorization: 'pending' };
      renderVTubeStudio();
      state.vtubeStudio = await window.tempestStudio.authorizeVTubeStudio();
      renderVTubeStudio();
      renderSoundAlerts();
      toast('VTube Studio authorized. Its model hotkeys are ready to assign.');
    } catch (error) {
      state.vtubeStudio = await window.tempestStudio.getVTubeStudioStatus().catch(() => state.vtubeStudio);
      renderVTubeStudio();
      toast(error.message, true);
    }
  }

  async function refreshVTubeStudioHotkeys() {
    try {
      state.vtubeStudio = await window.tempestStudio.refreshVTubeStudioHotkeys();
      renderVTubeStudio();
      renderSoundAlerts();
      toast(`${state.vtubeStudio.hotkeys?.length || 0} VTube Studio hotkeys loaded.`);
    } catch (error) { toast(error.message, true); }
  }

  async function forgetVTubeStudio() {
    try {
      state.vtubeStudio = await window.tempestStudio.forgetVTubeStudio();
      renderVTubeStudio();
      renderSoundAlerts();
      toast('Saved VTube Studio authorization removed from this computer.');
    } catch (error) { toast(error.message, true); }
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
    if (document.activeElement !== $('#twitchClientId')) $('#twitchClientId').value = twitch.clientIdMode === 'custom' ? twitch.clientId || '' : '';
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
      ? state.privacy.streamerMode ? `Broadcaster authorized. Extension relay: ${label(twitch.connections?.extensionRelay)}.` : `Authorized as @${account?.login || 'Twitch user'}. Extension relay: ${label(twitch.connections?.extensionRelay)}.`
      : oauthState === 'authorization-pending' ? 'Waiting for authorization on Twitch…'
        : twitch.configured ? `Ready to connect using the ${twitch.clientIdMode === 'custom' ? 'custom' : 'official Tempest'} Twitch application.`
          : 'Twitch sign-in is unavailable. Update or reinstall Tempest Streaming Studio.');
    const topics = twitch.normalizedTopics || [];
    const directory = $('#twitchTopicDirectory');
    directory.classList.toggle('empty-state', !topics.length);
    directory.innerHTML = topics.length ? topics.map((topic) => `<code>${escapeHtml(topic)}</code>`).join('') : 'No topics advertised.';
    renderHostedExtension();
    renderLocalExtension();
    renderStreamTogether();
  }

  function renderStreamTogether() {
    const status = state.streamTogether || { open: false };
    const login = state.twitch?.oauth?.account?.login;
    const authorized = state.twitch?.oauth?.state === 'authorized' && Boolean(login);
    $('#streamTogetherCallBadge').textContent = status.open ? 'CALL WINDOW OPEN' : 'CLOSED';
    $('#streamTogetherCallBadge').classList.toggle('offline', !status.open);
    $('#streamTogetherPageBadge').textContent = status.open ? 'CALL WINDOW OPEN' : 'CALL CLOSED';
    $('#streamTogetherPageBadge').classList.toggle('offline', !status.open);
    $('#streamTogetherCallTitle').textContent = status.open
      ? `Stream Together is open for @${status.login || login}`
      : authorized ? `Ready to open for @${login}` : 'Connect the broadcaster Twitch account';
    $('#streamTogetherCallDetail').textContent = status.open
      ? 'The dedicated call window remains active in Studio with Twitch-only camera and microphone access. Unified Chat continues independently in Chatbot.'
      : authorized
        ? 'Open Twitch Backstage in Studio. The separate call session remembers its Twitch sign-in without exposing those cookies to the Studio control interface.'
        : 'Connect the broadcaster account in Twitch Setup first. Stream Together uses a separate persistent Twitch web session for the call itself.';
    $('#openStreamTogetherCall').disabled = !authorized;
    $('#closeStreamTogetherCall').disabled = !status.open;
  }

  async function openStreamTogetherCall() {
    const login = state.twitch?.oauth?.account?.login;
    if (!login) return toast('Connect the broadcaster Twitch account before opening Stream Together.', true);
    try {
      state.streamTogether = await window.tempestStudio.openStreamTogether(login);
      renderStreamTogether();
      toast('Stream Together opened in its dedicated Studio call window.');
    } catch (error) { toast(error.message, true); }
  }

  async function closeStreamTogetherCall() {
    try {
      state.streamTogether = await window.tempestStudio.closeStreamTogether();
      renderStreamTogether();
      toast('Stream Together call window closed.');
    } catch (error) { toast(error.message, true); }
  }

  function renderTwitchPrediction() {
    const predictionState = state.twitch?.predictions || { authorized: false, available: false };
    const prediction = predictionState.current;
    const open = prediction?.status === 'ACTIVE' || prediction?.status === 'LOCKED';
    const missingScope = (state.twitch?.oauth?.missingScopes || []).includes('channel:manage:predictions');
    const badge = $('#twitchPredictionBadge');
    badge.textContent = prediction ? prediction.status : predictionState.available ? 'READY' : missingScope ? 'RECONNECT TWITCH' : 'SETUP REQUIRED';
    badge.classList.toggle('offline', !open);
    $('#twitchPredictionTitleLive').textContent = prediction?.title || 'No active prediction';
    const outcomes = prediction?.outcomes || [];
    const totalPoints = outcomes.reduce((total, outcome) => total + Number(outcome.channelPoints || 0), 0);
    const results = $('#twitchPredictionResults');
    results.classList.toggle('empty-state', !outcomes.length);
    results.innerHTML = outcomes.length ? outcomes.map((outcome) => {
      const percentage = totalPoints ? Math.round((Number(outcome.channelPoints || 0) / totalPoints) * 100) : 0;
      const winner = prediction.winningOutcomeId === outcome.id;
      const canResolve = open && predictionState.available;
      return `<article class="chatbot-poll-result ${winner ? 'winner' : ''}"><div><strong>${escapeHtml(outcome.title)}${winner ? ' · WINNER' : ''}</strong><span>${Number(outcome.channelPoints || 0).toLocaleString()} points · ${Number(outcome.users || 0).toLocaleString()} viewer${Number(outcome.users || 0) === 1 ? '' : 's'}</span></div><i><b style="width:${percentage}%"></b></i>${canResolve ? `<button class="secondary-button" type="button" data-twitch-prediction-winner="${escapeHtml(outcome.id)}">Resolve winner</button>` : ''}</article>`;
    }).join('') : 'No Twitch Prediction has been loaded.';
    $('#twitchPredictionStatus').textContent = missingScope
      ? 'Reconnect the broadcaster in Twitch Setup once to grant Studio the new Prediction permission.'
      : !predictionState.available ? 'Connect the broadcaster Twitch account to manage Channel Point Predictions.'
        : prediction?.status === 'ACTIVE' ? `Wagering is open${prediction.predictionWindow ? ` for ${prediction.predictionWindow} seconds` : ''}. Lock it early or resolve the winner when the result is known.`
          : prediction?.status === 'LOCKED' ? 'Wagering is locked. Select the winning outcome to pay viewers.'
            : prediction?.status === 'RESOLVED' ? 'Twitch resolved the Prediction and distributed Channel Point winnings.'
              : prediction?.status === 'CANCELED' ? 'The Prediction was canceled and Twitch refunded all wagers.'
                : 'Ready to start an official Twitch Channel Point Prediction.';
    $('#startTwitchPrediction').disabled = !predictionState.available || open;
    $('#refreshTwitchPrediction').disabled = !predictionState.available;
    $('#lockTwitchPrediction').disabled = !predictionState.available || prediction?.status !== 'ACTIVE';
    $('#cancelTwitchPrediction').disabled = !predictionState.available || !open;
  }

  function renderChatbot() {
    const chatbot = state.chatbot;
    if (!chatbot) return;
    const label = (value) => String(value || 'unknown').replaceAll('-', ' ').toUpperCase();
    const authorized = chatbot.oauth?.state === 'authorized';
    const connected = chatbot.connections?.eventSub === 'connected' && chatbot.connections?.chat === 'connected';
    const kickConnected = state.kick?.oauth?.state === 'authorized' && state.kick?.events?.state === 'connected';
    const account = chatbot.oauth?.account;
    renderStreamTogether();
    const botName = chatbot.botName || account?.login || 'Chat Bot';
    $('#chatbotOverallBadge').textContent = connected && kickConnected ? 'TWITCH + KICK LIVE' : connected ? 'TWITCH LIVE' : kickConnected ? 'KICK LIVE' : authorized ? 'WAITING FOR CHAT' : 'NOT CONNECTED';
    $('#chatbotOverallBadge').classList.toggle('offline', !connected && !kickConnected);
    $('#liveDeskSetupBadge').textContent = connected ? 'READY' : authorized ? 'CONNECTING' : 'SETUP REQUIRED';
    $('#liveDeskSetupBadge').classList.toggle('offline', !connected);
    $('#chatbotIdentityMetric').textContent = botName.toUpperCase();
    $('#chatbotEventSubMetric').textContent = label(chatbot.connections?.eventSub);
    $('#chatbotChatMetric').textContent = label(chatbot.connections?.chat);
    $('#chatbotCommandCount').textContent = (chatbot.commands || []).length;
    $('#chatbotCommandCountNote').textContent = `${(chatbot.commands || []).filter((command) => command.enabled).length} enabled`;
    $('#chatbotTriggerCount').textContent = chatbot.commandsTriggered || 0;
    $('#chatbotLastMessage').textContent = chatbot.lastMessageAt ? `Last message ${new Date(chatbot.lastMessageAt).toLocaleTimeString()}` : 'No messages received';
    const sharedChat = chatbot.sharedChat || { state: 'inactive', participants: [] };
    const sharedChatActive = sharedChat.state === 'active';
    $('#sharedChatBadge').textContent = !connected && !kickConnected ? 'NOT CONNECTED' : sharedChatActive ? 'TWITCH COLLAB LIVE' : connected && kickConnected ? 'TWITCH + KICK LIVE' : connected ? 'TWITCH LIVE' : 'KICK LIVE';
    $('#sharedChatBadge').classList.toggle('offline', !connected && !kickConnected);
    $('#sharedChatSessionTitle').textContent = !connected ? 'Connect the chatbot' : sharedChatActive
      ? `${sharedChat.participants?.length || 0} participating channel${sharedChat.participants?.length === 1 ? '' : 's'}`
      : sharedChat.state === 'unavailable' ? 'Stream Together chat unavailable' : 'Home Twitch chat';
    $('#sharedChatSessionDetail').textContent = sharedChat.lastError || (sharedChatActive
      ? `${sharedChat.host?.login ? `Hosted by @${sharedChat.host.login}. ` : ''}Studio is monitoring the complete Stream Together chat without a separate browser window.`
      : connected ? 'Unified Chat is monitoring your Twitch home channel and will detect Stream Together automatically.' : 'Studio will detect Stream Together chat automatically after Twitch EventSub connects.');
    const participants = sharedChat.participants || [];
    const participantList = $('#sharedChatParticipants');
    participantList.classList.toggle('empty-state', !participants.length);
    participantList.innerHTML = participants.length ? participants.map((participant) => `<span class="shared-chat-participant ${participant.host ? 'host' : ''}"><i></i>${participant.host ? 'HOST · ' : ''}@${escapeHtml(participant.login || participant.displayName || participant.userId)}</span>`).join('') : (sharedChatActive ? 'Participant identities are loading…' : 'No active Stream Together session.');
    const liveMessages = (chatbot.messages || []).slice(-100);
    const messageList = $('#sharedChatMessages');
    const messageSignature = liveMessages.map((message) => message.id).join('|');
    if (messageList.dataset.signature !== messageSignature) {
      const stayAtBottom = !messageList.dataset.signature || messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 48;
      messageList.dataset.signature = messageSignature;
      messageList.classList.toggle('empty-state', !liveMessages.length);
      messageList.innerHTML = liveMessages.length ? liveMessages.map((message) => {
        const platform = message.platform === 'kick' ? 'KICK' : 'TWITCH';
        const origin = message.platform === 'kick' ? `@${message.sourceChannelLogin || state.kick?.oauth?.account?.username || 'kick'}` : message.sharedChat ? `@${message.sourceChannelLogin || message.sourceChannelDisplayName || 'collaborator'}` : `@${chatbot.channel?.login || 'home'}`;
        return `<article class="shared-chat-message ${message.sharedChat ? 'shared' : ''} ${message.platform === 'kick' ? 'kick' : ''}"><strong>${escapeHtml(message.viewerName || message.viewerLogin || 'Viewer')}</strong><p>${escapeHtml(message.text)}</p><small><span class="origin">${platform} · ${escapeHtml(origin)}</span> · ${new Date(message.occurredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></article>`;
      }).join('') : 'Chat messages will appear here while Studio is connected.';
      if (stayAtBottom) messageList.scrollTop = messageList.scrollHeight;
    }
    const selectedPlatform = $('#sharedChatPlatform').value;
    const selectedPlatformConnected = selectedPlatform === 'kick' ? kickConnected : connected;
    $('#sharedChatPlatform').querySelector('[value="twitch"]').disabled = !connected;
    $('#sharedChatPlatform').querySelector('[value="kick"]').disabled = !kickConnected;
    if (!selectedPlatformConnected && (connected || kickConnected)) $('#sharedChatPlatform').value = connected ? 'twitch' : 'kick';
    $('#sharedChatMessage').disabled = !connected && !kickConnected;
    $('#sendSharedChatMessage').disabled = !connected && !kickConnected;
    $('#clearSharedChatMessages').disabled = !liveMessages.length;
    const poll = chatbot.poll || { state: 'idle', options: [], totalVotes: 0 };
    const pollActive = poll.state === 'active';
    $('#chatbotPollBadge').textContent = pollActive ? `${poll.totalVotes || 0} VOTE${poll.totalVotes === 1 ? '' : 'S'}` : poll.state === 'closed' ? 'VOTING ENDED' : 'IDLE';
    $('#chatbotPollBadge').classList.toggle('offline', !pollActive);
    if (poll.state !== 'idle' && !$('#chatbotPollForm').contains(document.activeElement)) {
      $('#chatbotPollQuestion').value = poll.question || '';
      $('#chatbotPollOptions').value = (poll.options || []).map((option) => option.label).join('\n');
    }
    const pollResults = $('#chatbotPollResults');
    pollResults.classList.toggle('empty-state', !(poll.options || []).length);
    pollResults.innerHTML = (poll.options || []).length ? poll.options.map((option) => `<article class="chatbot-poll-result"><div><strong>${option.number}. ${escapeHtml(option.label)}</strong><span>${Number(option.votes || 0).toLocaleString()} · ${Number(option.percentage || 0).toLocaleString()}%</span></div><i><b style="width:${Math.max(0, Math.min(100, Number(option.percentage || 0)))}%"></b></i></article>`).join('') : 'No poll is active.';
    $('#chatbotPollStatus').textContent = pollActive
      ? `Voting is open. ${poll.totalVotes || 0} unique ${poll.totalVotes === 1 ? 'account has' : 'accounts have'} voted; each account's first valid number is final.`
      : poll.state === 'closed' ? `Voting ended with ${poll.totalVotes || 0} unique vote${poll.totalVotes === 1 ? '' : 's'}. Results remain until cleared or replaced.` : 'Start a poll when chat is ready.';
    $('#startChatbotPoll').disabled = pollActive;
    $('#stopChatbotPoll').disabled = !pollActive;
    $('#clearChatbotPoll').disabled = poll.state === 'idle';
    $('#chatbotPollOverlayUrl').textContent = state.unifiedStage?.url || (state.config?.baseUrl ? `${state.config.baseUrl}/unified-stage?orientation=horizontal` : 'Starting Studio…');
    renderTwitchPrediction();
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
    const autoMessages = chatbot.autoMessages || { enabled: false, messages: [], intervalMinutes: 20, chatMessageThreshold: 30, platforms: ['twitch'], messagesSinceLast: 0, sent: 0 };
    if (!$('#chatbotAutoMessagesForm').contains(document.activeElement)) {
      $('#chatbotAutoMessagesEnabled').checked = autoMessages.enabled === true;
      $('#chatbotAutoMessages').value = (autoMessages.messages || []).join('\n');
      $('#chatbotAutoMessageInterval').value = String(autoMessages.intervalMinutes ?? 20);
      $('#chatbotAutoMessageThreshold').value = String(autoMessages.chatMessageThreshold ?? 30);
      $('#chatbotAutoMessagesTwitch').checked = (autoMessages.platforms || []).includes('twitch');
      $('#chatbotAutoMessagesKick').checked = (autoMessages.platforms || []).includes('kick');
    }
    $('#chatbotAutoMessagesBadge').textContent = autoMessages.enabled ? `${autoMessages.sent || 0} SENT` : 'OFF';
    $('#chatbotAutoMessagesBadge').classList.toggle('offline', !autoMessages.enabled);
    const remainingMessages = autoMessages.chatMessageThreshold > 0 ? Math.max(0, autoMessages.chatMessageThreshold - (autoMessages.messagesSinceLast || 0)) : null;
    const remainingMinutes = autoMessages.intervalMinutes > 0 && autoMessages.nextTimeAt ? Math.max(0, Math.ceil((Date.parse(autoMessages.nextTimeAt) - Date.now()) / 60_000)) : null;
    const autoMessageDestinations = (autoMessages.platforms || []).map((platform) => platform === 'kick' ? 'Kick' : 'Twitch').join(' + ');
    $('#chatbotAutoMessagesStatus').textContent = !autoMessages.enabled
      ? 'Auto Messages are off.'
      : `Next rotating message goes to ${autoMessageDestinations || 'no platform'} after ${remainingMinutes === null ? 'the time trigger is disabled' : `${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}`} or ${remainingMessages === null ? 'the chat trigger is disabled' : `${remainingMessages} more viewer message${remainingMessages === 1 ? '' : 's'}`}, whichever happens first.`;
    const raidAutomation = chatbot.raidAutomation || {};
    if (!$('#chatbotRaidAutomationForm').contains(document.activeElement)) {
      $('#chatbotRaidWelcomeEnabled').checked = raidAutomation.welcomeEnabled === true;
      $('#chatbotRaidWelcomeMessage').value = raidAutomation.welcomeMessage || '';
      $('#chatbotRaidShoutoutEnabled').checked = raidAutomation.shoutoutEnabled === true;
    }
    const shoutoutReady = authorized && raidAutomation.shoutoutAuthorized === true;
    const raidEnabled = raidAutomation.welcomeEnabled || raidAutomation.shoutoutEnabled;
    $('#chatbotRaidBadge').textContent = !raidEnabled ? 'OFF' : !raidAutomation.shoutoutEnabled ? 'WELCOME READY' : shoutoutReady ? (raidAutomation.queuedShoutouts ? `${raidAutomation.queuedShoutouts} QUEUED` : 'READY') : 'REAUTHORIZE BOT';
    $('#chatbotRaidBadge').classList.toggle('offline', !raidEnabled || (raidAutomation.shoutoutEnabled && !shoutoutReady));
    $('#chatbotRaidShoutoutStatus').textContent = shoutoutReady
      ? `Shoutout permission is authorized for @${account?.login || 'the bot'}. That account must also be a moderator in @${chatbot.channel?.login || 'your channel'}.`
      : authorized
        ? `Reconnect @${account?.login || 'the bot'} to add moderator:manage:shoutouts, then make that account a moderator in your channel.`
        : 'Connect the secondary bot account, then make it a moderator in your channel for official shoutouts.';
    const firstChatShoutouts = chatbot.firstChatShoutouts || { enabled: false, channels: [] };
    const interactionAccess = chatbot.interactionAccess || { mode: 'everyone', allowBroadcasterAndModerators: true, assignedCreators: 0, resolvedCreators: 0 };
    if (!$('#chatbotFirstChatShoutoutForm').contains(document.activeElement)) {
      $('#chatbotFirstChatEnabled').checked = firstChatShoutouts.enabled === true;
      $('#chatbotFirstChatChannels').value = (firstChatShoutouts.channels || []).join('\n');
      $('#chatbotInteractionAccessMode').value = interactionAccess.mode || 'everyone';
      $('#chatbotInteractionAllowStaff').checked = interactionAccess.allowBroadcasterAndModerators !== false;
    }
    const assignedCount = (firstChatShoutouts.channels || []).length;
    const restrictedInteractions = interactionAccess.mode === 'assigned-creators';
    const resolvedCreators = Number(interactionAccess.resolvedCreators || 0);
    $('#chatbotFirstChatCount').textContent = `${assignedCount} ASSIGNED`;
    $('#chatbotFirstChatBadge').textContent = restrictedInteractions ? (!assignedCount ? 'ADD CREATORS' : `${resolvedCreators}/${assignedCount} VERIFIED`) : firstChatShoutouts.enabled ? (shoutoutReady ? 'SHOUTOUTS READY' : 'REAUTHORIZE BOT') : 'OPEN ACCESS';
    $('#chatbotFirstChatBadge').classList.toggle('offline', (restrictedInteractions && (!assignedCount || resolvedCreators < assignedCount)) || (firstChatShoutouts.enabled && !shoutoutReady));
    const accessSummary = restrictedInteractions
      ? !assignedCount ? 'Add at least one assigned Twitch creator before restricting interactions.'
        : `${resolvedCreators} of ${assignedCount} assigned ${assignedCount === 1 ? 'creator has' : 'creators have'} a verified Twitch identity. Only verified assigned creators${interactionAccess.allowBroadcasterAndModerators !== false ? ', the broadcaster, and moderators' : ''} can trigger panel interactions.`
      : 'Everyone can currently use enabled panel interactions.';
    const shoutoutSummary = !firstChatShoutouts.enabled ? ' First-chat shoutouts are off.'
      : shoutoutReady ? ` First-chat shoutouts are ready; ${firstChatShoutouts.handledSessions || 0} stream ${firstChatShoutouts.handledSessions === 1 ? 'session is' : 'sessions are'} tracked.`
        : ' Reconnect the moderator bot with shoutout permission to use first-chat shoutouts.';
    $('#chatbotFirstChatStatus').textContent = accessSummary + shoutoutSummary;
    const autoMod = chatbot.autoMod || { enabled: false, allowedDomains: [], blockedTerms: [], exemptRoles: [] };
    if (!$('#chatbotAutoModForm').contains(document.activeElement)) {
      $('#chatbotAutoModEnabled').checked = autoMod.enabled === true;
      $('#chatbotAutoModLinks').checked = autoMod.linkProtectionEnabled !== false;
      $('#chatbotAutoModDomains').value = (autoMod.allowedDomains || []).join('\n');
      $('#chatbotAutoModTermsEnabled').checked = autoMod.blockedTermsEnabled === true;
      $('#chatbotAutoModTerms').value = (autoMod.blockedTerms || []).join('\n');
      $('#chatbotAutoModCaps').checked = autoMod.capsProtectionEnabled === true;
      $('#chatbotAutoModCapsMinimum').value = autoMod.capsMinimumLetters || 12;
      $('#chatbotAutoModCapsPercentage').value = autoMod.capsPercentage || 75;
      $('#chatbotAutoModRepetition').checked = autoMod.repetitionProtectionEnabled !== false;
      $('#chatbotAutoModRepetitionLimit').value = autoMod.repetitionLimit || 8;
      $('#chatbotAutoModAction').value = autoMod.action || 'delete';
      $('#chatbotAutoModTimeout').value = autoMod.timeoutSeconds || 60;
      $('#chatbotAutoModExemptBroadcaster').checked = (autoMod.exemptRoles || []).includes('broadcaster');
      $('#chatbotAutoModExemptModerator').checked = (autoMod.exemptRoles || []).includes('moderator');
      $('#chatbotAutoModExemptVip').checked = (autoMod.exemptRoles || []).includes('vip');
      $('#chatbotAutoModNotice').checked = autoMod.postNotice !== false;
      $('#chatbotAutoModNoticeMessage').value = autoMod.noticeMessage || '@{user}, that message was removed by channel AutoMod ({reason}).';
    }
    const autoModAuthorized = autoMod.action === 'timeout' ? autoMod.timeoutAuthorized === true : autoMod.deleteAuthorized === true;
    $('#chatbotAutoModBadge').textContent = !autoMod.enabled ? 'OFF' : autoModAuthorized ? `${autoMod.actionsTaken || 0} ACTIONS` : 'REAUTHORIZE BOT';
    $('#chatbotAutoModBadge').classList.toggle('offline', !autoMod.enabled || !autoModAuthorized);
    $('#chatbotAutoModTimeoutControl').hidden = $('#chatbotAutoModAction').value !== 'timeout';
    $('#chatbotAutoModPermissionStatus').textContent = !authorized
      ? 'Connect the secondary bot account and make it a moderator in your channel.'
      : autoMod.action === 'timeout' && !autoMod.timeoutAuthorized
        ? 'Reconnect the bot to grant moderator:manage:banned_users for timeouts.'
        : autoMod.action !== 'timeout' && !autoMod.deleteAuthorized
          ? 'Reconnect the bot to grant moderator:manage:chat_messages for message deletion.'
          : `Moderation permission is authorized. The bot must remain a moderator in @${chatbot.channel?.login || 'your channel'}.`;
    if (document.activeElement !== $('#chatbotPrefix')) $('#chatbotPrefix').value = chatbot.prefix || '!';
    $('#chatbotPrefixLabel').textContent = chatbot.prefix || '!';
    const weather = chatbot.providers?.weather;
    const nowPlaying = chatbot.providers?.nowPlaying;
    if (!$('#chatbotProvidersForm').contains(document.activeElement)) {
      $('#weatherProviderEnabled').checked = Boolean(weather);
      $('#nowPlayingProviderEnabled').checked = Boolean(nowPlaying);
      for (const [id, value] of [
        ['weatherLocationName', weather?.locationName || ''], ['weatherLatitude', weather?.latitude ?? ''], ['weatherLongitude', weather?.longitude ?? ''], ['weatherTimeZone', weather?.timeZone || ''],
        ['nowPlayingStationName', nowPlaying?.stationName || ''], ['nowPlayingApiUrl', nowPlaying?.apiUrl || ''], ['nowPlayingPublicUrl', nowPlaying?.publicPlayerUrl || ''], ['nowPlayingStreamUrl', nowPlaying?.streamUrl || '']
      ]) $(`#${id}`).value = value;
    }
    const handlerSelect = $('#chatbotCommandHandler');
    const handlers = chatbot.providers?.availableHandlers || [];
    const handlerSignature = handlers.join('|');
    if (handlerSelect.dataset.handlers !== handlerSignature) {
      const currentHandler = handlerSelect.value;
      const labels = { 'command-directory': 'Enabled command directory', 'stream-uptime': 'Current stream uptime', 'channel-title': 'Current Twitch title', 'channel-game': 'Current Twitch category', 'stream-schedule': 'Next scheduled stream', 'local-weather': 'Local time and weather — National Weather Service', 'radio-now-playing': 'Configured station — now playing', 'dice-roll': '3D Dice roll from command arguments' };
      handlerSelect.innerHTML = '<option value="">Custom chat response</option>' + handlers.map((handler) => `<option value="${escapeHtml(handler)}">${escapeHtml(labels[handler] || handler)}</option>`).join('');
      if ([...handlerSelect.options].some((option) => option.value === currentHandler)) handlerSelect.value = currentHandler;
      handlerSelect.dataset.handlers = handlerSignature;
    }

    const workflowSelect = $('#chatbotCommandWorkflow');
    const selectedWorkflow = workflowSelect.value;
    workflowSelect.innerHTML = '<option value="">No automation — chat response only</option>' + state.workflows.map((workflow) => `<option value="${escapeHtml(workflow.id)}">${escapeHtml(workflow.name)}${workflow.enabled ? '' : ' (disabled)'}</option>`).join('');
    if (state.workflows.some((workflow) => workflow.id === selectedWorkflow)) workflowSelect.value = selectedWorkflow;

    const commands = chatbot.commands || [];
    const list = $('#chatbotCommandList');
    list.classList.toggle('empty-state', !commands.length);
    list.innerHTML = commands.length ? commands.map((command) => `<button class="chatbot-command-row ${command.enabled ? '' : 'disabled'}" data-chatbot-command="${escapeHtml(command.id)}"><span><strong>${escapeHtml(chatbot.prefix || '!')}${escapeHtml(command.name)}</strong><small>${escapeHtml(command.permission)} · ${command.allowSharedChat ? 'Stream Together chat' : 'home chat only'} · viewer ${durationLabel(command.viewerCooldownMs)} · global ${durationLabel(command.globalCooldownMs)}</small></span><span>${command.handler === 'counter' ? `${escapeHtml(command.counterLabel || command.name).toUpperCase()} · ${Number(command.counterValue || 0).toLocaleString()}` : command.handler === 'twitch-clip' ? 'TWITCH CLIP' : command.handler === 'local-weather' || command.handler === 'seattle-weather' ? 'LOCAL WEATHER' : command.handler === 'radio-now-playing' ? 'NOW PLAYING' : command.handler === 'dice-roll' ? '3D DICE' : command.workflowId ? 'WORKFLOW' : 'REPLY'}${command.response && (command.workflowId || command.handler) ? ' + REPLY' : ''}</span></button>`).join('') : 'No chatbot commands configured.';

    const activity = chatbot.activity || [];
    const activityList = $('#chatbotActivity');
    activityList.classList.toggle('empty-state', !activity.length);
    activityList.innerHTML = activity.length ? activity.slice(0, 10).map((entry) => `<div class="compact-row event-${escapeHtml(entry.state === 'accepted' ? 'success' : entry.state === 'error' ? 'error' : 'warning')}"><div><strong>${escapeHtml(entry.message)}</strong><small>${new Date(entry.timestamp).toLocaleTimeString()}${entry.command ? ` · ${escapeHtml(chatbot.prefix || '!')}${escapeHtml(entry.command)}` : ''}${entry.sharedChat ? ` · via @${escapeHtml(entry.sourceChannelLogin || 'stream-together-collaborator')}` : ''}</small></div><i class="event-dot"></i></div>`).join('') : 'No chatbot activity recorded.';
    renderKick();
  }

  function renderKick() {
    const kick = state.kick;
    if (!kick || !$('#kickChatBadge')) return;
    const label = (value) => String(value || 'unknown').replaceAll('-', ' ').toUpperCase();
    const authorized = kick.oauth?.state === 'authorized';
    const eventsConnected = kick.events?.state === 'connected';
    $('#kickChatBadge').textContent = authorized && eventsConnected ? 'CHAT LIVE' : authorized ? 'AUTHORIZED' : kick.configured ? label(kick.oauth?.state) : 'NOT CONFIGURED';
    $('#kickChatBadge').classList.toggle('offline', !authorized || !eventsConnected);
    if (document.activeElement !== $('#kickClientId')) $('#kickClientId').value = kick.clientId || '';
    $('#kickClientSecret').placeholder = kick.configured ? 'Stored with Windows encryption — leave blank to keep' : 'Paste once; stored with Windows encryption';
    $('#kickRedirectUri').value = kick.redirectUri || '';
    $('#kickWebhookUrl').value = kick.webhookUrl || '';
    $('#copyKickRedirectUri').innerHTML = copyIcon;
    $('#copyKickWebhookUrl').innerHTML = copyIcon;
    $('#kickAccountState').textContent = kick.oauth?.account?.username ? `@${kick.oauth.account.username}` : '—';
    $('#kickOauthState').textContent = label(kick.oauth?.state);
    $('#kickEventState').textContent = label(kick.events?.state);
    $('#saveKickConfiguration').disabled = kick.oauth?.storage === 'unavailable';
    $('#connectKickButton').disabled = !kick.configured || authorized || kick.oauth?.state === 'authorization-pending';
    $('#validateKickButton').disabled = !authorized;
    $('#linkKickRelayButton').disabled = !authorized || !state.hostedExtension?.paired;
    $('#disconnectKickButton').disabled = !authorized && kick.oauth?.state !== 'error';
    $('#kickSetupMessage').textContent = kick.lastError || (authorized && eventsConnected
      ? `@${kick.oauth.account?.username || 'Kick broadcaster'} is connected. Signed chat webhooks and platform-local replies are active.`
      : authorized ? 'The Kick account is authorized, but the chat webhook subscription needs attention. Confirm the webhook URL in the Kick developer app and validate again.'
        : kick.oauth?.state === 'authorization-pending' ? 'Complete authorization in the Kick browser tab. Studio will receive the callback automatically.'
          : kick.configured ? 'Kick application saved. Connect the broadcaster account to activate chat.'
            : 'Create a Kick developer application, register both URLs shown here, then save its Client ID and secret.');
    const output = state.simulcast || {};
    $('#kickOutputDestinationState').textContent = output.kickServerConfigured ? 'CONFIGURED' : output.connected ? 'SET UP IN BROADCAST' : 'BROADCAST OFFLINE';
    $('#kickOutputCredentialState').textContent = output.credentialsStored && output.secureStorageAvailable ? 'PROTECTED' : output.connected ? 'SET UP IN BROADCAST' : 'BROADCAST OFFLINE';
    $('#kickOutputUploadState').textContent = output.uploadCapacityConfigured ? `${Math.round(Number(output.uploadCapacityKbps || 0) / 100) / 10} MBPS` : output.connected ? 'SET UP IN BROADCAST' : 'BROADCAST OFFLINE';
    $('#kickOutputRecordingState').textContent = output.recording ? 'RECORDING' : output.recordingWithStream ? 'ARMED' : 'OFF';
  }

  function renderHostedExtension() {
    const hosted = state.hostedExtension || {};
    const paired = Boolean(hosted.paired);
    const companions = hosted.companions || (hosted.extensionEdition === 'bits'
      ? { schemaVersion: 1, mainframe: false, streaming: true }
      : { schemaVersion: 1, mainframe: true, streaming: false });
    const companionNames = [companions.mainframe && 'Tempest Mainframe', companions.streaming && 'Tempest Streaming'].filter(Boolean);
    const companionLabel = companionNames.length === 2 ? 'Both companion Extensions' : companionNames[0] || 'No companion Extension';
    const authorized = state.twitch?.oauth?.state === 'authorized';
    const officialTwitchAuthorization = state.twitch?.clientIdMode === 'official';
    const relayState = String(state.twitch?.connections?.extensionRelay || 'not-configured').replaceAll('-', ' ').toUpperCase();
    const relaySync = state.twitch?.extensionRelaySync;
    const relayCompanionsMatch = !relaySync?.companions || (relaySync.companions.mainframe === companions.mainframe && relaySync.companions.streaming === companions.streaming);
    const relaySynced = paired && relayState === 'CONNECTED' && relaySync?.state === 'synced' && relayCompanionsMatch;
    const relayPublishing = paired && relayState === 'CONNECTED' && !relaySynced;
    $('#twitchCompanionMainframe').checked = companions.mainframe;
    $('#twitchCompanionStreaming').checked = companions.streaming;
    const companionState = (enabled) => !enabled ? 'DISABLED' : relaySynced ? 'CATALOG SYNCED' : relayPublishing ? 'PUBLISHING…' : paired ? 'PAIRED · WAITING FOR RELAY' : 'ENABLED LOCALLY';
    $('#twitchCompanionMainframeState').textContent = companionState(companions.mainframe);
    $('#twitchCompanionStreamingState').textContent = companionState(companions.streaming);
    const enabledLabel = companions.mainframe && companions.streaming ? 'BOTH' : companions.mainframe ? 'MAINFRAME' : 'STREAMING';
    $('#twitchExtensionEditionBadge').textContent = relaySynced ? `${enabledLabel} SYNCED` : relayPublishing ? 'PUBLISHING' : `${enabledLabel} ENABLED`;
    $('#twitchExtensionEditionBadge').classList.toggle('offline', paired && relayState !== 'CONNECTED');
    $('#twitchExtensionEditionMessage').textContent = relaySynced
      ? `${companionLabel} ${companionNames.length === 1 ? 'is' : 'are'} confirmed by Tempest Signal with ${relaySync.itemCount} published signal${relaySync.itemCount === 1 ? '' : 's'}. Studio is the shared configuration source.`
      : relayPublishing ? `Publishing ${companionLabel.toLowerCase()} and the current Studio signal catalog to Tempest Signal…`
        : `${companionLabel} ${companionNames.length === 1 ? 'is' : 'are'} enabled locally. Pair and connect Tempest Signal to publish this configuration.`;
    $('#hostedExtensionBadge').textContent = paired ? (relayState === 'CONNECTED' ? 'PAIRED + ONLINE' : 'PAIRED') : 'NOT PAIRED';
    $('#hostedExtensionBadge').classList.toggle('offline', !paired || relayState !== 'CONNECTED');
    $('#hostedExtensionCredentialState').textContent = paired ? 'WINDOWS ENCRYPTED' : 'NOT ISSUED';
    $('#hostedExtensionChannelState').textContent = hosted.channel?.login ? `@${hosted.channel.login}` : hosted.channel?.id || '—';
    $('#hostedExtensionRelayState').textContent = relayState;
    $('#pairHostedExtension').disabled = !authorized || hosted.credentialStorage === 'unavailable' || paired || !officialTwitchAuthorization;
    $('#pairHostedExtension').textContent = 'Connect Companion Extensions';
    $('#switchHostedExtensionToOfficialTwitch').hidden = paired || officialTwitchAuthorization;
    $('#revokeHostedExtension').disabled = !paired;
    $('#hostedExtensionMessage').textContent = paired
      ? relayState === 'CONNECTED' ? `${companionLabel} ${companionNames.length === 1 ? 'is' : 'are'} active. Studio publishes one shared safety policy and destination-filtered catalog automatically.` : `The channel installation is paired for ${companionLabel.toLowerCase()}. Studio will keep retrying the hosted relay connection.`
      : !officialTwitchAuthorization ? 'The public Extension requires the built-in Tempest Twitch application. Switch sign-in once, reconnect Twitch, then connect your channel.'
        : hosted.lastError || (!authorized ? 'Authorize your broadcaster account above before pairing the public Extension service.'
          : 'Tempest Signal is built in. Pair once and Studio will store the per-installation relay credential with Windows encryption.');
    renderExtensionFeaturePlacement();
  }

  function renderExtensionFeaturePlacement() {
    const features = state.extensionFeatures?.features || [];
    const list = $('#extensionFeaturePlacementList');
    if (!list) return;
    list.classList.toggle('empty-state', !features.length);
    let previousGroup = '';
    list.innerHTML = features.length ? features.map((feature) => {
      const group = feature.group || 'Other';
      const heading = group === previousGroup ? '' : `<div class="extension-feature-group">${escapeHtml(group)}</div>`;
      previousGroup = group;
      const destinations = new Set(feature.destinations || []);
      return `${heading}<div class="extension-feature-row ${feature.customized ? 'customized' : ''}" data-extension-feature-row="${escapeHtml(feature.id)}"><div><strong>${escapeHtml(feature.name)}</strong><small>${escapeHtml(feature.description || feature.id)}</small></div><label><input type="checkbox" data-extension-feature-destination="mainframe" data-extension-feature-id="${escapeHtml(feature.id)}" ${destinations.has('mainframe') ? 'checked' : ''} /> PANEL</label><label><input type="checkbox" data-extension-feature-destination="streaming" data-extension-feature-id="${escapeHtml(feature.id)}" ${destinations.has('streaming') ? 'checked' : ''} /> OVERLAY</label></div>`;
    }).join('') : 'No viewer-facing Extension features are available.';
    const mainframeCount = features.filter((feature) => feature.destinations?.includes('mainframe')).length;
    const streamingCount = features.filter((feature) => feature.destinations?.includes('streaming')).length;
    $('#extensionFeaturePlacementStatus').textContent = `${mainframeCount} feature${mainframeCount === 1 ? '' : 's'} in Mainframe · ${streamingCount} feature${streamingCount === 1 ? '' : 's'} in Streaming. Changes publish to Tempest Signal automatically.`;
  }

  async function saveExtensionFeaturePlacement(input) {
    const id = input.dataset.extensionFeatureId;
    const row = input.closest('[data-extension-feature-row]');
    const destinations = [...row.querySelectorAll('[data-extension-feature-destination]:checked')].map((entry) => entry.dataset.extensionFeatureDestination);
    row.classList.add('saving');
    try {
      const result = await api(`/v1/extension-features/${encodeURIComponent(id)}`, { method: 'POST', body: { destinations } });
      const index = state.extensionFeatures.features.findIndex((feature) => feature.id === id);
      if (index >= 0) state.extensionFeatures.features[index] = result.feature;
      renderExtensionFeaturePlacement();
      const placement = destinations.length === 2 ? 'both Extensions' : destinations[0] === 'mainframe' ? 'the Mainframe panel' : destinations[0] === 'streaming' ? 'the Streaming overlay' : 'both Extensions';
      toast(destinations.length ? `${result.feature.name} is now available in ${placement}.` : `${result.feature.name} is hidden from both Extensions.`);
    } catch (error) {
      await refresh({ quiet: true });
      toast(error.message, true);
    }
  }

  async function resetExtensionFeaturePlacement() {
    const button = $('#resetExtensionFeaturePlacement');
    button.disabled = true;
    try {
      state.extensionFeatures = await api('/v1/extension-features/reset', { method: 'POST', body: {} });
      renderExtensionFeaturePlacement();
      toast('Extension feature placement restored to Studio defaults.');
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
  }

  function renderLocalExtension() {
    const local = state.localExtension || {};
    const accountChannelId = state.twitch?.oauth?.account?.userId || '';
    const channelInput = $('#localExtensionChannelId');
    if (document.activeElement !== channelInput && !channelInput.value.trim()) channelInput.value = local.channelId || accountChannelId;
    $('#localExtensionBadge').textContent = local.running ? 'RUNNING' : 'STOPPED';
    $('#localExtensionBadge').classList.toggle('offline', !local.running);
    $('#localExtensionSecretState').textContent = local.secretStored ? 'WINDOWS ENCRYPTED' : 'NOT STORED';
    const certificateProvider = local.certificateProvider === 'mkcert'
      ? `MKCERT ${local.certificateProviderVersion || ''}`.trim()
      : local.certificateProvider === 'windows-native' ? 'WINDOWS HTTPS' : 'CERT FILE READY';
    $('#localExtensionCertificateState').textContent = local.certificateAvailable ? certificateProvider : 'NOT READY';
    $('#localExtensionChannelState').textContent = local.channelId || accountChannelId || '—';
    $('#localExtensionPanelUrl').textContent = local.panelUrl || 'https://localhost:8080/panel.html';
    $('#localExtensionSecret').placeholder = local.secretStored ? 'Stored securely; leave blank to reuse' : 'Paste once; stored with Windows encryption';
    $('#startLocalExtension').disabled = Boolean(local.running) || !Boolean(local.certificateAvailable);
    $('#stopLocalExtension').disabled = !local.running;
    $('#openLocalExtensionPanel').disabled = !local.running;
    $('#prepareLocalExtensionCertificate').disabled = Boolean(local.running);
    $('#removeLocalExtensionCertificate').disabled = Boolean(local.running) || !Boolean(local.certificateAvailable);
    $('#forgetLocalExtensionSecret').disabled = !local.secretStored && !local.running;
    const certificateExpiry = local.certificateExpiresAt && Number.isFinite(Date.parse(local.certificateExpiresAt))
      ? new Date(local.certificateExpiresAt).toLocaleDateString()
      : '';
    const certificateReadyMessage = local.certificateTrusted === false
      ? 'A local HTTPS certificate exists but is not marked trusted; run Prepare HTTPS before using Twitch Extension testing.'
      : local.certificateProvider === 'mkcert'
        ? `Trusted local HTTPS is ready through verified mkcert ${local.certificateProviderVersion || ''}${certificateExpiry ? ` until ${certificateExpiry}` : ''}.`
        : `Local HTTPS is ready${certificateExpiry ? ` until ${certificateExpiry}` : ''}.`;
    $('#localExtensionMessage').textContent = local.lastError || (local.running
      ? 'Your single-channel Extension services are running. Refresh the installed Twitch panel to send signals into Studio.'
      : !local.certificateAvailable ? 'Prepare the trusted localhost certificate once, then start the Local Panel.'
        : local.secretStored ? `${certificateReadyMessage} The Extension secret is stored with Windows encryption; start the Local Panel whenever you want to test it.`
          : `${certificateReadyMessage} Paste the revealed Extension Secret once; Studio will encrypt it and start the panel services without PowerShell.`);
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
    const clientId = $('#twitchClientId').value.trim() || undefined;
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

  async function saveKickConfiguration({ quiet = false } = {}) {
    try {
      state.kick = await api('/v1/integrations/kick/configuration', { method: 'POST', body: { clientId: $('#kickClientId').value.trim(), clientSecret: $('#kickClientSecret').value, redirectUri: $('#kickRedirectUri').value } });
      $('#kickClientSecret').value = '';
      renderChatbot();
      if (!quiet) toast('Kick developer application saved with Windows-encrypted credentials.');
      return state.kick;
    } catch (error) {
      renderChatbot();
      if (!quiet) toast(error.message, true);
      if (quiet) throw error;
      return null;
    }
  }

  async function connectKick() {
    try {
      await saveKickConfiguration({ quiet: true });
      const authorization = await api('/v1/integrations/kick/oauth/start', { method: 'POST', body: {} });
      state.kick = authorization.status;
      renderChatbot();
      await window.tempestStudio.openExternal(authorization.authorizationUri);
      toast('Kick authorization opened in your browser.');
    } catch (error) { toast(error.message, true); }
  }

  async function validateKick() {
    try {
      state.kick = await api('/v1/integrations/kick/oauth/validate', { method: 'POST', body: {} });
      if (state.hostedExtension?.paired) await linkKickRelay({ quiet: true });
      renderChatbot();
      toast(state.kick.events?.state === 'connected' ? 'Kick account and chat webhook are active.' : 'Kick account is valid; webhook subscription needs attention.', state.kick.events?.state !== 'connected');
    } catch (error) { await refresh({ quiet: true }); toast(error.message, true); }
  }

  async function linkKickRelay({ quiet = false } = {}) {
    try {
      const result = await window.tempestStudio.linkHostedKick();
      state.kickRelayLinked = Boolean(result?.linked);
      renderChatbot();
      if (!quiet) toast(`Kick webhook relay linked to @${result?.kick?.username || 'the connected account'}.`);
      return result;
    } catch (error) {
      state.kickRelayLinked = false;
      if (!quiet) toast(error.message, true);
      if (quiet) throw error;
      return null;
    }
  }

  async function disconnectKick() {
    if (!confirm('Disconnect Kick chat and remove the encrypted Kick secret and tokens from this device?')) return;
    try {
      await window.tempestStudio.unlinkHostedKick().catch(() => ({ unlinked: false }));
      state.kick = await api('/v1/integrations/kick/oauth', { method: 'DELETE', body: {} });
      state.kickRelayLinked = false;
      $('#kickClientSecret').value = '';
      renderChatbot();
      toast('Kick chat disconnected. Twitch chat remains unchanged.');
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

  async function saveChatbotProviders(event) {
    event.preventDefault();
    const weatherProvider = $('#weatherProviderEnabled').checked ? { provider: 'nws', locationName: $('#weatherLocationName').value.trim(), latitude: Number($('#weatherLatitude').value), longitude: Number($('#weatherLongitude').value), timeZone: $('#weatherTimeZone').value.trim() } : null;
    const nowPlayingProvider = $('#nowPlayingProviderEnabled').checked ? { provider: 'azuracast', stationName: $('#nowPlayingStationName').value.trim(), apiUrl: $('#nowPlayingApiUrl').value.trim(), publicPlayerUrl: $('#nowPlayingPublicUrl').value.trim(), streamUrl: $('#nowPlayingStreamUrl').value.trim() || undefined } : null;
    try {
      state.chatbot = await api('/v1/chatbot/configuration', { method: 'POST', body: { weatherProvider, nowPlayingProvider } });
      renderChatbot();
      toast('Optional response providers saved. Add or edit commands to use them.');
    } catch (error) { toast(error.message, true); }
  }

  async function saveChatbotRaidAutomation(event) {
    event.preventDefault();
    const raidAutomation = {
      welcomeEnabled: $('#chatbotRaidWelcomeEnabled').checked,
      welcomeMessage: $('#chatbotRaidWelcomeMessage').value.trim(),
      shoutoutEnabled: $('#chatbotRaidShoutoutEnabled').checked
    };
    try {
      state.chatbot = await api('/v1/chatbot/configuration', { method: 'POST', body: { raidAutomation } });
      renderChatbot();
      toast('Raid welcome and shoutout automation saved.');
    } catch (error) { toast(error.message, true); }
  }

  async function saveChatbotAutoMessages(event) {
    event.preventDefault();
    const platforms = [
      $('#chatbotAutoMessagesTwitch').checked ? 'twitch' : '',
      $('#chatbotAutoMessagesKick').checked ? 'kick' : ''
    ].filter(Boolean);
    const autoMessages = {
      enabled: $('#chatbotAutoMessagesEnabled').checked,
      messages: $('#chatbotAutoMessages').value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean),
      intervalMinutes: Number($('#chatbotAutoMessageInterval').value),
      chatMessageThreshold: Number($('#chatbotAutoMessageThreshold').value),
      platforms
    };
    try {
      state.chatbot = await api('/v1/chatbot/configuration', { method: 'POST', body: { autoMessages } });
      renderChatbot();
      toast('Rotating Auto Messages saved.');
    } catch (error) { toast(error.message, true); }
  }

  async function startChatbotPoll(event) {
    event.preventDefault();
    try {
      state.chatbot = await api('/v1/chatbot/poll/start', { method: 'POST', body: {
        question: $('#chatbotPollQuestion').value,
        options: $('#chatbotPollOptions').value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)
      } });
      renderChatbot();
      toast('Numeric chat poll started. Each account can vote once.');
    } catch (error) { toast(error.message, true); }
  }

  async function stopChatbotPoll() {
    try {
      state.chatbot = await api('/v1/chatbot/poll/stop', { method: 'POST', body: {} });
      renderChatbot();
      toast('Chat poll voting ended.');
    } catch (error) { toast(error.message, true); }
  }

  async function clearChatbotPoll() {
    try {
      state.chatbot = await api('/v1/chatbot/poll', { method: 'DELETE' });
      renderChatbot();
      toast('Chat poll cleared.');
    } catch (error) { toast(error.message, true); }
  }

  async function startTwitchPrediction(event) {
    event.preventDefault();
    try {
      state.twitch = await api('/v1/integrations/twitch/predictions', { method: 'POST', body: {
        title: $('#twitchPredictionTitle').value,
        outcomes: $('#twitchPredictionOutcomes').value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean),
        predictionWindow: Number($('#twitchPredictionWindow').value)
      } });
      renderChatbot();
      toast('Twitch Prediction started. Viewers can wager Channel Points in Twitch chat.');
    } catch (error) { toast(error.message, true); }
  }

  async function refreshTwitchPrediction() {
    try {
      state.twitch = await api('/v1/integrations/twitch/predictions/refresh', { method: 'POST', body: {} });
      renderChatbot();
      toast('Twitch Prediction status refreshed.');
    } catch (error) { toast(error.message, true); }
  }

  async function endTwitchPrediction(status, winningOutcomeId) {
    const prediction = state.twitch?.predictions?.current;
    if (!prediction?.id) return toast('No Twitch Prediction is active.', true);
    try {
      state.twitch = await api('/v1/integrations/twitch/predictions/end', { method: 'POST', body: { predictionId: prediction.id, status, winningOutcomeId } });
      renderChatbot();
      toast(status === 'LOCKED' ? 'Prediction wagers locked.' : status === 'CANCELED' ? 'Prediction canceled; Twitch will refund all wagers.' : 'Prediction resolved; Twitch will distribute the winnings.');
    } catch (error) { toast(error.message, true); }
  }

  function autoModFormValue() {
    const exemptRoles = [
      $('#chatbotAutoModExemptBroadcaster').checked ? 'broadcaster' : '',
      $('#chatbotAutoModExemptModerator').checked ? 'moderator' : '',
      $('#chatbotAutoModExemptVip').checked ? 'vip' : ''
    ].filter(Boolean);
    return {
      enabled: $('#chatbotAutoModEnabled').checked,
      linkProtectionEnabled: $('#chatbotAutoModLinks').checked,
      allowedDomains: $('#chatbotAutoModDomains').value.split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean),
      blockedTermsEnabled: $('#chatbotAutoModTermsEnabled').checked,
      blockedTerms: $('#chatbotAutoModTerms').value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean),
      capsProtectionEnabled: $('#chatbotAutoModCaps').checked,
      capsMinimumLetters: Number($('#chatbotAutoModCapsMinimum').value),
      capsPercentage: Number($('#chatbotAutoModCapsPercentage').value),
      repetitionProtectionEnabled: $('#chatbotAutoModRepetition').checked,
      repetitionLimit: Number($('#chatbotAutoModRepetitionLimit').value),
      exemptRoles,
      action: $('#chatbotAutoModAction').value,
      timeoutSeconds: Number($('#chatbotAutoModTimeout').value),
      postNotice: $('#chatbotAutoModNotice').checked,
      noticeMessage: $('#chatbotAutoModNoticeMessage').value.trim()
    };
  }

  async function saveChatbotAutoMod(event) {
    event.preventDefault();
    try {
      state.chatbot = await api('/v1/chatbot/configuration', { method: 'POST', body: { autoMod: autoModFormValue() } });
      renderChatbot();
      toast('Chatbot AutoMod settings saved.');
    } catch (error) { toast(error.message, true); }
  }

  async function testChatbotAutoMod() {
    try {
      const pending = autoModFormValue();
      state.chatbot = await api('/v1/chatbot/configuration', { method: 'POST', body: { autoMod: pending } });
      const result = await api('/v1/chatbot/automod/test', { method: 'POST', body: { message: $('#chatbotAutoModTestMessage').value, roles: [] } });
      $('#chatbotAutoModTestResult').textContent = result.blocked
        ? `Matched ${result.rule}: AutoMod would ${result.action} this message (${result.reason}). Nothing was sent to Twitch.`
        : 'No enabled AutoMod rule matched this message.';
      renderChatbot();
    } catch (error) { toast(error.message, true); }
  }

  async function testChatbotRaidAutomation() {
    try {
      const result = await api('/v1/chatbot/raid/test', { method: 'POST', body: { raiderName: 'IncomingChannel', viewers: 42 } });
      $('#chatbotRaidTestResult').textContent = `Preview: “${result.message}” · welcome ${result.welcome} · shoutout ${result.shoutout}. Nothing was posted to Twitch.`;
    } catch (error) { toast(error.message, true); }
  }

  async function saveChatbotFirstChatShoutouts(event) {
    event.preventDefault();
    const channels = $('#chatbotFirstChatChannels').value.split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean);
    try {
      state.chatbot = await api('/v1/chatbot/configuration', { method: 'POST', body: {
        firstChatShoutouts: { enabled: $('#chatbotFirstChatEnabled').checked, channels },
        interactionAccess: { mode: $('#chatbotInteractionAccessMode').value, allowBroadcasterAndModerators: $('#chatbotInteractionAllowStaff').checked }
      } });
      renderChatbot();
      toast(`Assigned Creators saved. Panel interactions are ${state.chatbot.interactionAccess.mode === 'assigned-creators' ? 'restricted' : 'open'}.`);
    } catch (error) { toast(error.message, true); }
  }

  function resetChatbotCommandForm() {
    $('#chatbotCommandId').value = '';
    $('#chatbotCommandName').value = '';
    $('#chatbotCommandAliases').value = '';
    $('#chatbotCommandPermission').value = 'everyone';
    $('#chatbotCommandResponse').value = '';
    $('#chatbotCommandHandler').value = '';
    $('#chatbotCounterLabel').value = '';
    $('#chatbotCounterValue').value = '0';
    $('#chatbotCounterFields').hidden = true;
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
    $('#chatbotCounterLabel').value = command.counterLabel || command.name;
    $('#chatbotCounterValue').value = String(command.counterValue || 0);
    $('#chatbotCounterFields').hidden = command.handler !== 'counter';
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
      counterLabel: $('#chatbotCommandHandler').value === 'counter' ? $('#chatbotCounterLabel').value.trim() : undefined,
      counterValue: $('#chatbotCommandHandler').value === 'counter' ? Number($('#chatbotCounterValue').value) : undefined,
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

  async function sendSharedChatMessage(event) {
    event.preventDefault();
    const input = $('#sharedChatMessage');
    const message = input.value.trim();
    if (!message) return;
    try {
      const platform = $('#sharedChatPlatform').value;
      await api('/v1/chatbot/messages', { method: 'POST', body: { platform, message } });
      input.value = '';
      toast(`Message sent to ${platform === 'kick' ? 'Kick' : 'Twitch'} chat.`);
    } catch (error) { toast(error.message, true); }
  }

  async function clearSharedChatMessages() {
    try {
      state.chatbot = await api('/v1/chatbot/messages', { method: 'DELETE' });
      renderChatbot();
    } catch (error) { toast(error.message, true); }
  }

  async function pairHostedExtension() {
    try {
      state.hostedExtension = await window.tempestStudio.pairHostedExtension({});
      await refresh({ quiet: true });
      toast(`Twitch companion Extensions connected to @${state.hostedExtension.channel?.login || 'your channel'}.`);
    } catch (error) {
      state.hostedExtension = await window.tempestStudio.getHostedExtensionStatus().catch(() => state.hostedExtension);
      renderHostedExtension();
      toast(error.message, true);
    }
  }

  async function switchHostedExtensionToOfficialTwitch() {
    if (!confirm('Switch to the official Tempest Twitch application? The current custom Twitch authorization will be removed, and you will need to reconnect your broadcaster account.')) return;
    try {
      $('#twitchClientId').value = '';
      state.twitch = await api('/v1/integrations/twitch/configuration', { method: 'POST', body: {
        scopes: state.twitch?.oauth?.scopes || [],
        rewardMappings: parseRewardMappings()
      } });
      state.twitchDeviceAuthorization = null;
      renderTwitch();
      toast('Official Tempest Twitch sign-in selected. Choose Connect Twitch, authorize your broadcaster account, then choose Connect My Channel.');
    } catch (error) { toast(error.message, true); }
  }

  async function revokeHostedExtension() {
    if (!confirm('Revoke this Studio installation? The public Twitch panel will stop routing signals until it is paired again.')) return;
    try {
      state.hostedExtension = await window.tempestStudio.revokeHostedExtension();
      await refresh({ quiet: true });
      toast('Public Extension disconnected.');
    } catch (error) {
      state.hostedExtension = await window.tempestStudio.getHostedExtensionStatus().catch(() => state.hostedExtension);
      renderHostedExtension();
      toast(error.message, true);
    }
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
    try {
      state.localExtension = await window.tempestStudio.prepareLocalExtensionCertificate();
      renderLocalExtension();
      toast('Local Extension certificate is ready.');
    } catch (error) { toast(error.message, true); }
  }

  async function removeLocalExtensionCertificate() {
    try {
      state.localExtension = await window.tempestStudio.removeLocalExtensionCertificate();
      renderLocalExtension();
      toast('Local Extension HTTPS trust removed.');
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
    return { schemaVersion: 1, preset: 'tempest', brandName: 'TEMPEST STREAMING STUDIO', eyebrow: 'VIEWER CONTROL NODE', title: 'Signal deck', accent: '#54F2EB', background: '#05090E', surface: '#09131B', text: '#ECF9FF', muted: '#79919D', font: 'inter', cardLayout: 'grid', density: 'comfortable', cornerRadius: 10, showLogo: true, showStatus: true, showSearch: true, showFilters: true, showPattern: true, uppercaseLabels: true, showCurrentStream: true, showNowPlaying: true, showSchedule: true, showGoal: true, showPoll: true, showCounters: true, showCommands: true, showDice: true, showFeatured: true, showPerformances: true };
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
    $('#panelDesignShowCurrentStream').checked = design.showCurrentStream;
    $('#panelDesignShowNowPlaying').checked = design.showNowPlaying;
    $('#panelDesignShowSchedule').checked = design.showSchedule;
    $('#panelDesignShowGoal').checked = design.showGoal;
    $('#panelDesignShowPoll').checked = design.showPoll;
    $('#panelDesignShowCounters').checked = design.showCounters;
    $('#panelDesignShowCommands').checked = design.showCommands;
    $('#panelDesignShowDice').checked = design.showDice;
    $('#panelDesignShowFeatured').checked = design.showFeatured;
    $('#panelDesignShowPerformances').checked = design.showPerformances;
    updatePanelDesignPreview();
  }

  function readPanelDesign() {
    return { schemaVersion: 1, preset: $('#panelDesignPreset').value, brandName: $('#panelDesignBrandName').value.trim(), eyebrow: $('#panelDesignEyebrow').value.trim(), title: $('#panelDesignTitle').value.trim(), accent: $('#panelDesignAccent').value, background: $('#panelDesignBackground').value, surface: $('#panelDesignSurface').value, text: $('#panelDesignText').value, muted: $('#panelDesignMuted').value, font: $('#panelDesignFont').value, cardLayout: $('#panelDesignCardLayout').value, density: $('#panelDesignDensity').value, cornerRadius: Number($('#panelDesignRadius').value), showLogo: $('#panelDesignShowLogo').checked, showStatus: $('#panelDesignShowStatus').checked, showSearch: $('#panelDesignShowSearch').checked, showFilters: $('#panelDesignShowFilters').checked, showPattern: $('#panelDesignShowPattern').checked, uppercaseLabels: $('#panelDesignUppercase').checked, showCurrentStream: $('#panelDesignShowCurrentStream').checked, showNowPlaying: $('#panelDesignShowNowPlaying').checked, showSchedule: $('#panelDesignShowSchedule').checked, showGoal: $('#panelDesignShowGoal').checked, showPoll: $('#panelDesignShowPoll').checked, showCounters: $('#panelDesignShowCounters').checked, showCommands: $('#panelDesignShowCommands').checked, showDice: $('#panelDesignShowDice').checked, showFeatured: $('#panelDesignShowFeatured').checked, showPerformances: $('#panelDesignShowPerformances').checked };
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
    $('#panelPreviewCurrentStream').hidden = !design.showCurrentStream;
    $('#panelPreviewNowPlaying').hidden = !design.showNowPlaying;
    $('#panelPreviewSchedule').hidden = !design.showSchedule;
    $('#panelPreviewGoal').hidden = !design.showGoal;
    $('#panelPreviewPoll').hidden = !design.showPoll;
    $('#panelPreviewCounters').hidden = !design.showCounters;
    $('#panelPreviewCommands').hidden = !design.showCommands;
    $('#panelPreviewDice').hidden = !design.showDice;
    $('#panelPreviewFeatured').hidden = !design.showFeatured;
    $('#panelPreviewPerformances').hidden = !design.showPerformances;
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
      $('#panelDesignStateBadge').textContent = state.hostedExtension?.paired ? 'SYNCED TO TWITCH' : 'SAVED LOCALLY';
      $('#panelDesignStateBadge').classList.remove('offline');
      $('#panelDesignSaveState').textContent = state.hostedExtension?.paired
        ? 'Saved. The Twitch panel updates automatically within 5 seconds.'
        : state.localExtension?.running ? 'Saved. Refresh the real Panel to apply it.' : 'Saved locally. Pair the public Extension to sync it to Twitch.';
      toast(state.hostedExtension?.paired ? 'Twitch Panel design saved and synced.' : 'Twitch Panel design saved locally.');
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

  function renderAbout() {
    const info = state.appInfo;
    if (!info) return;
    $('#aboutBuildBadge').textContent = `BUILD ${info.version}`;
    $('#aboutVersion').textContent = info.version;
    $('#aboutDataVersion').textContent = `v${info.dataVersion || '?'}`;
    $('#aboutRuntime').textContent = `Electron ${info.electron} · Node ${info.node}`;
    $('#aboutBuildType').textContent = info.packaged ? `${info.platform} ${info.arch} · installed` : `${info.platform} ${info.arch} · development`;
  }

  function renderUpdateStatus() {
    const update = state.update;
    if (!update) return;
    const labels = {
      disabled: 'DEV BUILD',
      idle: 'READY',
      checking: 'CHECKING',
      available: 'AVAILABLE',
      downloading: `DOWNLOADING ${Math.round(update.percent || 0)}%`,
      downloaded: 'READY TO INSTALL',
      installing: 'INSTALLING',
      current: 'UP TO DATE',
      error: 'RETRY AVAILABLE'
    };
    const badge = $('#updateStatusBadge');
    badge.textContent = labels[update.state] || 'READY';
    badge.classList.toggle('offline', update.state === 'error' || update.state === 'disabled');
    $('#updateStatusMessage').textContent = update.message || 'Ready to check for updates.';
    const progress = $('#updateProgress');
    progress.hidden = update.state !== 'downloading' && update.state !== 'downloaded' && update.state !== 'installing';
    $('#updateProgressBar').style.width = `${Math.max(0, Math.min(100, update.percent || 0))}%`;
    $('#checkForStudioUpdates').disabled = update.state === 'checking' || update.state === 'downloading' || update.state === 'installing' || update.state === 'disabled';
    $('#downloadStudioUpdate').hidden = update.state !== 'available';
    $('#downloadStudioUpdate').disabled = update.state !== 'available';
    $('#installStudioUpdate').hidden = update.state !== 'downloaded';
    $('#installStudioUpdate').disabled = update.state !== 'downloaded';
  }

  async function checkForStudioUpdates() {
    try {
      state.update = await window.tempestStudio.checkForUpdates();
      renderUpdateStatus();
      if (state.update.state === 'current') toast('Tempest Streaming Studio is up to date.');
    } catch (error) { toast(error.message, true); }
  }

  async function downloadStudioUpdate() {
    try {
      state.update = await window.tempestStudio.downloadUpdate();
      renderUpdateStatus();
    } catch (error) { toast(error.message, true); }
  }

  async function installStudioUpdate() {
    try {
      state.update = await window.tempestStudio.installUpdate();
      renderUpdateStatus();
    } catch (error) { toast(error.message, true); }
  }

  function renderDiceOverlay({ settings = false } = {}) {
    const status = state.diceOverlay;
    if (!status) return;
    const enabled = status.settings?.enabled !== false;
    const clients = Number(status.connectedClients || 0);
    const authority = status.clients?.find((client) => client.authority) || status.clients?.[0];
    const engineState = authority?.state || (clients ? 'connecting' : 'disconnected');
    const engineReady = engineState === 'ready' || engineState === 'degraded';
    const roll = status.latestRoll;
    $('#diceOverlayBadge').textContent = !enabled ? 'DISABLED' : engineState === 'failed' ? 'ENGINE FAILED' : clients && !engineReady ? 'ENGINE STARTING' : clients ? 'ON STREAM' : 'SOURCE READY';
    $('#diceOverlayBadge').classList.toggle('offline', !enabled || engineState === 'failed');
    $('#diceConnectedClients').textContent = String(clients);
    $('#diceLastTotal').textContent = roll ? String(roll.total) : '—';
    $('#diceLastReason').textContent = roll?.reason || (roll ? `Rolled by ${roll.rollerName}` : 'No roll yet');
    $('#diceLastExpression').textContent = roll?.expression || '—';
    $('#diceHistoryCount').textContent = String(status.history?.length || 0);
    const unifiedUrl = state.unifiedStage?.url || status.url;
    const unifiedDiceEnabled = state.unifiedStage?.settings?.enabled !== false && state.unifiedStage?.settings?.modules?.diceOverlay === true;
    const sourceMessage = !clients
      ? `Enable Dice in Unified Stage and add the Unified Stage URL to Broadcast.`
      : engineState === 'ready'
        ? authority?.renderer
          ? `Unified Stage connected and the ${escapeHtml(authority?.theme || status.settings?.diceTheme || 'selected')} dice engine is ready.`
          : 'Unified Stage connected; Dice is sleeping without a WebGL context until a roll starts.'
        : engineState === 'degraded'
          ? `Unified Stage is using a safe fallback: ${escapeHtml(authority?.error || 'the selected theme was unavailable')}`
          : engineState === 'failed'
            ? `Unified Stage Dice failed: ${escapeHtml(authority?.error || 'reload the source to retry')}`
            : 'Unified Stage connected; the Dice engine is starting for a roll.';
    const duplicateMessage = Number(status.duplicateClients || 0) ? ` ${escapeHtml(status.duplicateClients)} duplicate source${Number(status.duplicateClients) === 1 ? '' : 's'} will mirror results but not own rolls.` : '';
    $('#diceOverlaySourceStatus').innerHTML = `<strong>Unified Stage · 3D Dice:</strong> ${sourceMessage}${duplicateMessage} ${unifiedDiceEnabled ? '' : '<strong>Dice is currently off in Unified Stage.</strong> '}<code data-sensitive>${escapeHtml(unifiedUrl)}</code> ${copyButton(unifiedUrl, 'Unified Stage Browser Source URL')}`;
    const audio = status.audio || { state: 'untested' };
    $('#diceAudioStatus').textContent = audio.state === 'ready'
      ? `Verified in the Browser Source via ${audio.method === 'web-audio' ? 'Web Audio fallback' : 'media playback'}.`
      : audio.state === 'failed'
        ? `Sound test failed: ${audio.error || 'the Browser Source did not confirm playback.'}`
        : audio.state === 'testing' ? 'Waiting for the Browser Source to confirm playback…' : 'Sound has not been verified in the Browser Source.';
    $('#testDiceAudio').disabled = !clients || audio.state === 'testing';
    const preview = $('#diceResultPreview');
    preview.classList.toggle('empty-state', !roll);
    preview.innerHTML = roll ? `<div><div class="dice-preview-expression">${escapeHtml(roll.expression)} · ${escapeHtml(roll.rollerName)}</div><div class="dice-preview-dice">${roll.dice.map((die) => `<span class="dice-preview-die ${die.kept ? '' : 'dropped'}" title="d${escapeHtml(die.sides)}${die.kept ? '' : ' dropped'}">${escapeHtml(die.value)}</span>`).join('')}</div></div><strong class="dice-preview-total">${escapeHtml(roll.total)}</strong>${roll.reason ? `<p class="dice-preview-reason">${escapeHtml(roll.reason)}</p>` : ''}` : 'Results appear here after the on-stream dice finish bouncing and settle.';
    if (!settings || !status.settings) return;
    const themeSelect = $('#diceTheme');
    const selectedTheme = status.settings.diceTheme || 'default';
    themeSelect.innerHTML = (status.themes || [{ id: 'default', name: 'Classic', custom: false }]).map((theme) => `<option value="${escapeHtml(theme.id)}">${theme.custom ? 'Imported · ' : ''}${escapeHtml(theme.name)}</option>`).join('');
    if ([...themeSelect.options].some((option) => option.value === selectedTheme)) themeSelect.value = selectedTheme;
    $('#diceTheme').value = status.settings.diceTheme || 'default';
    $('#diceColor').value = status.settings.theme || 'stormglass';
    $('#diceThemeColor').value = status.settings.themeColor || '#2e91ad';
    $('#diceDuration').value = String(status.settings.durationMs || 5200);
    $('#diceScale').value = String(status.settings.scalePercent || 100);
    $('#diceShowReason').checked = status.settings.showReason !== false;
    $('#diceSoundEnabled').checked = status.settings.soundEnabled === true;
    $('#diceOverlayEnabled').checked = enabled;
    $('#diceGravity').value = String(status.settings.gravity ?? 1);
    $('#diceMass').value = String(status.settings.mass ?? 1);
    $('#diceFriction').value = String(status.settings.friction ?? 0.8);
    $('#diceRestitution').value = String(status.settings.restitution ?? 0.1);
    $('#diceAngularDamping').value = String(status.settings.angularDamping ?? 0.4);
    $('#diceLinearDamping').value = String(status.settings.linearDamping ?? 0.5);
    $('#diceSpinForce').value = String(status.settings.spinForce ?? 6);
    $('#diceThrowForce').value = String(status.settings.throwForce ?? 5);
    $('#diceStartingHeight').value = String(status.settings.startingHeight ?? 8);
    $('#diceSettleTimeout').value = String(status.settings.settleTimeout ?? 5000);
    $('#diceDelayMs').value = String(status.settings.diceDelayMs ?? 10);
    $('#diceLightIntensity').value = String(status.settings.lightIntensity ?? 1);
    $('#diceEnableShadows').checked = status.settings.enableShadows !== false;
    $('#diceShadowTransparency').value = String(status.settings.shadowTransparency ?? 0.8);
    updateDicePickerAvailability();
  }

  function updateDicePickerAvailability() {
    const selected = state.diceOverlay?.themes?.find((theme) => theme.id === $('#diceTheme').value);
    const available = new Set(selected?.diceAvailable || ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']);
    document.querySelectorAll('[data-dice-sides]').forEach((button) => {
      const supported = available.has(`d${button.dataset.diceSides}`);
      button.disabled = !supported;
      button.title = supported ? '' : `${selected?.name || 'This theme'} does not include d${button.dataset.diceSides}.`;
    });
  }

  async function rollDiceOnStream(event) {
    event.preventDefault();
    const button = $('#rollDiceOnStream');
    button.disabled = true;
    button.textContent = 'Rolling…';
    try {
      state.diceOverlay = await api('/v1/dice-overlay/roll', { method: 'POST', body: {
        expression: $('#diceExpression').value,
        reason: $('#diceReason').value,
        rollerName: $('#diceRollerName').value
      } });
      renderDiceOverlay();
      toast(`${state.diceOverlay.roll.expression} rolled ${state.diceOverlay.roll.total} on stream.`);
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; button.textContent = 'Roll on Stream'; }
  }

  async function saveDiceOverlaySettings() {
    try {
      const result = await api('/v1/dice-overlay/settings', { method: 'POST', body: {
        enabled: $('#diceOverlayEnabled').checked,
        diceTheme: $('#diceTheme').value,
        theme: $('#diceColor').value,
        themeColor: $('#diceThemeColor').value,
        durationMs: Number($('#diceDuration').value),
        soundEnabled: $('#diceSoundEnabled').checked,
        showReason: $('#diceShowReason').checked,
        scalePercent: Number($('#diceScale').value),
        gravity: Number($('#diceGravity').value),
        mass: Number($('#diceMass').value),
        friction: Number($('#diceFriction').value),
        restitution: Number($('#diceRestitution').value),
        angularDamping: Number($('#diceAngularDamping').value),
        linearDamping: Number($('#diceLinearDamping').value),
        spinForce: Number($('#diceSpinForce').value),
        throwForce: Number($('#diceThrowForce').value),
        startingHeight: Number($('#diceStartingHeight').value),
        settleTimeout: Number($('#diceSettleTimeout').value),
        diceDelayMs: Number($('#diceDelayMs').value),
        lightIntensity: Number($('#diceLightIntensity').value),
        enableShadows: $('#diceEnableShadows').checked,
        shadowTransparency: Number($('#diceShadowTransparency').value)
      } });
      state.diceOverlay.settings = result.settings;
      await syncUnifiedModule('diceOverlay', result.settings.enabled !== false);
      renderDiceOverlay({ settings: true });
      toast('3D Dice appearance and physics saved.');
    } catch (error) { toast(error.message, true); }
  }

  async function testDiceAudio() {
    const button = $('#testDiceAudio');
    button.disabled = true;
    button.textContent = 'Testing…';
    try {
      const result = await api('/v1/dice-overlay/audio/test', { method: 'POST', body: {} });
      state.diceOverlay.audio = result.audio;
      renderDiceOverlay();
      toast(result.audio.state === 'ready' ? 'Dice sound was confirmed by the Browser Source.' : result.audio.error || 'Dice sound test failed.', result.audio.state !== 'ready');
    } catch (error) { toast(error.message, true); }
    finally { button.textContent = 'Test Dice Sound'; renderDiceOverlay(); }
  }

  async function importDiceTheme() {
    try {
      const imported = await window.tempestStudio.importDiceTheme();
      if (!imported) return;
      const refreshed = await api('/v1/dice-overlay/themes/refresh', { method: 'POST', body: {} });
      state.diceOverlay.themes = refreshed.themes;
      state.diceOverlay.settings.diceTheme = imported.id;
      renderDiceOverlay({ settings: true });
      $('#diceTheme').value = imported.id;
      toast(`${imported.name} imported with ${imported.diceAvailable.length} supported die types. Save Dice Setup to use it.`);
    } catch (error) { toast(error.message, true); }
  }

  function resetDicePhysics() {
    const defaults = { diceGravity: 1, diceMass: 1, diceFriction: 0.8, diceRestitution: 0.1, diceAngularDamping: 0.4, diceLinearDamping: 0.5, diceSpinForce: 6, diceThrowForce: 5, diceStartingHeight: 8, diceSettleTimeout: 5000, diceDelayMs: 10, diceLightIntensity: 1, diceShadowTransparency: 0.8 };
    for (const [id, value] of Object.entries(defaults)) $(`#${id}`).value = String(value);
    $('#diceEnableShadows').checked = true;
    toast('Dice physics controls reset. Save Dice Setup to apply them.');
  }

  async function clearDiceOverlay() {
    try {
      state.diceOverlay = await api('/v1/dice-overlay/clear', { method: 'POST', body: {} });
      renderDiceOverlay();
      toast('3D Dice Browser Source cleared.');
    } catch (error) { toast(error.message, true); }
  }

  function renderAll() {
    renderSafety();
    renderOverview();
    renderEvents();
    renderAlertHistory();
    renderSoundAlerts();
    renderAssetLibrary();
    renderDiceOverlay({ settings: true });
    renderVisualAlerts();
    renderChatOverlay({ settings: true });
    renderEmoteWall({ settings: true });
    renderTwitchExperiences({ settings: true });
    renderDiscordVoice({ settings: true });
    renderInteractiveStage();
    renderInteractiveWorld();
    renderWarudo();
    renderVTubeStudio();
    renderDualFormat();
    renderSimulcast();
    renderApi();
    renderTwitch();
    renderChatbot();
    renderAbout();
    renderUpdateStatus();
  }

  async function saveTwitchExtensionCompanions(event) {
    const inputs = [...document.querySelectorAll('input[name="twitchExtensionCompanion"]')];
    const companions = {
      schemaVersion: 1,
      mainframe: $('#twitchCompanionMainframe').checked,
      streaming: $('#twitchCompanionStreaming').checked
    };
    if (!companions.mainframe && !companions.streaming) {
      event.currentTarget.checked = true;
      return toast('Keep at least one Twitch companion Extension enabled.', true);
    }
    inputs.forEach((input) => { input.disabled = true; });
    $('#twitchExtensionEditionBadge').textContent = 'PUBLISHING';
    try {
      state.hostedExtension = await window.tempestStudio.setTwitchExtensionCompanions(companions);
      state.twitch = await api('/v1/integrations/twitch');
      renderHostedExtension();
      renderLocalExtension();
      const label = companions.mainframe && companions.streaming ? 'Both Twitch companions' : companions.mainframe ? 'Tempest Mainframe' : 'Tempest Streaming';
      toast(`${label} enabled and publishing.`);
    } catch (error) {
      state.hostedExtension = await window.tempestStudio.getHostedExtensionStatus().catch(() => state.hostedExtension);
      renderHostedExtension();
      renderLocalExtension();
      toast(error.message, true);
    } finally { inputs.forEach((input) => { input.disabled = false; }); }
  }

  function renderRuntimeSection(changedKeys) {
    const activeSection = document.querySelector('.page.active')?.id;
    const changed = (...keys) => !changedKeys || keys.some((key) => changedKeys.has(key));
    if (activeSection === 'overviewSection' && changed('runtimeSummary', 'events')) renderOverview();
    else if (activeSection === 'alertsSection' && changed('visualAlerts', 'twitchVisualAlerts', 'soundAlerts')) renderUnifiedAlerts();
    else if (activeSection === 'eventsSection') {
      if (!changed('events', 'alertHistory', 'alertDiagnostics')) return;
      renderEvents();
      renderAlertHistory();
    } else if (activeSection === 'soundalertsSection' && changed('visualAlerts', 'chatbot')) {
      if (changed('chatbot')) renderSoundAlerts();
      renderVisualAlertStatus();
    }
    else if (activeSection === 'assetsSection' && changed('assets', 'soundAlerts', 'twitchVisualAlerts')) renderAssetLibrary();
    else if (activeSection === 'diceSection' && changed('diceOverlay')) renderDiceOverlay();
    else if (activeSection === 'visualalertsSection' && changed('visualAlerts', 'twitchExperiences')) {
      renderVisualAlertStatus();
      renderTwitchExperiences();
    } else if (activeSection === 'chatoverlaySection' && changed('chatbot', 'chatOverlay', 'emoteWall')) {
      renderChatOverlay();
      renderEmoteWall();
    } else if (activeSection === 'discordvoiceSection' && changed('discordVoice', 'discordRpc')) renderDiscordVoice();
    else if (activeSection === 'worldSection' && changed('interactiveWorld')) renderInteractiveWorld();
    else if (activeSection === 'interactivestageSection' && changed('unifiedStage', 'interactiveStage', 'stageActors', 'interactionComposer')) renderInteractiveStage();
    else if (activeSection === 'twitchSection' && changed('localExtension', 'hostedExtension')) {
      renderLocalExtension();
      renderHostedExtension();
    } else if (activeSection === 'kickSection' && changed('kick', 'hostedExtension')) renderKick();
    else if (activeSection === 'chatbotSection' && changed('chatbot', 'kick')) renderChatbot();
    else if (activeSection === 'dualformatSection' && changed('runtimeSummary', 'visualAlerts')) renderDualFormat();
    else if (activeSection === 'simulcastSection' && changed('runtimeSummary')) renderSimulcast();
    else if (activeSection === 'apiSection' && changed('runtimeSummary', 'warudo', 'vtubeStudio')) {
      renderWarudo();
      renderVTubeStudio();
      renderApi();
    }
  }

  function runtimeRefreshTasks(activeSection) {
    const tasks = new Map([
      ['runtimeSummary', () => api('/v1/runtime-summary')]
    ]);
    const add = (key, loader) => { if (!tasks.has(key)) tasks.set(key, loader); };
    if (activeSection === 'overviewSection') add('events', () => api('/v1/events?limit=150'));
    else if (activeSection === 'alertsSection') {
      add('soundAlerts', () => api('/v1/sound-alerts'));
      add('visualAlerts', () => api('/v1/visual-alerts'));
      add('twitchVisualAlerts', () => api('/v1/visual-alerts/twitch'));
    }
    else if (activeSection === 'eventsSection') {
      add('events', () => api('/v1/events?limit=150'));
      add('alertHistory', () => api('/v1/alert-history?limit=200'));
      add('alertDiagnostics', () => api('/v1/alert-diagnostics'));
    } else if (activeSection === 'soundalertsSection') {
      add('visualAlerts', () => api('/v1/visual-alerts'));
      add('chatbot', () => api('/v1/chatbot'));
    }
    else if (activeSection === 'assetsSection') {
      add('assets', () => api('/v1/assets'));
      add('soundAlerts', () => api('/v1/sound-alerts'));
      add('twitchVisualAlerts', () => api('/v1/visual-alerts/twitch'));
    }
    else if (activeSection === 'diceSection') add('diceOverlay', () => api('/v1/dice-overlay'));
    else if (activeSection === 'visualalertsSection') {
      add('visualAlerts', () => api('/v1/visual-alerts'));
      add('twitchExperiences', () => api('/v1/twitch-experiences'));
    } else if (activeSection === 'chatoverlaySection') {
      add('chatbot', () => api('/v1/chatbot'));
      add('chatOverlay', () => api('/v1/chat-overlay'));
      add('emoteWall', () => api('/v1/emote-wall'));
    } else if (activeSection === 'discordvoiceSection') {
      add('discordVoice', () => api('/v1/discord-voice'));
      add('discordRpc', () => window.tempestStudio.getDiscordVoiceStatus());
    } else if (activeSection === 'worldSection') {
      add('interactiveWorld', () => api('/v1/interactive-world'));
    } else if (activeSection === 'interactivestageSection') {
      add('unifiedStage', () => api('/v1/unified-stage'));
      add('interactiveStage', () => api('/v1/interactive-stage'));
      add('stageActors', () => api('/v1/stage-actors'));
      add('interactionComposer', () => api('/v1/interaction-composer'));
    } else if (activeSection === 'twitchSection') {
      add('twitch', () => api('/v1/integrations/twitch'));
      add('extensionFeatures', () => api('/v1/extension-features'));
      add('localExtension', () => window.tempestStudio.getLocalExtensionStatus());
      add('hostedExtension', () => window.tempestStudio.getHostedExtensionStatus());
    } else if (activeSection === 'kickSection') {
      add('kick', () => api('/v1/integrations/kick'));
      add('hostedExtension', () => window.tempestStudio.getHostedExtensionStatus());
    } else if (activeSection === 'chatbotSection') {
      add('chatbot', () => api('/v1/chatbot'));
      add('kick', () => api('/v1/integrations/kick'));
    } else if (activeSection === 'dualformatSection') add('visualAlerts', () => api('/v1/visual-alerts'));
    else if (activeSection === 'apiSection') {
      add('warudo', () => window.tempestStudio.getWarudoStatus());
      add('vtubeStudio', () => window.tempestStudio.getVTubeStudioStatus());
    }
    if ($('#onboardingDialog').open) {
      add('chatbot', () => api('/v1/chatbot'));
      add('visualAlerts', () => api('/v1/visual-alerts'));
      add('chatOverlay', () => api('/v1/chat-overlay'));
      add('emoteWall', () => api('/v1/emote-wall'));
      add('twitchExperiences', () => api('/v1/twitch-experiences'));
    }
    return tasks;
  }

  async function refreshRuntime({ quiet = true } = {}) {
    if (fullRefreshPromise) {
      await fullRefreshPromise;
      return;
    }
    if (runtimeRefreshBusy) return;
    runtimeRefreshBusy = true;
    try {
      const activeSection = document.querySelector('.page.active')?.id || 'overviewSection';
      const entries = [...runtimeRefreshTasks(activeSection)];
      const results = await Promise.allSettled(entries.map(([, loader]) => loader()));
      const refreshed = {};
      const changedKeys = new Set();
      let optionalError;
      for (let index = 0; index < entries.length; index += 1) {
        const [key] = entries[index];
        const result = results[index];
        if (result.status === 'fulfilled') refreshed[key] = result.value;
        else if (key === 'runtimeSummary') throw result.reason;
        else optionalError ||= result.reason;
      }
      if (refreshed.runtimeSummary) {
        const summary = refreshed.runtimeSummary;
        state.health = summary.health;
        state.connections = summary.connections || [];
        state.dualFormat = summary.dualFormat;
        state.simulcast = summary.simulcast;
        state.runs = summary.runs || [];
        state.safety = summary.safety;
      }
      for (const [key, value] of Object.entries(refreshed)) {
        const signature = JSON.stringify(value);
        if (runtimeDataSignatures.get(key) !== signature) changedKeys.add(key);
        runtimeDataSignatures.set(key, signature);
      }
      if (refreshed.events) state.events = refreshed.events.events || [];
      if (refreshed.assets) state.assets = refreshed.assets.assets || [];
      if (refreshed.soundAlerts) state.soundAlerts = refreshed.soundAlerts;
      if (refreshed.twitchVisualAlerts) state.twitchVisualAlerts = refreshed.twitchVisualAlerts;
      for (const key of ['safety', 'twitch', 'chatbot', 'kick', 'visualAlerts', 'diceOverlay', 'chatOverlay', 'emoteWall', 'twitchExperiences', 'discordVoice', 'unifiedStage', 'interactiveStage', 'interactiveWorld', 'stageActors', 'interactionComposer', 'extensionFeatures', 'discordRpc', 'warudo', 'vtubeStudio', 'localExtension', 'hostedExtension', 'alertHistory', 'alertDiagnostics']) {
        if (Object.hasOwn(refreshed, key)) state[key] = refreshed[key];
      }
      renderBridgeStatus(true);
      if (changedKeys.has('runtimeSummary') || Number(state.safety?.activeRuns || 0) > 0) renderSafety();
      renderRuntimeSection(changedKeys);
      if (!quiet && optionalError) toast(optionalError?.message || 'The active workspace could not be fully refreshed.', true);
    } catch (error) {
      renderBridgeStatus(false);
      if (!quiet) toast(error.message, true);
    } finally { runtimeRefreshBusy = false; }
  }

  async function performFullRefresh({ quiet = false } = {}) {
    try {
      const tasks = new Map([
        ['runtimeSummary', () => api('/v1/runtime-summary')],
        ['applications', () => api('/v1/applications')],
        ['assets', () => api('/v1/assets')],
        ['workflows', () => api('/v1/workflows')],
        ['events', () => api('/v1/events?limit=150')],
        ['twitch', () => api('/v1/integrations/twitch')],
        ['kick', () => api('/v1/integrations/kick')],
        ['chatbot', () => api('/v1/chatbot')],
        ['soundAlerts', () => api('/v1/sound-alerts')],
        ['visualAlerts', () => api('/v1/visual-alerts')],
        ['twitchVisualAlerts', () => api('/v1/visual-alerts/twitch')],
        ['diceOverlay', () => api('/v1/dice-overlay')],
        ['chatOverlay', () => api('/v1/chat-overlay')],
        ['emoteWall', () => api('/v1/emote-wall')],
        ['twitchExperiences', () => api('/v1/twitch-experiences')],
        ['discordVoice', () => api('/v1/discord-voice')],
        ['unifiedStage', () => api('/v1/unified-stage')],
        ['interactiveStage', () => api('/v1/interactive-stage')],
        ['interactiveWorld', () => api('/v1/interactive-world')],
        ['stageActors', () => api('/v1/stage-actors')],
        ['interactionComposer', () => api('/v1/interaction-composer')],
        ['extensionFeatures', () => api('/v1/extension-features')],
        ['discordRpc', () => window.tempestStudio.getDiscordVoiceStatus()],
        ['warudo', () => window.tempestStudio.getWarudoStatus()],
        ['vtubeStudio', () => window.tempestStudio.getVTubeStudioStatus()],
        ['localExtension', () => window.tempestStudio.getLocalExtensionStatus()],
        ['hostedExtension', () => window.tempestStudio.getHostedExtensionStatus()],
        ['giphy', () => window.tempestStudio.getGiphyStatus()],
        ['alertHistory', () => api('/v1/alert-history?limit=200')],
        ['alertDiagnostics', () => api('/v1/alert-diagnostics')]
      ]);
      const entries = [...tasks];
      const results = await Promise.allSettled(entries.map(([, loader]) => loader()));
      const refreshed = {};
      let optionalError;
      for (let index = 0; index < entries.length; index += 1) {
        const [key] = entries[index];
        const result = results[index];
        if (result.status === 'fulfilled') refreshed[key] = result.value;
        else if (key === 'runtimeSummary') throw result.reason;
        else optionalError ||= result.reason;
      }
      const summary = refreshed.runtimeSummary;
      Object.assign(state, {
        health: summary.health,
        connections: summary.connections || [],
        dualFormat: summary.dualFormat,
        simulcast: summary.simulcast,
        runs: summary.runs || [],
        safety: summary.safety,
        ...(refreshed.applications ? { applications: refreshed.applications.applications || [] } : {}),
        ...(refreshed.assets ? { assets: refreshed.assets.assets || [] } : {}),
        ...(refreshed.workflows ? { workflows: refreshed.workflows.workflows || [] } : {}),
        ...(refreshed.events ? { events: refreshed.events.events || [] } : {})
      });
      for (const key of ['twitch', 'kick', 'chatbot', 'soundAlerts', 'visualAlerts', 'twitchVisualAlerts', 'diceOverlay', 'chatOverlay', 'emoteWall', 'twitchExperiences', 'discordVoice', 'unifiedStage', 'interactiveStage', 'interactiveWorld', 'stageActors', 'interactionComposer', 'extensionFeatures', 'discordRpc', 'warudo', 'vtubeStudio', 'localExtension', 'hostedExtension', 'giphy', 'alertHistory', 'alertDiagnostics']) {
        if (Object.hasOwn(refreshed, key)) state[key] = refreshed[key];
      }
      for (const [key, value] of Object.entries(refreshed)) runtimeDataSignatures.set(key, JSON.stringify(value));
      renderBridgeStatus(true);
      renderAll();
      if (!quiet && optionalError) toast(optionalError?.message || 'Some optional Studio services could not be refreshed.', true);
    } catch (error) {
      renderBridgeStatus(false);
      if (!quiet) toast(error.message, true);
    }
  }

  async function refresh(options = {}) {
    if (fullRefreshPromise) return fullRefreshPromise;
    const pending = performFullRefresh(options);
    fullRefreshPromise = pending;
    try {
      await pending;
    } finally {
      if (fullRefreshPromise === pending) fullRefreshPromise = null;
    }
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

  async function updateSoundAlert(id, patch, message) {
    try {
      const result = await api(`/v1/sound-alerts/${encodeURIComponent(id)}`, { method: 'POST', body: patch });
      const index = state.soundAlerts.alerts.findIndex((entry) => entry.id === id);
      if (index >= 0) state.soundAlerts.alerts[index] = result.alert;
      renderSoundAlerts();
      renderVisualAlerts();
      renderAssetLibrary();
      toast(message || `${result.alert.name} updated.`);
      return result.alert;
    } catch (error) { toast(error.message, true); return null; }
  }

  function alertKey(value) {
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  }

  function uniqueImportedAlertId(prefix, preferred, alerts) {
    const preferredKey = alertKey(String(preferred || '').replace(/^[^.]+\./, '')) || 'imported-alert';
    let id = `${prefix}.${preferredKey}`;
    let suffix = 2;
    while (alerts.some((entry) => entry.id === id || entry.cue === id)) id = `${prefix}.${preferredKey}-${suffix++}`;
    return id;
  }

  async function exportAlertPack(kind, id) {
    const alert = kind === 'interaction'
      ? state.soundAlerts.alerts.find((entry) => entry.id === id)
      : state.twitchVisualAlerts.alerts.find((entry) => entry.id === id);
    if (!alert) return toast('The alert could not be found.', true);
    try {
      const result = await window.tempestStudio.exportAlertPack({
        name: alert.name,
        description: kind === 'interaction' ? alert.description || 'Portable Interaction Alert.' : `Portable ${alert.topic} Twitch Alert.`,
        kind,
        alert
      });
      if (result) toast(`${alert.name} exported with ${result.assetCount} embedded media file${result.assetCount === 1 ? '' : 's'}.`);
    } catch (error) { toast(error.message, true); }
  }

  async function importAlertPack(expectedKind) {
    try {
      const imported = await window.tempestStudio.importAlertPack();
      if (!imported) return;
      const alert = imported.alert;
      if (imported.kind === 'interaction') {
        await registerManagedManifests(imported.assets);
        const id = uniqueImportedAlertId('sound-alert', alert.id || imported.name, state.soundAlerts.alerts);
        const result = await api('/v1/sound-alerts', { method: 'POST', body: { ...alert, id, cue: id, custom: undefined, updatedAt: undefined } });
        state.soundAlerts.alerts.push(result.alert);
        renderSoundAlerts();
        renderVisualAlerts();
        showSection('soundalerts');
        toast(`${imported.name} imported as ${result.alert.name} with ${imported.assetCount} verified media file${imported.assetCount === 1 ? '' : 's'}.`);
        return;
      }
      const subscriptionVariant = alert.topic === 'viewer.subscription.started' ? alert.variant || 'standard' : undefined;
      const existing = state.twitchVisualAlerts.alerts.find((entry) => entry.topic === alert.topic && (entry.topic !== 'viewer.subscription.started' || (entry.variant || 'standard') === subscriptionVariant));
      if (existing) {
        if (!confirm(`${existing.name} already handles ${alert.topic}${subscriptionVariant ? ` (${subscriptionVariant})` : ''}. Replace its design, media, timing, and variants with ${imported.name}?`)) return;
        await registerManagedManifests(imported.assets);
        await updateTwitchVisualAlert(existing.id, { enabled: alert.enabled !== false, durationMs: alert.durationMs, audioUri: alert.audioUri || null, volume: alert.volume, visualUri: alert.visualUri || null, accent: alert.accent, design: alert.design, alertVariants: alert.alertVariants || [] }, `${imported.name} imported into ${existing.name}.`);
      } else {
        await registerManagedManifests(imported.assets);
        const id = uniqueImportedAlertId('twitch', alert.id || imported.name, state.twitchVisualAlerts.alerts);
        const result = await api('/v1/visual-alerts/twitch', { method: 'POST', body: { ...alert, id, custom: undefined, updatedAt: undefined } });
        state.twitchVisualAlerts.alerts.push(result.alert);
        renderVisualAlerts();
        toast(`${imported.name} imported as a new Twitch Alert.`);
      }
      showSection('visualalerts');
      if (expectedKind && expectedKind !== imported.kind) toast(`${imported.name} is a ${imported.kind === 'twitch' ? 'Twitch' : 'Interaction'} pack, so Studio opened the matching section.`);
    } catch (error) { toast(error.message, true); }
  }

  async function exportStudioBackup() {
    try {
      const result = await window.tempestStudio.exportBackup(readOnboardingPreferences());
      if (result) toast(`Studio backup created with ${result.documentCount} configuration files and ${result.assetCount} alert media file${result.assetCount === 1 ? '' : 's'}.`);
    } catch (error) { toast(error.message, true); }
  }

  async function restoreStudioBackup() {
    try {
      const result = await window.tempestStudio.restoreBackup();
      if (!result) return;
      if (result.rendererSettings && typeof result.rendererSettings === 'object') localStorage.setItem(onboardingStorageKey, JSON.stringify(result.rendererSettings));
      toast(`Backup from Studio ${result.productVersion} restored. Restarting with the migrated configuration…`);
      setTimeout(() => window.tempestStudio.restartApp(), 900);
    } catch (error) { toast(`${error.message} Restart Studio if the local Bridge was already stopped.`, true); }
  }

  function updateInteractionCuePreview() {
    const key = alertKey($('#newInteractionAlertKey').value) || 'moonlight-dance';
    $('#newInteractionAlertCue').textContent = `sound-alert.${key}`;
  }

  function openInteractionAlertDialog() {
    $('#interactionAlertForm').reset();
    $('#newInteractionAlertKey').dataset.auto = 'true';
    $('#newInteractionWarudoOptions').hidden = true;
    $('#newInteractionVTubeStudioOptions').hidden = true;
    $('#newInteractionVTubeStudioHotkey').innerHTML = vtubeStudioHotkeyOptions();
    $('#newInteractionTempest2DOptions').hidden = true;
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
        vtubeStudioEnabled: $('#newInteractionVTubeStudioEnabled').checked,
        vtubeStudioHotkey: $('#newInteractionVTubeStudioHotkey').value,
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

  async function registerManagedSelection(selection) {
    if (!selection?.manifest) return selection;
    await registerManagedManifests([selection.manifest]);
    return selection;
  }

  async function assignSoundAlertAudio(id) {
    try {
      const selection = await window.tempestStudio.selectSoundAlertAudio();
      if (!selection) return;
      await registerManagedSelection(selection);
      await updateSoundAlert(id, { audioUri: selection.uri }, `${selection.name} assigned to the Interaction Alert sound.`);
    } catch (error) { toast(error.message, true); }
  }

  async function assignSoundAlertVisual(id) {
    try {
      const selection = await window.tempestStudio.selectSoundAlertVisual();
      if (!selection) return;
      await registerManagedSelection(selection);
      await updateSoundAlert(id, { visualUri: selection.uri }, `${selection.name} assigned to the Interaction Alert visual.`);
    } catch (error) { toast(error.message, true); }
  }

  async function updateTwitchVisualAlert(id, patch, message) {
    try {
      const result = await api(`/v1/visual-alerts/twitch/${encodeURIComponent(id)}`, { method: 'POST', body: patch });
      const index = state.twitchVisualAlerts.alerts.findIndex((entry) => entry.id === id);
      if (index >= 0) state.twitchVisualAlerts.alerts[index] = result.alert;
      renderVisualAlerts();
      renderAssetLibrary();
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

  function variantConditionChoices(topic) {
    if (topic === 'viewer.cheer.received') return [['bits', 'Bit amount']];
    if (topic === 'viewer.raid.received') return [['viewers', 'Raid viewers']];
    if (topic === 'viewer.subscription.started') return [['months', 'Subscribed months'], ['tier', 'Subscription tier']];
    if (topic === 'viewer.reward.redeemed') return [['reward-id', 'Specific reward ID'], ['reward-cost', 'Reward point cost']];
    return [];
  }

  function updateVariantConditionFields() {
    const type = $('#newVariantConditionType').value;
    const exact = type === 'tier' || type === 'reward-id';
    $('#newVariantMinimumLabel').hidden = exact;
    $('#newVariantMaximumLabel').hidden = exact;
    $('#newVariantExactLabel').hidden = !exact;
    $('#newVariantExactLabel').querySelector('span')?.remove();
    const exactInput = $('#newVariantExact');
    if (type === 'tier') exactInput.placeholder = 'prime, 1000, 2000, or 3000';
    else if (type === 'reward-id') exactInput.placeholder = 'Twitch reward ID';
    $('#newVariantMinimumLabel').firstChild.textContent = type === 'months' ? 'Minimum months' : type === 'viewers' ? 'Minimum viewers' : type === 'reward-cost' ? 'Minimum point cost' : 'Minimum Bits';
    $('#newVariantMaximumLabel').firstChild.textContent = 'Maximum (optional)';
  }

  function variantConditionFromForm() {
    const type = $('#newVariantConditionType').value;
    const minimum = Number($('#newVariantMinimum').value);
    const maximumValue = $('#newVariantMaximum').value;
    const maximum = maximumValue === '' ? undefined : Number(maximumValue);
    if (type === 'bits') return { minimumBits: minimum, ...(maximum === undefined ? {} : { maximumBits: maximum }) };
    if (type === 'viewers') return { minimumViewers: minimum, ...(maximum === undefined ? {} : { maximumViewers: maximum }) };
    if (type === 'months') return { minimumMonths: minimum, ...(maximum === undefined ? {} : { maximumMonths: maximum }) };
    if (type === 'reward-cost') return { minimumRewardCost: minimum, ...(maximum === undefined ? {} : { maximumRewardCost: maximum }) };
    if (type === 'tier') return { subscriptionTier: $('#newVariantExact').value.trim().toLowerCase() };
    if (type === 'reward-id') return { rewardId: $('#newVariantExact').value.trim() };
    throw new Error('This Twitch event does not expose a supported variant value.');
  }

  function variantConditionSummary(condition) {
    const range = (label, minimum, maximum) => minimum !== undefined && maximum !== undefined ? `${label} ${minimum}–${maximum}` : minimum !== undefined ? `${label} ≥ ${minimum}` : `${label} ≤ ${maximum}`;
    if (condition.minimumBits !== undefined || condition.maximumBits !== undefined) return range('Bits', condition.minimumBits, condition.maximumBits);
    if (condition.minimumViewers !== undefined || condition.maximumViewers !== undefined) return range('Raid viewers', condition.minimumViewers, condition.maximumViewers);
    if (condition.minimumMonths !== undefined || condition.maximumMonths !== undefined) return range('Subscribed months', condition.minimumMonths, condition.maximumMonths);
    if (condition.minimumRewardCost !== undefined || condition.maximumRewardCost !== undefined) return range('Reward cost', condition.minimumRewardCost, condition.maximumRewardCost);
    if (condition.subscriptionTier) return `Tier is ${condition.subscriptionTier === 'prime' ? 'Prime' : condition.subscriptionTier}`;
    if (condition.rewardId) return `Reward ID is ${condition.rewardId}`;
    return 'No matching rule';
  }

  function variantConditionType(condition) {
    if (condition.minimumBits !== undefined || condition.maximumBits !== undefined) return 'bits';
    if (condition.minimumViewers !== undefined || condition.maximumViewers !== undefined) return 'viewers';
    if (condition.minimumMonths !== undefined || condition.maximumMonths !== undefined) return 'months';
    if (condition.minimumRewardCost !== undefined || condition.maximumRewardCost !== undefined) return 'reward-cost';
    if (condition.subscriptionTier) return 'tier';
    return 'reward-id';
  }

  function resetVariantRuleForm(alert) {
    $('#newVariantEditId').value = '';
    $('#newVariantName').value = '';
    $('#newVariantName').placeholder = alert.topic === 'viewer.cheer.received' ? 'Mega Cheer' : alert.topic === 'viewer.raid.received' ? 'Raid Party' : alert.topic === 'viewer.subscription.started' ? 'One Year Subscriber' : 'Premium Reward';
    $('#newVariantMinimum').value = alert.topic === 'viewer.raid.received' ? '50' : alert.topic === 'viewer.subscription.started' ? '12' : alert.topic === 'viewer.reward.redeemed' ? '10000' : '1000';
    $('#newVariantMaximum').value = '';
    $('#newVariantExact').value = '';
    $('#newVariantPriority').value = '0';
    $('#saveVariantRule').textContent = 'Create Variant';
    $('#cancelVariantEdit').hidden = true;
    updateVariantConditionFields();
  }

  function renderTwitchVariants(alertId) {
    const alert = state.twitchVisualAlerts.alerts.find((entry) => entry.id === alertId);
    if (!alert) return;
    const variants = [...(alert.alertVariants || [])].sort((left, right) => right.priority - left.priority);
    const list = $('#twitchVariantList');
    list.classList.toggle('empty-state', !variants.length);
    list.innerHTML = variants.length ? variants.map((variant) => `<article class="twitch-variant-card ${variant.enabled ? '' : 'disabled'}" style="--alert-accent:${escapeHtml(variant.accent)}">
      <div class="variant-card-head"><div><span>PRIORITY ${variant.priority}</span><h3>${escapeHtml(variant.name)}</h3><p>${escapeHtml(variantConditionSummary(variant.condition))}</p></div><b>${variant.enabled ? 'ACTIVE' : 'OFF'}</b></div>
      <div class="alert-media-summary"><div class="alert-media-slot"><span>SOUND</span><strong>${escapeHtml(soundAlertAudioName(variant.audioUri))}</strong></div><div class="alert-media-slot"><span>VISUAL</span><strong>${escapeHtml(soundAlertVisualName(variant.visualUri))}</strong></div></div>
      <div class="variant-settings-grid"><label>Priority<input data-variant-priority="${escapeHtml(variant.id)}" type="number" min="-1000" max="1000" value="${variant.priority}" /></label><label>Maximum runtime<input data-variant-duration="${escapeHtml(variant.id)}" type="number" min="1" max="60" value="${Math.round(variant.durationMs / 1000)}" /><small>seconds</small></label><label>Volume<input data-variant-volume="${escapeHtml(variant.id)}" type="number" min="0" max="100" value="${Math.round(variant.volume * 100)}" /><small>percent</small></label><label>Accent<input data-variant-accent="${escapeHtml(variant.id)}" type="color" value="${escapeHtml(variant.accent)}" /></label></div>
      <div class="variant-card-actions"><button type="button" data-variant-edit="${escapeHtml(variant.id)}" data-parent-alert="${escapeHtml(alert.id)}">Edit Rule</button><button type="button" data-variant-save="${escapeHtml(variant.id)}" data-parent-alert="${escapeHtml(alert.id)}">Save Settings</button><button type="button" data-variant-design="${escapeHtml(variant.id)}" data-parent-alert="${escapeHtml(alert.id)}">Design</button><button type="button" data-variant-audio="${escapeHtml(variant.id)}" data-parent-alert="${escapeHtml(alert.id)}">Assign Sound</button><button type="button" data-variant-visual="${escapeHtml(variant.id)}" data-parent-alert="${escapeHtml(alert.id)}">Assign Visual</button><button type="button" data-giphy-alert-target="twitch-variant|${escapeHtml(alert.id)}|${escapeHtml(variant.id)}">GIPHY Visual</button><button type="button" data-variant-toggle="${escapeHtml(variant.id)}" data-parent-alert="${escapeHtml(alert.id)}">${variant.enabled ? 'Disable' : 'Enable'}</button><button type="button" class="primary-button" data-variant-preview="${escapeHtml(variant.id)}" data-parent-alert="${escapeHtml(alert.id)}">Preview</button><button type="button" class="danger-outline" data-variant-delete="${escapeHtml(variant.id)}" data-parent-alert="${escapeHtml(alert.id)}">Delete</button></div>
    </article>`).join('') : 'No variants yet. The base alert handles every event.';
  }

  function openTwitchVariantManager(alertId) {
    const alert = state.twitchVisualAlerts.alerts.find((entry) => entry.id === alertId);
    if (!alert) return;
    $('#twitchVariantAlertId').value = alert.id;
    $('#twitchVariantTitle').textContent = `${alert.name} Variants`;
    const choices = variantConditionChoices(alert.topic);
    $('#newVariantConditionType').innerHTML = choices.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    $('#twitchVariantHelp').textContent = choices.length ? 'Higher priority matching rules play first. If none match, Studio plays the base alert.' : 'This event has no amount, tier, tenure, raid-size, or reward field available for a reliable variant rule.';
    $('#twitchVariantForm').querySelector('.variant-create-panel').classList.toggle('unavailable', !choices.length);
    $('#twitchVariantForm').querySelector('.variant-create-panel button[type="submit"]').disabled = !choices.length;
    resetVariantRuleForm(alert);
    renderTwitchVariants(alert.id);
    $('#twitchVariantDialog').showModal();
  }

  async function createTwitchVariant(event) {
    event.preventDefault();
    const alertId = $('#twitchVariantAlertId').value;
    const alert = state.twitchVisualAlerts.alerts.find((entry) => entry.id === alertId);
    if (!alert) return;
    try {
      const name = $('#newVariantName').value.trim();
      const editId = $('#newVariantEditId').value;
      let variants;
      let message;
      if (editId) {
        variants = (alert.alertVariants || []).map((variant) => variant.id === editId ? { ...variant, name, priority: Number($('#newVariantPriority').value), condition: variantConditionFromForm() } : variant);
        message = `${name} matching rule updated.`;
      } else {
        const stem = alertKey(name) || 'variant';
        let id = stem;
        let suffix = 2;
        while ((alert.alertVariants || []).some((entry) => entry.id === id)) id = `${stem}-${suffix++}`;
        const variant = { schemaVersion: 1, id, name, enabled: true, priority: Number($('#newVariantPriority').value), condition: variantConditionFromForm(), durationMs: alert.durationMs, audioUri: alert.audioUri, volume: alert.volume, visualUri: alert.visualUri, accent: alert.accent, design: structuredClone(alert.design || defaultTwitchDesign()) };
        variants = [...(alert.alertVariants || []), variant];
        message = `${name} variant created from the base alert.`;
      }
      const updated = await updateTwitchVisualAlert(alert.id, { alertVariants: variants }, message);
      if (updated) { renderTwitchVariants(updated.id); resetVariantRuleForm(updated); }
    } catch (error) { toast(error.message, true); }
  }

  function beginEditTwitchVariant(alertId, variantId) {
    const alert = state.twitchVisualAlerts.alerts.find((entry) => entry.id === alertId);
    const variant = alert?.alertVariants?.find((entry) => entry.id === variantId);
    if (!alert || !variant) return;
    const type = variantConditionType(variant.condition);
    $('#newVariantEditId').value = variant.id;
    $('#newVariantName').value = variant.name;
    $('#newVariantConditionType').value = type;
    updateVariantConditionFields();
    const minimum = type === 'bits' ? variant.condition.minimumBits : type === 'viewers' ? variant.condition.minimumViewers : type === 'months' ? variant.condition.minimumMonths : variant.condition.minimumRewardCost;
    const maximum = type === 'bits' ? variant.condition.maximumBits : type === 'viewers' ? variant.condition.maximumViewers : type === 'months' ? variant.condition.maximumMonths : variant.condition.maximumRewardCost;
    $('#newVariantMinimum').value = minimum ?? '0';
    $('#newVariantMaximum').value = maximum ?? '';
    $('#newVariantExact').value = type === 'tier' ? variant.condition.subscriptionTier || '' : type === 'reward-id' ? variant.condition.rewardId || '' : '';
    $('#newVariantPriority').value = String(variant.priority);
    $('#saveVariantRule').textContent = 'Save Matching Rule';
    $('#cancelVariantEdit').hidden = false;
    $('#newVariantName').focus();
    $('#twitchVariantForm').querySelector('.variant-create-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  async function updateTwitchVariant(alertId, variantId, changes, message) {
    const alert = state.twitchVisualAlerts.alerts.find((entry) => entry.id === alertId);
    if (!alert) return null;
    const variants = (alert.alertVariants || []).map((variant) => variant.id === variantId ? { ...variant, ...changes } : variant);
    const updated = await updateTwitchVisualAlert(alert.id, { alertVariants: variants }, message);
    if (updated && $('#twitchVariantDialog').open) renderTwitchVariants(updated.id);
    return updated;
  }

  async function saveTwitchVariantSettings(alertId, variantId) {
    const selectorId = CSS.escape(variantId);
    return updateTwitchVariant(alertId, variantId, { priority: Number(document.querySelector(`[data-variant-priority="${selectorId}"]`).value), durationMs: Math.round(Number(document.querySelector(`[data-variant-duration="${selectorId}"]`).value) * 1000), volume: Number(document.querySelector(`[data-variant-volume="${selectorId}"]`).value) / 100, accent: document.querySelector(`[data-variant-accent="${selectorId}"]`).value }, 'Variant timing, priority, sound level, and accent saved.');
  }

  async function assignTwitchVariantAsset(alertId, variantId, kind) {
    try {
      const selection = kind === 'audio' ? await window.tempestStudio.selectSoundAlertAudio() : await window.tempestStudio.selectSoundAlertVisual();
      if (!selection) return;
      await registerManagedSelection(selection);
      await updateTwitchVariant(alertId, variantId, { [kind === 'audio' ? 'audioUri' : 'visualUri']: selection.uri }, `${selection.name} assigned to the variant ${kind === 'audio' ? 'sound' : 'visual'}.`);
    } catch (error) { toast(error.message, true); }
  }

  async function deleteTwitchVariant(alertId, variantId) {
    const alert = state.twitchVisualAlerts.alerts.find((entry) => entry.id === alertId);
    const variant = alert?.alertVariants?.find((entry) => entry.id === variantId);
    if (!alert || !variant || !confirm(`Delete the ${variant.name} variant? Assigned local files will not be deleted.`)) return;
    await updateTwitchVisualAlert(alert.id, { alertVariants: alert.alertVariants.filter((entry) => entry.id !== variantId) }, `${variant.name} variant deleted.`);
    renderTwitchVariants(alert.id);
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
      await registerManagedSelection(selection);
      await updateTwitchVisualAlert(id, { visualUri: selection.uri }, `${selection.name} assigned to the Twitch Alert.`);
    } catch (error) { toast(error.message, true); }
  }

  async function assignTwitchAlertAudio(id) {
    try {
      const selection = await window.tempestStudio.selectSoundAlertAudio();
      if (!selection) return;
      await registerManagedSelection(selection);
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
      headlineTemplate: '{event}', detailTemplate: 'Triggered by {viewer}', showEyebrow: true, showHeadline: true, showDetail: true, showViewerMessage: true,
      fontFamily: 'Inter', fontSize: 42, eyebrowFontSize: 13, detailFontSize: 21, messageFontSize: 16, fontWeight: 800, textAlign: 'left', textColor: '#F5FBFF', secondaryTextColor: '#A9BDC7', eyebrowTextColor: '#54F2EB', messageTextColor: '#F5FBFF', textShadow: 0.35, letterSpacing: 0,
      textOffsetX: 0, textOffsetY: 0, textPositionX: 50, textPositionY: 72, eyebrowPositionX: 50, eyebrowPositionY: 52, headlinePositionX: 50, headlinePositionY: 63, detailPositionX: 50, detailPositionY: 74, messagePositionX: 50, messagePositionY: 84, eyebrowMaxWidth: 1000, headlineMaxWidth: 1800, detailMaxWidth: 1600, messageMaxWidth: 1600, cardWidth: 900, backgroundColor: '#050C13', backgroundOpacity: 0.94, borderWidth: 1, borderRadius: 24, padding: 22, cardShadow: 0.55,
      mediaWidth: 320, mediaHeight: 210, mediaFit: 'contain', mediaScale: 1, mediaPositionX: 50, mediaPositionY: 50, mediaOpacity: 1, mediaBorderRadius: 16, mediaDelayMs: 0, textDelayMs: 0, textDurationMs: 0, soundDelayMs: 0,
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

  function alertPlacementFromDesign(design) {
    return {
      position: design.position,
      positionOffsetX: Number(design.positionOffsetX) || 0,
      positionOffsetY: Number(design.positionOffsetY) || 0,
      customPositionX: Number(design.customPositionX),
      customPositionY: Number(design.customPositionY),
      scale: Number(design.scale)
    };
  }

  function alertPlacementFromControls() {
    return {
      position: $('#twitchDesignPosition').value,
      positionOffsetX: Number($('#twitchDesignPositionX').value),
      positionOffsetY: Number($('#twitchDesignPositionY').value),
      customPositionX: Number($('#twitchDesignCustomX').value),
      customPositionY: Number($('#twitchDesignCustomY').value),
      scale: Number($('#twitchDesignScale').value) / 100
    };
  }

  function applyAlertPlacementToControls(placement) {
    $('#twitchDesignPosition').value = placement.position;
    $('#twitchDesignPositionX').value = placement.positionOffsetX;
    $('#twitchDesignPositionY').value = placement.positionOffsetY;
    $('#twitchDesignCustomX').value = placement.customPositionX;
    $('#twitchDesignCustomY').value = placement.customPositionY;
    $('#twitchDesignScale').value = Math.round(placement.scale * 100);
  }

  function sameAlertPlacement(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function availableAlertSceneNames() {
    const inventory = broadcastSourceInventory();
    const names = [...(inventory.scenes || []), inventory.currentScene, ...alertDesignScenePlacements.map((entry) => entry.sceneName)].filter(Boolean);
    const unique = new Map();
    for (const name of names) if (!unique.has(name.toLocaleLowerCase())) unique.set(name.toLocaleLowerCase(), name);
    return [...unique.values()].sort((left, right) => left.localeCompare(right));
  }

  function alertScenePlacement(sceneName) {
    const normalized = sceneName.toLocaleLowerCase();
    return alertDesignScenePlacements.find((entry) => entry.sceneName.toLocaleLowerCase() === normalized);
  }

  function captureAlertScenePlacement() {
    if (!alertDesignBasePlacement) return;
    const placement = alertPlacementFromControls();
    if (!alertDesignSceneScope) {
      alertDesignBasePlacement = placement;
      return;
    }
    const index = alertDesignScenePlacements.findIndex((entry) => entry.sceneName.toLocaleLowerCase() === alertDesignSceneScope.toLocaleLowerCase());
    if (index >= 0) alertDesignScenePlacements[index] = { sceneName: alertDesignSceneScope, ...placement };
    else if (!sameAlertPlacement(placement, alertDesignBasePlacement)) alertDesignScenePlacements.push({ sceneName: alertDesignSceneScope, ...placement });
  }

  function renderAlertScenePlacementControls() {
    const inventory = broadcastSourceInventory();
    const names = availableAlertSceneNames();
    const select = $('#alertDesignSceneScope');
    select.innerHTML = '<option value="">All scenes · default</option>' + names.map((name) => `<option value="${escapeHtml(name)}">${name === inventory.currentScene ? 'Current · ' : ''}${escapeHtml(name)}</option>`).join('');
    if (alertDesignSceneScope && names.some((name) => name.toLocaleLowerCase() === alertDesignSceneScope.toLocaleLowerCase())) select.value = names.find((name) => name.toLocaleLowerCase() === alertDesignSceneScope.toLocaleLowerCase());
    else { alertDesignSceneScope = ''; select.value = ''; }
    $('#useCurrentAlertScene').disabled = !inventory.currentScene;
    const existing = alertDesignSceneScope ? alertScenePlacement(alertDesignSceneScope) : undefined;
    $('#removeAlertScenePlacement').disabled = !existing;
    $('#alertDesignSceneStatus').textContent = !alertDesignSceneScope
      ? 'Default placement used by every scene without an override.'
      : existing
        ? `${alertDesignSceneScope} has its own placement. Alert styling stays shared.`
        : `Move or resize the alert to create a placement for ${alertDesignSceneScope}.`;
  }

  function switchAlertScenePlacement(sceneName) {
    captureAlertScenePlacement();
    alertDesignSceneScope = sceneName || '';
    const placement = alertDesignSceneScope ? alertScenePlacement(alertDesignSceneScope) || alertDesignBasePlacement : alertDesignBasePlacement;
    applyAlertPlacementToControls(placement);
    renderAlertScenePlacementControls();
    updateTwitchPlacementPreview();
  }

  function useCurrentAlertScene() {
    const sceneName = broadcastSourceInventory().currentScene;
    if (!sceneName) return toast('Broadcast is not reporting an active scene yet.', true);
    switchAlertScenePlacement(sceneName);
    pushAlertDesignHistory();
  }

  function removeCurrentAlertScenePlacement() {
    if (!alertDesignSceneScope) return;
    alertDesignScenePlacements = alertDesignScenePlacements.filter((entry) => entry.sceneName.toLocaleLowerCase() !== alertDesignSceneScope.toLocaleLowerCase());
    applyAlertPlacementToControls(alertDesignBasePlacement);
    renderAlertScenePlacementControls();
    updateTwitchPlacementPreview();
    pushAlertDesignHistory();
  }

  function populateTwitchDesign(designValue) {
    const design = { ...defaultCurrentAlertDesign(), ...(designValue || {}) };
    alertDesignBasePlacement = alertPlacementFromDesign(design);
    alertDesignScenePlacements = structuredClone(design.scenePlacements || []);
    const currentScene = broadcastSourceInventory().currentScene;
    const requestedScope = alertDesignSceneScope;
    alertDesignSceneScope = requestedScope && availableAlertSceneNames().some((name) => name.toLocaleLowerCase() === requestedScope.toLocaleLowerCase())
      ? requestedScope
      : currentScene && alertScenePlacement(currentScene) ? currentScene : '';
    const displayedPlacement = alertDesignSceneScope ? alertScenePlacement(alertDesignSceneScope) || alertDesignBasePlacement : alertDesignBasePlacement;
    $('#twitchDesignPreset').value = design.preset;
    $('#twitchDesignLayout').value = design.layout;
    applyAlertPlacementToControls(displayedPlacement);
    $('#twitchDesignEntrance').value = design.entranceAnimation;
    $('#twitchDesignExit').value = design.exitAnimation;
    $('#twitchDesignTextAnimation').value = design.textAnimation;
    $('#twitchDesignHeadline').value = design.headlineTemplate;
    $('#twitchDesignDetail').value = design.detailTemplate;
    $('#twitchDesignShowEyebrow').checked = design.showEyebrow;
    $('#twitchDesignShowHeadline').checked = design.showHeadline;
    $('#twitchDesignShowDetail').checked = design.showDetail;
    $('#twitchDesignShowMessage').checked = design.showViewerMessage;
    $('#twitchDesignFont').value = design.fontFamily;
    $('#twitchDesignFontSize').value = design.fontSize;
    $('#twitchDesignHeadlineFontSize').value = design.fontSize;
    $('#twitchDesignEyebrowFontSize').value = design.eyebrowFontSize;
    $('#twitchDesignDetailFontSize').value = design.detailFontSize;
    $('#twitchDesignMessageFontSize').value = design.messageFontSize;
    $('#twitchDesignFontWeight').value = design.fontWeight;
    $('#twitchDesignTextAlign').value = design.textAlign;
    $('#twitchDesignTextColor').value = design.textColor;
    $('#twitchDesignSecondaryColor').value = design.secondaryTextColor;
    $('#twitchDesignHeadlineColor').value = design.textColor;
    $('#twitchDesignDetailColor').value = design.secondaryTextColor;
    $('#twitchDesignEyebrowColor').value = design.eyebrowTextColor;
    $('#twitchDesignMessageColor').value = design.messageTextColor;
    $('#twitchDesignTextShadow').value = Math.round(design.textShadow * 100);
    $('#twitchDesignLetterSpacing').value = design.letterSpacing;
    $('#twitchDesignTextX').value = design.textOffsetX;
    $('#twitchDesignTextY').value = design.textOffsetY;
    $('#twitchDesignTextPositionX').value = design.textPositionX;
    $('#twitchDesignTextPositionY').value = design.textPositionY;
    $('#twitchDesignEyebrowX').value = design.eyebrowPositionX;
    $('#twitchDesignEyebrowY').value = design.eyebrowPositionY;
    $('#twitchDesignHeadlineX').value = design.headlinePositionX;
    $('#twitchDesignHeadlineY').value = design.headlinePositionY;
    $('#twitchDesignDetailX').value = design.detailPositionX;
    $('#twitchDesignDetailY').value = design.detailPositionY;
    $('#twitchDesignMessageX').value = design.messagePositionX;
    $('#twitchDesignMessageY').value = design.messagePositionY;
    $('#twitchDesignEyebrowMaxWidth').value = design.eyebrowMaxWidth;
    $('#twitchDesignHeadlineMaxWidth').value = design.headlineMaxWidth;
    $('#twitchDesignDetailMaxWidth').value = design.detailMaxWidth;
    $('#twitchDesignMessageMaxWidth').value = design.messageMaxWidth;
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
    $('#twitchDesignMediaScale').value = Math.round(design.mediaScale * 100);
    $('#twitchDesignMediaPositionX').value = design.mediaPositionX;
    $('#twitchDesignMediaPositionY').value = design.mediaPositionY;
    $('#twitchDesignMediaOpacity').value = Math.round(design.mediaOpacity * 100);
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
    renderAlertScenePlacementControls();
    switchAlertCodeTab('html');
    updateTwitchPlacementPreview();
  }

  function twitchAnchorCoordinates(position) {
    const horizontal = position.endsWith('left') ? 12 : position.endsWith('right') ? 88 : 50;
    const vertical = position.startsWith('top') ? 17 : position.startsWith('bottom') ? 82 : 50;
    return { x: horizontal, y: vertical };
  }

  function renderAlertDesignerMedia() {
    const container = $('#twitchPlacementMockMedia');
    if (!container) return;
    const uri = activeAlertDesignAssets.visualUri;
    if (!uri) {
      container.innerHTML = '<span>NO VISUAL ASSIGNED</span>';
      return;
    }
    const video = /\.(?:mp4|webm)(?:$|\?)/i.test(uri);
    const element = document.createElement(video ? 'video' : 'img');
    element.src = uri;
    if (video) {
      element.autoplay = true;
      element.loop = true;
      element.muted = true;
      element.playsInline = true;
    }
    container.replaceChildren(element);
  }

  const layerControlIds = {
    eyebrow: ['#twitchDesignEyebrowX', '#twitchDesignEyebrowY', '#twitchDesignShowEyebrow'],
    headline: ['#twitchDesignHeadlineX', '#twitchDesignHeadlineY', '#twitchDesignShowHeadline'],
    detail: ['#twitchDesignDetailX', '#twitchDesignDetailY', '#twitchDesignShowDetail'],
    message: ['#twitchDesignMessageX', '#twitchDesignMessageY', '#twitchDesignShowMessage']
  };

  function alertDesignerPreviewVariables() {
    const viewer = $('#alertDesignPreviewViewer').value || 'Studio Operator';
    return { viewer, name: viewer, event: $('#twitchDesignTitle').textContent.replace(/\s+Design$/, '') || 'Alert', amount: $('#alertDesignPreviewAmount').value || '100', message: $('#alertDesignPreviewMessage').value || '', reward: 'Sample Reward', tier: 'Tier 1', months: '3', topic: 'viewer.event' };
  }

  function renderAlertDesignerTemplate(value) {
    const variables = alertDesignerPreviewVariables();
    return String(value || '').replace(/\{([a-z]+)\}/gi, (_match, key) => variables[String(key).toLowerCase()] ?? '');
  }

  function positionDesignerLayer(layer, x, y) {
    const controls = layerControlIds[layer];
    if (!controls) return;
    $(controls[0]).value = Math.min(100, Math.max(0, x)).toFixed(1);
    $(controls[1]).value = Math.min(100, Math.max(0, y)).toFixed(1);
    updateTwitchPlacementPreview();
  }

  function alertPlacementLimits() {
    const canvas = $('#twitchPlacementCanvas');
    const mock = $('#twitchPlacementMock');
    const canvasBounds = canvas.getBoundingClientRect();
    const mockBounds = mock.getBoundingClientRect();
    if (!canvasBounds.width || !canvasBounds.height) return { minimumX: 0, maximumX: 100, minimumY: 0, maximumY: 100 };
    const halfWidth = Math.min(50, mockBounds.width / canvasBounds.width * 50);
    const halfHeight = Math.min(50, mockBounds.height / canvasBounds.height * 50);
    return { minimumX: halfWidth, maximumX: 100 - halfWidth, minimumY: halfHeight, maximumY: 100 - halfHeight };
  }

  function snapAlertCoordinate(value, minimum, maximum) {
    const clamped = Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : 50));
    const step = Number($('#twitchDesignSnap').value) || 0;
    if (!step) return clamped;
    let snapped = Math.round(clamped / step) * step;
    const magneticThreshold = Math.max(1.25, step * 0.55);
    for (const target of [minimum, 50, maximum]) {
      if (Math.abs(clamped - target) <= magneticThreshold) {
        snapped = target;
        break;
      }
    }
    return Math.min(maximum, Math.max(minimum, snapped));
  }

  function updateAlertSnapGuides(x, y) {
    $('#twitchPlacementGuideX').classList.toggle('visible', Math.abs(x - 50) < 0.05);
    $('#twitchPlacementGuideY').classList.toggle('visible', Math.abs(y - 50) < 0.05);
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
    const canvasProfile = activeCanvasProfile();
    x += Number($('#twitchDesignPositionX').value || 0) / canvasProfile.baseWidth * 100;
    y += Number($('#twitchDesignPositionY').value || 0) / canvasProfile.baseHeight * 100;
    x = Math.min(100, Math.max(0, Number.isFinite(x) ? x : 50));
    y = Math.min(100, Math.max(0, Number.isFinite(y) ? y : 50));
    const scalePercent = Math.min(200, Math.max(25, Number($('#twitchDesignScale').value) || 100));
    const baseCanvasWidth = canvasProfile.baseWidth;
    const baseCanvasHeight = canvasProfile.baseHeight;
    canvas.style.aspectRatio = `${baseCanvasWidth} / ${baseCanvasHeight}`;
    $('#alertDesignerCanvasProfile').textContent = `${baseCanvasWidth} × ${baseCanvasHeight} · ${canvasAspectLabel(canvasProfile)} BROWSER SOURCE${canvasProfile.source === 'broadcast' ? ' · LIVE' : ''}`;
    const canvasWidth = canvas.clientWidth || 920;
    const overlayLayout = $('#twitchDesignLayout').value === 'media-overlay';
    const cardWidth = overlayLayout
      ? Math.min(2400, Math.max(40, Number($('#twitchDesignMediaWidth').value) || 320))
      : Math.min(2600, Math.max(280, Number($('#twitchDesignCardWidth').value) || 900));
    const previewWidth = Math.min(canvasWidth * 0.88, Math.max(90, canvasWidth * cardWidth / baseCanvasWidth));
    mock.style.left = `${x}%`;
    mock.style.top = `${y}%`;
    mock.style.width = `${previewWidth}px`;
    mock.style.aspectRatio = overlayLayout ? `${Math.max(40, Number($('#twitchDesignMediaWidth').value) || 320)} / ${Math.max(40, Number($('#twitchDesignMediaHeight').value) || 210)}` : '';
    mock.classList.toggle('media-overlay', overlayLayout);
    mock.style.setProperty('--mock-media-fit', $('#twitchDesignMediaFit').value);
    mock.style.setProperty('--mock-media-scale', Number($('#twitchDesignMediaScale').value) / 100);
    mock.style.setProperty('--mock-media-position-x', `${Number($('#twitchDesignMediaPositionX').value)}%`);
    mock.style.setProperty('--mock-media-position-y', `${Number($('#twitchDesignMediaPositionY').value)}%`);
    mock.style.setProperty('--mock-media-opacity', Number($('#twitchDesignMediaOpacity').value) / 100);
    mock.style.setProperty('--mock-font', $('#twitchDesignFont').value);
    mock.style.setProperty('--mock-text-align', $('#twitchDesignTextAlign').value);
    for (const [layer, controls] of Object.entries(layerControlIds)) {
      const element = mock.querySelector(`[data-design-layer="${layer}"]`);
      const layerX = Math.min(100, Math.max(0, Number($(controls[0]).value) || 50));
      const layerY = Math.min(100, Math.max(0, Number($(controls[1]).value) || 50));
      element.style.setProperty('--layer-x', `${layerX}%`);
      element.style.setProperty('--layer-y', `${layerY}%`);
      element.hidden = !$(controls[2]).checked;
    }
    const layerStyles = {
      eyebrow: ['#twitchDesignEyebrowFontSize', '#twitchDesignEyebrowColor', '#twitchDesignEyebrowMaxWidth'],
      headline: ['#twitchDesignHeadlineFontSize', '#twitchDesignHeadlineColor', '#twitchDesignHeadlineMaxWidth'],
      detail: ['#twitchDesignDetailFontSize', '#twitchDesignDetailColor', '#twitchDesignDetailMaxWidth'],
      message: ['#twitchDesignMessageFontSize', '#twitchDesignMessageColor', '#twitchDesignMessageMaxWidth']
    };
    for (const [layer, controls] of Object.entries(layerStyles)) {
      const element = mock.querySelector(`[data-design-layer="${layer}"]`);
      element.style.fontSize = `${Math.max(6, Number($(controls[0]).value) * canvasWidth / baseCanvasWidth)}px`;
      element.style.color = $(controls[1]).value;
      element.style.maxWidth = `${Math.max(30, Number($(controls[2]).value) * canvasWidth / baseCanvasWidth)}px`;
    }
    mock.style.transform = `translate(-50%, -50%) scale(${scalePercent / 100})`;
    $('#twitchDesignScaleValue').textContent = `${Math.round(scalePercent)}%`;
    $('#twitchPlacementReadout').textContent = `X ${x.toFixed(1)}% · Y ${y.toFixed(1)}% · Size ${Math.round(scalePercent)}%`;
    $('#twitchPlacementMockEyebrow').textContent = $('#alertDesignKind').value === 'interaction' ? 'TEMPEST INTERACTION ALERT' : 'TEMPEST TWITCH ALERT';
    $('#twitchPlacementMockTitle').textContent = renderAlertDesignerTemplate($('#twitchDesignHeadline').value) || 'Alert';
    $('#twitchPlacementMockDetail').textContent = renderAlertDesignerTemplate($('#twitchDesignDetail').value);
    $('#twitchPlacementMockMessage').textContent = $('#alertDesignPreviewMessage').value;
    updateAlertSnapGuides(x, y);
    scheduleAlertCanvasPositionPreview();
  }

  function setCustomTwitchPlacement(x, y, snap = false, resetOffsets = false) {
    if (resetOffsets) {
      $('#twitchDesignPositionX').value = 0;
      $('#twitchDesignPositionY').value = 0;
    }
    const limits = alertPlacementLimits();
    const nextX = snap ? snapAlertCoordinate(x, limits.minimumX, limits.maximumX) : Math.min(limits.maximumX, Math.max(limits.minimumX, x));
    const nextY = snap ? snapAlertCoordinate(y, limits.minimumY, limits.maximumY) : Math.min(limits.maximumY, Math.max(limits.minimumY, y));
    $('#twitchDesignPosition').value = 'custom';
    $('#twitchDesignCustomX').value = nextX.toFixed(1);
    $('#twitchDesignCustomY').value = nextY.toFixed(1);
    updateTwitchPlacementPreview();
  }

  function alignTwitchPlacement(axis) {
    const position = $('#twitchDesignPosition').value;
    const current = position === 'custom'
      ? { x: Number($('#twitchDesignCustomX').value), y: Number($('#twitchDesignCustomY').value) }
      : twitchAnchorCoordinates(position);
    if (axis === 'horizontal' || axis === 'both') $('#twitchDesignPositionX').value = 0;
    if (axis === 'vertical' || axis === 'both') $('#twitchDesignPositionY').value = 0;
    setCustomTwitchPlacement(axis === 'horizontal' || axis === 'both' ? 50 : current.x, axis === 'vertical' || axis === 'both' ? 50 : current.y);
    pushAlertDesignHistory();
    $('#twitchPlacementMock').focus();
  }

  function beginTwitchPlacementInteraction(event) {
    if (event.button !== 0) return;
    const canvas = $('#twitchPlacementCanvas');
    const mock = $('#twitchPlacementMock');
    const layerElement = event.target.closest?.('[data-design-layer]');
    const overlayLayout = $('#twitchDesignLayout').value === 'media-overlay';
    const resizing = event.target === $('#twitchPlacementResizeHandle');
    const startScale = Number($('#twitchDesignScale').value) / 100;
    const startMediaWidth = Number($('#twitchDesignMediaWidth').value);
    const startMediaHeight = Number($('#twitchDesignMediaHeight').value);
    const mockRect = mock.getBoundingClientRect();
    const centerX = mockRect.left + mockRect.width / 2;
    const centerY = mockRect.top + mockRect.height / 2;
    const startDistance = Math.max(20, Math.hypot(event.clientX - centerX, event.clientY - centerY));
    mock.setPointerCapture(event.pointerId);
    event.preventDefault();

    const move = (moveEvent) => {
      if (layerElement && overlayLayout) {
        const bounds = mock.getBoundingClientRect();
        positionDesignerLayer(layerElement.dataset.designLayer, (moveEvent.clientX - bounds.left) / bounds.width * 100, (moveEvent.clientY - bounds.top) / bounds.height * 100);
        return;
      }
      if (resizing) {
        const distance = Math.hypot(moveEvent.clientX - centerX, moveEvent.clientY - centerY);
        if (overlayLayout) {
          const factor = Math.min(5, Math.max(0.2, distance / startDistance));
          $('#twitchDesignMediaWidth').value = Math.round(Math.min(2400, Math.max(40, startMediaWidth * factor)));
          $('#twitchDesignMediaHeight').value = Math.round(Math.min(1440, Math.max(40, startMediaHeight * factor)));
          updateTwitchPlacementPreview();
          return;
        }
        const scale = Math.min(2, Math.max(0.25, startScale * distance / startDistance));
        $('#twitchDesignScale').value = Math.round(scale * 100);
        updateTwitchPlacementPreview();
        return;
      }
      const bounds = canvas.getBoundingClientRect();
      setCustomTwitchPlacement((moveEvent.clientX - bounds.left) / bounds.width * 100, (moveEvent.clientY - bounds.top) / bounds.height * 100, true, true);
    };
    const finish = () => {
      mock.removeEventListener('pointermove', move);
      mock.removeEventListener('pointerup', finish);
      mock.removeEventListener('pointercancel', finish);
      pushAlertDesignHistory();
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
    const layer = event.target.dataset?.designLayer;
    if (layer && $('#twitchDesignLayout').value === 'media-overlay') {
      const controls = layerControlIds[layer];
      positionDesignerLayer(layer, Number($(controls[0]).value) + movement[0] * step, Number($(controls[1]).value) + movement[1] * step);
      pushAlertDesignHistory();
      return;
    }
    const position = $('#twitchDesignPosition').value;
    const current = position === 'custom'
      ? { x: Number($('#twitchDesignCustomX').value), y: Number($('#twitchDesignCustomY').value) }
      : twitchAnchorCoordinates(position);
    const canvasProfile = activeCanvasProfile();
    current.x += Number($('#twitchDesignPositionX').value || 0) / canvasProfile.baseWidth * 100;
    current.y += Number($('#twitchDesignPositionY').value || 0) / canvasProfile.baseHeight * 100;
    $('#twitchDesignPositionX').value = 0;
    $('#twitchDesignPositionY').value = 0;
    setCustomTwitchPlacement(current.x + movement[0] * step, current.y + movement[1] * step);
    pushAlertDesignHistory();
  }

  function readTwitchDesign() {
    const design = {
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
      showEyebrow: $('#twitchDesignShowEyebrow').checked,
      showHeadline: $('#twitchDesignShowHeadline').checked,
      showDetail: $('#twitchDesignShowDetail').checked,
      showViewerMessage: $('#twitchDesignShowMessage').checked,
      fontFamily: $('#twitchDesignFont').value,
      fontSize: Number($('#twitchDesignHeadlineFontSize').value),
      eyebrowFontSize: Number($('#twitchDesignEyebrowFontSize').value),
      detailFontSize: Number($('#twitchDesignDetailFontSize').value),
      messageFontSize: Number($('#twitchDesignMessageFontSize').value),
      fontWeight: Number($('#twitchDesignFontWeight').value),
      textAlign: $('#twitchDesignTextAlign').value,
      textColor: $('#twitchDesignHeadlineColor').value,
      secondaryTextColor: $('#twitchDesignDetailColor').value,
      eyebrowTextColor: $('#twitchDesignEyebrowColor').value,
      messageTextColor: $('#twitchDesignMessageColor').value,
      textShadow: Number($('#twitchDesignTextShadow').value) / 100,
      letterSpacing: Number($('#twitchDesignLetterSpacing').value),
      textOffsetX: Number($('#twitchDesignTextX').value),
      textOffsetY: Number($('#twitchDesignTextY').value),
      textPositionX: Number($('#twitchDesignTextPositionX').value),
      textPositionY: Number($('#twitchDesignTextPositionY').value),
      eyebrowPositionX: Number($('#twitchDesignEyebrowX').value),
      eyebrowPositionY: Number($('#twitchDesignEyebrowY').value),
      headlinePositionX: Number($('#twitchDesignHeadlineX').value),
      headlinePositionY: Number($('#twitchDesignHeadlineY').value),
      detailPositionX: Number($('#twitchDesignDetailX').value),
      detailPositionY: Number($('#twitchDesignDetailY').value),
      messagePositionX: Number($('#twitchDesignMessageX').value),
      messagePositionY: Number($('#twitchDesignMessageY').value),
      eyebrowMaxWidth: Number($('#twitchDesignEyebrowMaxWidth').value),
      headlineMaxWidth: Number($('#twitchDesignHeadlineMaxWidth').value),
      detailMaxWidth: Number($('#twitchDesignDetailMaxWidth').value),
      messageMaxWidth: Number($('#twitchDesignMessageMaxWidth').value),
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
      mediaScale: Number($('#twitchDesignMediaScale').value) / 100,
      mediaPositionX: Number($('#twitchDesignMediaPositionX').value),
      mediaPositionY: Number($('#twitchDesignMediaPositionY').value),
      mediaOpacity: Number($('#twitchDesignMediaOpacity').value) / 100,
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
    captureAlertScenePlacement();
    Object.assign(design, alertDesignBasePlacement || alertPlacementFromControls());
    if (alertDesignScenePlacements.length) design.scenePlacements = structuredClone(alertDesignScenePlacements);
    return design;
  }

  function updateAlertDesignHistoryButtons() {
    $('#undoAlertDesign').disabled = alertDesignHistoryIndex <= 0;
    $('#redoAlertDesign').disabled = alertDesignHistoryIndex < 0 || alertDesignHistoryIndex >= alertDesignHistory.length - 1;
  }

  function resetAlertDesignHistory() {
    alertDesignHistory = [structuredClone(readTwitchDesign())];
    alertDesignHistoryIndex = 0;
    updateAlertDesignHistoryButtons();
  }

  function pushAlertDesignHistory() {
    if (alertDesignHistoryLocked || !$('#twitchDesignDialog').open) return;
    const next = readTwitchDesign();
    if (JSON.stringify(next) === JSON.stringify(alertDesignHistory[alertDesignHistoryIndex])) return;
    alertDesignHistory = alertDesignHistory.slice(0, alertDesignHistoryIndex + 1);
    alertDesignHistory.push(structuredClone(next));
    if (alertDesignHistory.length > 80) alertDesignHistory.shift();
    alertDesignHistoryIndex = alertDesignHistory.length - 1;
    updateAlertDesignHistoryButtons();
  }

  function moveAlertDesignHistory(direction) {
    const nextIndex = alertDesignHistoryIndex + direction;
    if (nextIndex < 0 || nextIndex >= alertDesignHistory.length) return;
    alertDesignHistoryIndex = nextIndex;
    alertDesignHistoryLocked = true;
    populateTwitchDesign(alertDesignHistory[alertDesignHistoryIndex]);
    alertDesignHistoryLocked = false;
    updateAlertDesignHistoryButtons();
  }

  function stopAlertDesignPreview() {
    alertDesignPreviewRevision++;
    if (alertDesignAudio) {
      alertDesignAudio.pause();
      alertDesignAudio.currentTime = 0;
      alertDesignAudio = null;
    }
    $('#twitchPlacementMock').classList.remove('previewing');
  }

  function previewAlertDesignHere() {
    stopAlertDesignPreview();
    const revision = alertDesignPreviewRevision;
    const mock = $('#twitchPlacementMock');
    void mock.offsetWidth;
    mock.classList.add('previewing');
    const video = $('#twitchPlacementMockMedia video');
    if (video) { video.currentTime = 0; void video.play().catch(() => {}); }
    if (activeAlertDesignAssets.audioUri) {
      const previewAudio = new Audio(activeAlertDesignAssets.audioUri);
      alertDesignAudio = previewAudio;
      previewAudio.volume = Math.min(1, Math.max(0, Number(activeAlertDesignAssets.volume) || 0));
      setTimeout(() => { if (revision === alertDesignPreviewRevision && alertDesignAudio === previewAudio) void previewAudio.play().catch(() => {}); }, Math.max(0, Number($('#twitchDesignSoundDelay').value) || 0));
    }
    setTimeout(() => { if (revision === alertDesignPreviewRevision) mock.classList.remove('previewing'); }, 1800);
  }

  function alertCanvasPreviewKind() {
    return $('#alertDesignKind').value === 'interaction' ? 'interaction' : 'twitch';
  }

  function renderAlertCanvasPreviewState(message) {
    const button = $('#previewAlertDesignOnCanvas');
    button.textContent = alertCanvasPositionPreviewActive ? 'Hide from Canvas' : 'Show on Canvas';
    button.setAttribute('aria-pressed', String(alertCanvasPositionPreviewActive));
    button.classList.toggle('active', alertCanvasPositionPreviewActive);
    $('#alertCanvasPreviewStatus').textContent = message || (alertCanvasPositionPreviewActive ? 'Updating the Browser Source as you edit.' : 'Canvas preview is off.');
  }

  function scheduleAlertCanvasPositionPreview() {
    if (!alertCanvasPositionPreviewActive || !$('#twitchDesignDialog').open) return;
    clearTimeout(alertCanvasPositionPreviewTimer);
    alertCanvasPositionPreviewTimer = setTimeout(() => { void syncAlertCanvasPositionPreview(); }, 90);
  }

  async function syncAlertCanvasPositionPreview() {
    if (!alertCanvasPositionPreviewActive || !$('#twitchDesignDialog').open) return;
    const revision = ++alertCanvasPositionPreviewRevision;
    const kind = alertCanvasPreviewKind();
    try {
      const result = await api('/v1/visual-alerts/position-preview', {
        method: 'POST',
        body: {
          kind,
          alertId: $('#twitchDesignAlertId').value,
          variantId: $('#twitchDesignVariantId').value || undefined,
          design: readTwitchDesign(),
          viewerName: $('#alertDesignPreviewViewer').value,
          amount: $('#alertDesignPreviewAmount').value,
          message: $('#alertDesignPreviewMessage').value,
          sceneName: alertDesignSceneScope || undefined,
          useGlobalPlacement: !alertDesignSceneScope
        }
      });
      if (!alertCanvasPositionPreviewActive || revision !== alertCanvasPositionPreviewRevision) {
        if (!alertCanvasPositionPreviewActive) await api('/v1/visual-alerts/position-preview/clear', { method: 'POST', body: { kind } });
        return;
      }
      renderAlertCanvasPreviewState(result.connectedClients > 0
        ? `Live on ${result.connectedClients} connected ${kind === 'interaction' ? 'Interaction' : 'Twitch'} Browser Source${result.connectedClients === 1 ? '' : 's'}.`
        : `Preview is ready. Open the ${kind === 'interaction' ? 'Interaction Alerts' : 'Twitch Alerts'} Browser Source in Broadcast to see it.`);
    } catch (error) {
      if (alertCanvasPositionPreviewActive && revision === alertCanvasPositionPreviewRevision) renderAlertCanvasPreviewState(`Canvas preview needs attention: ${error.message}`);
    }
  }

  async function stopAlertCanvasPositionPreview(announce = false) {
    const wasActive = alertCanvasPositionPreviewActive;
    const kind = alertCanvasPreviewKind();
    alertCanvasPositionPreviewActive = false;
    alertCanvasPositionPreviewRevision++;
    clearTimeout(alertCanvasPositionPreviewTimer);
    alertCanvasPositionPreviewTimer = null;
    renderAlertCanvasPreviewState();
    if (!wasActive) return;
    try {
      await api('/v1/visual-alerts/position-preview/clear', { method: 'POST', body: { kind } });
      if (announce) toast('Canvas positioning preview hidden.');
    } catch (error) {
      if (announce) toast(error.message, true);
    }
  }

  async function toggleAlertCanvasPositionPreview() {
    if (alertCanvasPositionPreviewActive) return stopAlertCanvasPositionPreview(true);
    alertCanvasPositionPreviewActive = true;
    renderAlertCanvasPreviewState('Connecting to the Browser Source…');
    await syncAlertCanvasPositionPreview();
  }

  async function validateAlertDesignCode(showSuccess = true) {
    const result = await window.tempestStudio.validateAlertCode({
      html: $('#twitchDesignCustomHtml').value,
      css: $('#twitchDesignCustomCss').value,
      javascript: $('#twitchDesignCustomJavaScript').value
    });
    const status = $('#alertDesignCodeStatus');
    status.classList.toggle('valid', result.ok);
    status.classList.toggle('invalid', !result.ok);
    status.textContent = result.ok ? 'HTML, CSS, and JavaScript passed validation.' : result.errors.join('\n');
    if (showSuccess) toast(result.ok ? 'Custom alert code is valid.' : result.errors[0], !result.ok);
    return result.ok;
  }

  async function importAlertDesignTemplate() {
    try {
      const imported = await window.tempestStudio.importAlertDesignTemplate();
      if (!imported) return;
      alertDesignHistoryLocked = true;
      populateTwitchDesign(imported.design);
      alertDesignHistoryLocked = false;
      pushAlertDesignHistory();
      toast(`${imported.name || 'Alert'} template imported. Save to apply it.`);
    } catch (error) { toast(error.message, true); }
  }

  async function exportAlertDesignTemplate() {
    try {
      const exported = await window.tempestStudio.exportAlertDesignTemplate({
        name: $('#twitchDesignTitle').textContent.replace(/\s+Design$/, ''),
        kind: $('#alertDesignKind').value,
        design: readTwitchDesign()
      });
      if (exported) toast('Alert design template exported.');
    } catch (error) { toast(error.message, true); }
  }

  function openDuplicateAlertDesign() {
    const currentId = $('#twitchDesignAlertId').value;
    const currentKind = $('#alertDesignKind').value;
    const targets = [
      ...(state.twitchVisualAlerts.alerts || []).map((alert) => ({ value: `twitch:${alert.id}`, label: `Twitch — ${alert.name}`, id: alert.id, kind: 'twitch' })),
      ...(state.soundAlerts.alerts || []).map((alert) => ({ value: `interaction:${alert.id}`, label: `Interaction — ${alert.name}`, id: alert.id, kind: 'interaction' }))
    ].filter((target) => target.id !== currentId || target.kind !== currentKind);
    if (!targets.length) return toast('Create another alert before duplicating this design.', true);
    $('#duplicateAlertDesignTarget').innerHTML = targets.map((target) => `<option value="${escapeHtml(target.value)}">${escapeHtml(target.label)}</option>`).join('');
    $('#duplicateAlertDesignDialog').showModal();
  }

  async function duplicateAlertDesign(event) {
    event.preventDefault();
    try {
      if (!await validateAlertDesignCode(false)) throw new Error('Fix the custom code errors before copying this design.');
      const [kind, ...idParts] = $('#duplicateAlertDesignTarget').value.split(':');
      const id = idParts.join(':');
      if (!id || !['twitch', 'interaction'].includes(kind)) throw new Error('Choose a destination alert.');
      const copied = kind === 'interaction'
        ? await updateSoundAlert(id, { design: readTwitchDesign() }, 'Alert design duplicated. Sound and visual assignments were preserved.')
        : await updateTwitchVisualAlert(id, { design: readTwitchDesign() }, 'Alert design duplicated. Sound and visual assignments were preserved.');
      if (copied) $('#duplicateAlertDesignDialog').close();
    } catch (error) { toast(error.message, true); }
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
    $('#twitchDesignVariantId').value = '';
    $('#twitchDesignTitle').textContent = `${alert.name} Design`;
    activeAlertDesignAssets = { visualUri: alert.visualUri || '', audioUri: alert.audioUri || '', volume: alert.volume };
    alertCanvasPositionPreviewActive = false;
    alertDesignSceneScope = '';
    renderAlertCanvasPreviewState();
    populateTwitchDesign(alert.design);
    renderAlertDesignerMedia();
    $('#twitchDesignDialog').showModal();
    resetAlertDesignHistory();
    requestAnimationFrame(updateTwitchPlacementPreview);
  }

  function openTwitchVariantDesignEditor(alertId, variantId) {
    const alert = state.twitchVisualAlerts.alerts.find((entry) => entry.id === alertId);
    const variant = alert?.alertVariants?.find((entry) => entry.id === variantId);
    if (!alert || !variant) return;
    if ($('#twitchVariantDialog').open) $('#twitchVariantDialog').close();
    $('#alertDesignKind').value = 'twitch-variant';
    $('#alertDesignKicker').textContent = 'TWITCH ALERT VARIANT DESIGNER';
    $('#alertDesignHelp').textContent = `${variantConditionSummary(variant.condition)}. This design and its assigned media are independent from the base alert.`;
    $('#twitchDesignAlertId').value = alert.id;
    $('#twitchDesignVariantId').value = variant.id;
    $('#twitchDesignTitle').textContent = `${variant.name} Design`;
    activeAlertDesignAssets = { visualUri: variant.visualUri || '', audioUri: variant.audioUri || '', volume: variant.volume };
    alertCanvasPositionPreviewActive = false;
    alertDesignSceneScope = '';
    renderAlertCanvasPreviewState();
    populateTwitchDesign(variant.design || alert.design);
    renderAlertDesignerMedia();
    $('#twitchDesignDialog').showModal();
    resetAlertDesignHistory();
    requestAnimationFrame(updateTwitchPlacementPreview);
  }

  function openInteractionDesignEditor(id) {
    const alert = state.soundAlerts.alerts.find((entry) => entry.id === id);
    if (!alert) return;
    $('#alertDesignKind').value = 'interaction';
    $('#alertDesignKicker').textContent = 'INTERACTION ALERT DESIGNER';
    const canvas = activeCanvasProfile();
    $('#alertDesignHelp').textContent = `Place this sound-and-visual interaction anywhere on the dedicated ${canvas.baseWidth} × ${canvas.baseHeight} Interaction Alert Browser Source canvas.`;
    $('#twitchDesignAlertId').value = alert.id;
    $('#twitchDesignVariantId').value = '';
    $('#twitchDesignTitle').textContent = `${alert.name} Design`;
    activeAlertDesignAssets = { visualUri: alert.visualUri || '', audioUri: alert.audioUri || '', volume: alert.volume };
    alertCanvasPositionPreviewActive = false;
    alertDesignSceneScope = '';
    renderAlertCanvasPreviewState();
    populateTwitchDesign(alert.design || defaultInteractionDesign());
    renderAlertDesignerMedia();
    $('#twitchDesignDialog').showModal();
    resetAlertDesignHistory();
    requestAnimationFrame(updateTwitchPlacementPreview);
  }

  async function saveTwitchDesign(event, preview = false) {
    event?.preventDefault();
    const id = $('#twitchDesignAlertId').value;
    if (!id) return;
    if (!await validateAlertDesignCode(false)) {
      $('#twitchDesignDialog').querySelector('.design-custom-code').open = true;
      toast('Fix the custom code errors before saving.', true);
      return;
    }
    const kind = $('#alertDesignKind').value;
    const variantId = $('#twitchDesignVariantId').value;
    const saved = kind === 'interaction'
      ? await updateSoundAlert(id, { design: readTwitchDesign() }, 'Interaction Alert design and canvas placement saved.')
      : kind === 'twitch-variant'
        ? await updateTwitchVariant(id, variantId, { design: readTwitchDesign() }, 'Twitch Alert variant design saved.')
        : await updateTwitchVisualAlert(id, { design: readTwitchDesign() }, 'Twitch Alert design saved.');
    if (!saved) return;
    await stopAlertCanvasPositionPreview(false);
    $('#twitchDesignDialog').close();
    if (preview) {
      if (kind === 'interaction') await previewVisualAlert(id);
      else await previewTwitchVisualAlert(id, variantId || undefined);
    }
  }

  async function previewTwitchVisualAlert(id, variantId) {
    try {
      const result = await api(`/v1/visual-alerts/twitch/${encodeURIComponent(id)}/preview`, { method: 'POST', body: variantId ? { variantId } : {} });
      state.visualAlerts = await api('/v1/visual-alerts');
      renderVisualAlerts();
      toast(`${result.activeAlert.name}${variantId ? ' variant' : ''} preview started.`);
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
      const target = selectedGiphyTarget();
      if (!target) throw new Error('Choose an alert before searching GIPHY.');
      if (!query) throw new Error('Enter a GIF search first.');
      const alertName = target.name;
      button.disabled = true;
      button.textContent = 'Searching…';
      $('#giphyResultSummary').textContent = `Searching for “${query}”…`;
      $('#giphyTargetSummary').textContent = `Results will be ready to assign to ${alertName}.`;
      const grid = $('#giphyResults');
      grid.classList.add('empty-state');
      grid.textContent = 'Searching GIPHY…';
      const result = await window.tempestStudio.searchGiphy(query);
      grid.classList.toggle('empty-state', !result.results.length);
      grid.innerHTML = result.results.length ? result.results.map((entry) => `<article class="giphy-result"><img src="${escapeHtml(entry.previewUrl)}" alt="${escapeHtml(entry.title)}" loading="lazy" /><div><strong title="${escapeHtml(entry.title)}">${escapeHtml(entry.title)}</strong><button data-giphy-result="${escapeHtml(entry.id)}" data-giphy-title="${escapeHtml(entry.title)}" data-giphy-media-url="${escapeHtml(entry.mediaUrl)}" aria-label="Assign this GIF to ${escapeHtml(alertName)}">Assign GIF</button></div></article>`).join('') : 'No GIFs matched that search.';
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

  async function chooseGiphyResult(id, title, mediaUrl, button) {
    const originalLabel = button?.textContent || 'Assign GIF';
    const card = button?.closest('.giphy-result');
    try {
      const target = selectedGiphyTarget();
      if (!target) throw new Error('Choose an alert before selecting a GIF.');
      if (button) { button.disabled = true; button.textContent = 'Downloading…'; }
      card?.classList.add('assigning');
      const imported = await window.tempestStudio.importGiphyVisual({ id, title, mediaUrl });
      await registerManagedSelection(imported);
      if (target.kind === 'interaction') await updateSoundAlert(target.alertId, { visualUri: imported.uri }, `${imported.name} downloaded and assigned to ${target.name}.`);
      else if (target.kind === 'twitch') await updateTwitchVisualAlert(target.alertId, { visualUri: imported.uri }, `${imported.name} downloaded and assigned to ${target.name}.`);
      else await updateTwitchVariant(target.alertId, target.variantId, { visualUri: imported.uri }, `${imported.name} downloaded and assigned to ${target.name}.`);
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

  async function connectDiscordVoice() {
    try {
      state.discordRpc = { ...(state.discordRpc || {}), state: 'connecting' };
      renderDiscordVoice();
      state.discordRpc = await window.tempestStudio.connectDiscordVoice();
      state.discordVoice = await api('/v1/discord-voice');
      renderDiscordVoice({ settings: true });
      toast('Discord Voice connected. Join or change channels in Discord normally.');
    } catch (error) {
      state.discordRpc = await window.tempestStudio.getDiscordVoiceStatus().catch(() => state.discordRpc);
      renderDiscordVoice();
      toast(error.message, true);
    }
  }

  async function disconnectDiscordVoice() {
    try {
      state.discordRpc = await window.tempestStudio.disconnectDiscordVoice();
      state.discordVoice = await api('/v1/discord-voice');
      renderDiscordVoice();
      toast('Discord Voice disconnected. Your image assignments are still saved.');
    } catch (error) { toast(error.message, true); }
  }

  async function forgetDiscordVoice() {
    try {
      state.discordRpc = await window.tempestStudio.forgetDiscordVoice();
      state.discordVoice = await api('/v1/discord-voice');
      renderDiscordVoice();
      toast('Discord authorization removed from this computer.');
    } catch (error) { toast(error.message, true); }
  }

  async function saveDiscordVoiceSettings() {
    try {
      await api('/v1/discord-voice/settings', { method: 'POST', body: {
        enabled: $('#discordVoiceEnabled').checked,
        layout: $('#discordVoiceLayout').value,
        avatarSize: Number($('#discordVoiceAvatarSize').value),
        gap: Number($('#discordVoiceGap').value),
        inactiveOpacity: Number($('#discordVoiceInactiveOpacity').value) / 100,
        speakingScale: Number($('#discordVoiceSpeakingScale').value) / 100,
        speakingAccent: $('#discordVoiceAccent').value,
        showNames: $('#discordVoiceShowNames').checked,
        showStatusIcons: $('#discordVoiceShowStatus').checked,
        hideSelf: $('#discordVoiceHideSelf').checked,
        hideBots: $('#discordVoiceHideBots').checked,
        transitionMs: state.discordVoice?.settings?.transitionMs ?? 140
      } });
      await syncUnifiedModule('discordVoice', $('#discordVoiceEnabled').checked);
      discordSettingsDirty = false;
      state.discordVoice = await api('/v1/discord-voice');
      renderDiscordVoice({ settings: true });
      toast('Discord Guests overlay design saved.');
    } catch (error) { toast(error.message, true); }
  }

  async function previewDiscordVoice() {
    try {
      state.discordVoice = await api('/v1/discord-voice/preview', { method: 'POST', body: {} });
      renderDiscordVoice();
      toast('Sample Discord guests sent to the Browser Source.');
    } catch (error) { toast(error.message, true); }
  }

  async function clearDiscordVoicePreview() {
    try {
      state.discordVoice = await api('/v1/discord-voice/clear', { method: 'POST', body: {} });
      renderDiscordVoice();
      toast('Discord Guests preview stopped.');
    } catch (error) { toast(error.message, true); }
  }

  async function saveDiscordVoiceProfile(userId, { quiet = false } = {}) {
    const selector = CSS.escape(userId);
    try {
      await api(`/v1/discord-voice/profiles/${encodeURIComponent(userId)}`, { method: 'POST', body: {
        displayName: document.querySelector(`[data-discord-profile-name="${selector}"]`).value.trim(),
        order: Number(document.querySelector(`[data-discord-profile-order="${selector}"]`).value),
        accent: document.querySelector(`[data-discord-profile-accent="${selector}"]`).value,
        positionX: Number(document.querySelector(`[data-discord-profile-x="${selector}"]`).value),
        positionY: Number(document.querySelector(`[data-discord-profile-y="${selector}"]`).value),
        visible: document.querySelector(`[data-discord-profile-visible="${selector}"]`).checked
      } });
      discordProfileDrafts.delete(userId);
      state.discordVoice = await api('/v1/discord-voice');
      renderDiscordVoice({ force: true });
      if (!quiet) toast('Discord participant design saved.');
    } catch (error) { toast(error.message, true); }
  }

  async function hideDiscordStreamerProfile(userId) {
    try {
      await api(`/v1/discord-voice/profiles/${encodeURIComponent(userId)}`, { method: 'POST', body: { visible: false } });
      discordProfileDrafts.delete(userId);
      state.discordVoice = await api('/v1/discord-voice');
      renderDiscordVoice({ force: true });
      toast('Your streamer profile is hidden from the Discord Browser Source.');
    } catch (error) { toast(error.message, true); }
  }

  async function exportDiscordVoiceProfile(userId) {
    const participant = (state.discordVoice?.guests || []).find((entry) => entry.id === userId);
    if (!participant) return toast('The Discord guest profile could not be found.', true);
    const saved = discordProfileFor(userId);
    try {
      const result = await window.tempestStudio.exportDiscordProfile({ profile: {
        userId,
        displayName: saved.displayName || participant.displayName,
        accent: saved.accent || state.discordVoice?.settings?.speakingAccent || '#54F2EB',
        idleUri: saved.idleUri,
        speakingUri: saved.speakingUri,
        muteUri: saved.muteUri,
        deafenUri: saved.deafenUri
      } });
      if (result) toast(`${saved.displayName || participant.displayName} exported with ${result.assetCount} embedded reactive image${result.assetCount === 1 ? '' : 's'}.`);
    } catch (error) { toast(error.message, true); }
  }

  async function importDiscordVoiceProfile() {
    try {
      const imported = await window.tempestStudio.importDiscordProfile();
      if (!imported) return;
      const profile = imported.profile;
      const existing = (state.discordVoice?.profiles || []).find((entry) => entry.userId === profile.userId);
      if (existing && !confirm(`${profile.displayName} already has a saved profile in Studio. Replace its name, accent, and reactive images with the imported profile? Canvas placement and visibility will stay unchanged.`)) return;
      await api(`/v1/discord-voice/profiles/${encodeURIComponent(profile.userId)}`, { method: 'POST', body: {
        displayName: profile.displayName,
        accent: profile.accent || '#54F2EB',
        idleUri: profile.idleUri || null,
        speakingUri: profile.speakingUri || null,
        muteUri: profile.muteUri || null,
        deafenUri: profile.deafenUri || null
      } });
      discordProfileDrafts.delete(profile.userId);
      state.discordVoice = await api('/v1/discord-voice');
      renderDiscordVoice({ force: true });
      showSection('discordvoice');
      toast(`${profile.displayName} imported with ${imported.assetCount} verified reactive image${imported.assetCount === 1 ? '' : 's'}. The profile will match Discord ID ${profile.userId} automatically.`);
    } catch (error) { toast(error.message, true); }
  }

  async function addDiscordVoiceProfile() {
    const input = $('#discordGuestUserId');
    const userId = input.value.trim();
    if (!/^\d{17,20}$/.test(userId)) return toast('Enter a valid 17–20 digit Discord User ID.', true);
    try {
      await api(`/v1/discord-voice/profiles/${encodeURIComponent(userId)}`, { method: 'POST', body: {} });
      state.discordVoice = await api('/v1/discord-voice');
      input.value = '';
      renderDiscordVoice();
      toast('Offline Discord guest added. You can assign their images now.');
    } catch (error) { toast(error.message, true); }
  }

  async function resetDiscordVoiceProfile(userId) {
    try {
      await api(`/v1/discord-voice/profiles/${encodeURIComponent(userId)}/reset`, { method: 'POST', body: {} });
      discordProfileDrafts.delete(userId);
      state.discordVoice = await api('/v1/discord-voice');
      renderDiscordVoice({ force: true });
      toast('Discord guest style reset. The person remains in your saved library.');
    } catch (error) { toast(error.message, true); }
  }

  async function forgetDiscordVoiceProfile(userId) {
    const guest = (state.discordVoice?.guests || []).find((entry) => entry.id === userId);
    if (!confirm(`Forget ${guest?.displayName || 'this Discord user'} and remove their assigned images from the guest library? The original image files will not be deleted.`)) return;
    try {
      await api(`/v1/discord-voice/profiles/${encodeURIComponent(userId)}`, { method: 'DELETE' });
      discordProfileDrafts.delete(userId);
      state.discordVoice = await api('/v1/discord-voice');
      renderDiscordVoice({ force: true });
      toast('Discord guest forgotten. They will be added again if detected in voice.');
    } catch (error) { toast(error.message, true); }
  }

  async function assignDiscordVoiceImage(userId, kind) {
    try {
      const selected = await window.tempestStudio.selectDiscordVoiceImage();
      if (!selected) return;
      await api(`/v1/discord-voice/profiles/${encodeURIComponent(userId)}`, { method: 'POST', body: { [`${kind}Uri`]: selected.uri } });
      state.discordVoice = await api('/v1/discord-voice');
      renderDiscordVoice({ force: true });
      toast(`${selected.name} assigned as the ${kind} image.`);
    } catch (error) { toast(error.message, true); }
  }

  function updateDiscordCanvasDrag(event) {
    if (!discordCanvasDrag) return;
    const canvas = $('#discordVoiceCanvasPreview');
    const bounds = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100));
    discordCanvasDrag.element.style.left = `${x}%`;
    discordCanvasDrag.element.style.top = `${y}%`;
    const selector = CSS.escape(discordCanvasDrag.userId);
    const xInput = document.querySelector(`[data-discord-profile-x="${selector}"]`);
    const yInput = document.querySelector(`[data-discord-profile-y="${selector}"]`);
    if (xInput) xInput.value = x.toFixed(1);
    if (yInput) yInput.value = y.toFixed(1);
    discordProfileDrafts.set(discordCanvasDrag.userId, { ...(discordProfileDrafts.get(discordCanvasDrag.userId) || {}), positionX: x.toFixed(1), positionY: y.toFixed(1) });
  }

  function beginDiscordCanvasDrag(event) {
    const person = event.target.closest('[data-discord-canvas-id]');
    if (!person) return;
    if ($('#discordVoiceLayout').value !== 'manual') {
      toast('Choose Manual canvas placement, then drag a profile.', true);
      return;
    }
    event.preventDefault();
    discordCanvasDrag = { pointerId: event.pointerId, userId: person.dataset.discordCanvasId, element: person };
    person.setPointerCapture?.(event.pointerId);
    person.classList.add('dragging');
    updateDiscordCanvasDrag(event);
  }

  function moveDiscordCanvasDrag(event) {
    if (!discordCanvasDrag || event.pointerId !== discordCanvasDrag.pointerId) return;
    updateDiscordCanvasDrag(event);
  }

  function endDiscordCanvasDrag(event) {
    if (!discordCanvasDrag || event.pointerId !== discordCanvasDrag.pointerId) return;
    const { userId, element } = discordCanvasDrag;
    discordCanvasDrag = null;
    element.classList.remove('dragging');
    void saveDiscordVoiceProfile(userId, { quiet: true });
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

  async function saveEmoteWallSettings() {
    try {
      await api('/v1/emote-wall/settings', { method: 'POST', body: {
        enabled: $('#emoteWallEnabled').checked,
        maxActive: Number($('#emoteWallMaxActive').value),
        lifetimeMs: Math.round(Number($('#emoteWallLifetime').value) * 1000),
        sizePx: Number($('#emoteWallSize').value),
        speed: Number($('#emoteWallSpeed').value),
        includeAnimated: $('#emoteWallAnimated').checked,
        includeGifs: $('#emoteWallGifs').checked,
        enablePyramids: $('#emoteWallPyramids').checked,
        pyramidWindowMs: Math.round(Number($('#emoteWallPyramidWindow').value) * 1000),
        pyramidCooldownMs: Math.round(Number($('#emoteWallPyramidCooldown').value) * 1000),
        enableSevenTv: $('#emoteWallSevenTv').checked,
        enableBttv: $('#emoteWallBttv').checked,
        enableFfz: $('#emoteWallFfz').checked,
        providerOrder: $('#emoteWallProviderOrder').value
      } });
      await syncUnifiedModule('emoteWall', $('#emoteWallEnabled').checked);
      state.emoteWall = await api('/v1/emote-wall');
      renderEmoteWall({ settings: true });
      toast('Emote Wall settings saved.');
    } catch (error) { toast(error.message, true); }
  }

  async function previewEmoteWall() {
    try {
      state.emoteWall = await api('/v1/emote-wall');
      if (state.emoteWall.settings?.enabled !== false && !Number(state.emoteWall.connectedClients || 0)) {
        renderEmoteWall();
        throw new Error('No Emote Wall Browser Source is connected. Refresh the Emote Wall source in Broadcast, then preview again.');
      }
      await api('/v1/emote-wall/preview', { method: 'POST', body: {} });
      state.emoteWall = await api('/v1/emote-wall');
      renderEmoteWall();
      toast(state.emoteWall.settings?.enabled === false ? 'Enable the Emote Wall before previewing.' : 'Emote Wall preview sent.');
    } catch (error) { toast(error.message, true); }
  }

  async function previewEmotePyramid() {
    try {
      await api('/v1/emote-wall/pyramid/preview', { method: 'POST', body: {} });
      toast('Emote pyramid celebration sent to the Browser Source.');
    } catch (error) { toast(error.message, true); }
  }

  async function clearEmoteWall() {
    try {
      state.emoteWall = await api('/v1/emote-wall/clear', { method: 'POST', body: {} });
      renderEmoteWall();
      toast('Emote Wall cleared.');
    } catch (error) { toast(error.message, true); }
  }

  async function refreshEmoteProviders() {
    try {
      state.emoteWall = await api('/v1/emote-wall/providers/refresh', { method: 'POST', body: {} });
      renderEmoteWall();
      const loaded = Number(state.emoteWall.providerCatalogCount || 0);
      toast(loaded ? `${loaded} third-party emotes cataloged.` : 'No enabled provider catalogs are available yet.');
    } catch (error) { toast(error.message, true); }
  }

  async function saveTwitchExperiences() {
    try {
      await api('/v1/twitch-experiences/settings', { method: 'POST', body: {
        enabled: $('#twitchExperienceEnabled').checked,
        hypeTrainEnabled: $('#twitchExperienceHype').checked,
        raidPortalEnabled: $('#twitchExperienceRaid').checked,
        goalOverlayEnabled: $('#twitchExperienceGoal').checked,
        goalSource: $('#twitchExperienceGoalSource').value,
        studioGoal: studioGoalFromForm(),
        raidDurationMs: Math.round(Number($('#twitchExperienceRaidDuration').value) * 1000),
        hypeAccent: $('#twitchExperienceHypeAccent').value,
        raidAccent: $('#twitchExperienceRaidAccent').value,
        goalAccent: $('#twitchExperienceGoalAccent').value,
        hypeTrainDesign: twitchExperienceDesignFromForm('hype-train'),
        raidPortalDesign: twitchExperienceDesignFromForm('raid-portal'),
        goalOverlayDesign: twitchExperienceDesignFromForm('goal-overlay')
      } });
      twitchExperienceSettingsDirty = false;
      state.twitchExperiences = await api('/v1/twitch-experiences');
      await syncUnifiedModule('twitchExperiences', state.twitchExperiences?.settings?.enabled !== false);
      for (const kind of Object.keys(twitchExperienceDraftMedia)) delete twitchExperienceDraftMedia[kind];
      renderTwitchExperiences({ settings: true });
      toast('Twitch Experience designs and media saved.');
    } catch (error) { toast(error.message, true); }
  }

  async function controlStudioGoal(action) {
    if ($('#twitchExperienceGoalSource').value !== 'studio') return;
    const currentInput = $('#twitchExperienceGoalCurrent');
    if (action === 'increment') currentInput.value = String(Math.max(0, Number(currentInput.value) + 1));
    if (action === 'decrement') currentInput.value = String(Math.max(0, Number(currentInput.value) - 1));
    const active = action !== 'hide';
    try {
      await api('/v1/twitch-experiences/settings', { method: 'POST', body: { goalSource: 'studio', studioGoal: studioGoalFromForm(active) } });
      state.twitchExperiences = await api('/v1/twitch-experiences');
      renderTwitchExperiences({ settings: true });
      const labels = { show: 'Stream goal shown and updated.', increment: 'Stream goal increased by 1.', decrement: 'Stream goal decreased by 1.', hide: 'Stream goal hidden.' };
      toast(labels[action] || 'Stream goal updated.');
    } catch (error) { toast(error.message, true); }
  }

  async function assignTwitchExperienceMedia(kind) {
    const meta = twitchExperienceDesigners[kind];
    if (!meta) return;
    try {
      const selected = await window.tempestStudio.selectTwitchExperienceMedia();
      if (!selected) return;
      twitchExperienceDraftMedia[kind] = selected.uri;
      twitchExperienceSettingsDirty = true;
      $(`#twitchExperience${meta.prefix}MediaName`).textContent = selected.name;
      toast(`${selected.name} assigned. Save Experiences to apply it.`);
    } catch (error) { toast(error.message, true); }
  }

  function clearTwitchExperienceMedia(kind) {
    const meta = twitchExperienceDesigners[kind];
    if (!meta) return;
    twitchExperienceDraftMedia[kind] = '';
    twitchExperienceSettingsDirty = true;
    $(`#twitchExperience${meta.prefix}MediaName`).textContent = 'None';
    toast('Experience media cleared. Save Experiences to apply it.');
  }

  async function validateTwitchExperienceCode(kind) {
    const meta = twitchExperienceDesigners[kind];
    if (!meta) return;
    const prefix = `#twitchExperience${meta.prefix}`;
    const output = $(`${prefix}CodeStatus`);
    try {
      const result = await window.tempestStudio.validateAlertCode({ html: $(`${prefix}CustomHtml`).value, css: $(`${prefix}CustomCss`).value, javascript: $(`${prefix}CustomJavaScript`).value });
      output.textContent = result.ok ? 'HTML, CSS, and JavaScript are valid.' : result.errors.join(' ');
      output.classList.toggle('valid', result.ok);
      output.classList.toggle('invalid', !result.ok);
    } catch (error) {
      output.textContent = error.message;
      output.classList.remove('valid');
      output.classList.add('invalid');
    }
  }

  async function previewTwitchExperience(kind) {
    try {
      state.twitchExperiences = await api('/v1/twitch-experiences/preview', { method: 'POST', body: { kind } });
      renderTwitchExperiences();
      toast(`${String(kind).replaceAll('-', ' ')} preview sent.`);
    } catch (error) { toast(error.message, true); }
  }

  async function clearTwitchExperiences() {
    try {
      state.twitchExperiences = await api('/v1/twitch-experiences/clear', { method: 'POST', body: {} });
      renderTwitchExperiences();
      toast('Twitch Experiences canvas cleared.');
    } catch (error) { toast(error.message, true); }
  }

  async function saveSoundAlertSettings(id) {
    const selectorId = CSS.escape(id);
    const warudoEnabled = document.querySelector(`[data-alert-warudo-enabled="${selectorId}"]`).checked;
    const vtubeStudioEnabled = document.querySelector(`[data-alert-vtube-studio-enabled="${selectorId}"]`).checked;
    const vtubeStudioHotkey = document.querySelector(`[data-alert-vtube-studio-hotkey="${selectorId}"]`).value;
    const durationSeconds = Number(document.querySelector(`[data-alert-duration="${selectorId}"]`).value);
    const viewerSeconds = Number(document.querySelector(`[data-alert-viewer-cooldown="${selectorId}"]`).value);
    const globalSeconds = Number(document.querySelector(`[data-alert-global-cooldown="${selectorId}"]`).value);
    const interactionCategory = document.querySelector(`[data-alert-category="${selectorId}"]`).value;
    const placementMode = document.querySelector(`[data-alert-placement="${selectorId}"]`).value;
    const accessMode = document.querySelector(`[data-alert-access="${selectorId}"]`).value;
    const viewerGroupId = document.querySelector(`[data-alert-viewer-group="${selectorId}"]`).value;
    const allowedViewerIds = document.querySelector(`[data-alert-allowed-viewers="${selectorId}"]`).value.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
    const blockedViewerIds = document.querySelector(`[data-alert-blocked-viewers="${selectorId}"]`).value.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
    const hideWhenLocked = document.querySelector(`[data-alert-hide-locked="${selectorId}"]`).checked;
    const counterCommandId = document.querySelector(`[data-alert-counter-command="${selectorId}"]`).value;
    const counterDelta = Number(document.querySelector(`[data-alert-counter-delta="${selectorId}"]`).value);
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
      vtubeStudioEnabled,
      vtubeStudioHotkey,
      durationMs: Math.round(durationSeconds * 1000),
      viewerCooldownMs: Math.round(viewerSeconds * 1000),
      globalCooldownMs: Math.round(globalSeconds * 1000),
      interactionCategory,
      placementMode,
      accessMode,
      viewerGroupId,
      allowedViewerIds,
      blockedViewerIds,
      hideWhenLocked,
      counterCommandId,
      counterDelta,
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
    if (button.dataset.worldDemoCrowd) return spawnWorldDemoCrowd();
    if (button.dataset.worldClearCrowd) return clearWorldCrowd();
    if (button.dataset.worldViewerState) return setWorldViewerState(button.dataset.worldViewerState, button.dataset.worldState);
    if (button.dataset.worldViewerControl) return controlWorldViewer(button.dataset.worldViewerControl, button.dataset.worldControl);
    if (button.dataset.worldViewerCosmetics) return editWorldViewerCosmetics(button.dataset.worldViewerCosmetics);
    if (button.dataset.worldViewerRemove) return removeWorldViewer(button.dataset.worldViewerRemove);
    if (button.dataset.worldAvatarRedeemTest) return testWorldAvatarRedeem(button.dataset.worldAvatarRedeemTest);
    if (button.dataset.worldAvatarRedeemRemove) return removeWorldAvatarRedeem(button.dataset.worldAvatarRedeemRemove);
    if (button.dataset.worldAvatarRedeemReset) return resetWorldAvatarRewardSession();
    if (button.dataset.stageActorStrip) return chooseStageActorStrip(button.dataset.stageActorStrip);
    if (button.dataset.stageActorAtlas) return chooseStageActorAtlas();
    if (button.dataset.stageActorTexture) return chooseStageActorTexture();
    if (button.dataset.stageActorExport) return exportStageActorPack(button.dataset.stageActorExport);
    if (button.dataset.stageActorEdit) return openStageActorEditor(button.dataset.stageActorEdit);
    if (button.dataset.stageActorLibrary) return importStreamingAvatarsLibrary();
    if (button.dataset.stageActorImport) return importStageActorPack();
    if (button.dataset.stageActorRemove) return removeStageActorPack(button.dataset.stageActorRemove);
    if (button.dataset.worldPetAction) return runWorldPetAction(button.dataset.worldPetAction);
    if (button.dataset.worldBattleAction) return runWorldBattleAction(button.dataset.worldBattleAction);
    if (button.dataset.stageTab) return switchInteractiveStageTab(button.dataset.stageTab);
    if (button.dataset.stageGo) return switchInteractiveStageTab(button.dataset.stageGo);
    if (button.dataset.chatbotTab) return switchChatbotTab(button.dataset.chatbotTab);
    if (button.dataset.twitchPredictionWinner) return endTwitchPrediction('RESOLVED', button.dataset.twitchPredictionWinner);
    if (button.dataset.stageEdit) return selectInteractiveStageObject(button.dataset.stageEdit, true);
    if (button.dataset.stageSelect) return selectInteractiveStageObject(button.dataset.stageSelect);
    if (button.dataset.stageDismissSelected) return dismissInteractiveStageObject(interactiveStageSelectedId);
    if (button.dataset.stageDismiss) return dismissInteractiveStageObject(button.dataset.stageDismiss);
    if (button.dataset.stagePreview) return previewInteractiveStage();
    if (button.dataset.stageClear) return clearInteractiveStage();
    if (button.dataset.stageZoneClear) return clearInteractiveStageZones();
    if (button.dataset.stageStarterMap) return loadInteractiveStageStarterMap();
    if (button.dataset.stagePlatformClear) return clearInteractiveStagePlatforms();
    if (button.dataset.stageStarterGameplay) return loadInteractiveStageGameplaySet();
    if (button.dataset.stageInteractableClear) return clearInteractiveStageInteractables();
    if (button.dataset.interactionRecipeRun) return runInteractionRecipe(button.dataset.interactionRecipeRun);
    if (button.dataset.interactionRecipeRemove) return removeInteractionRecipe(button.dataset.interactionRecipeRemove);
    if (button.dataset.tobiiAdapter) return controlTobiiAdapter(button.dataset.tobiiAdapter);
    if (button.dataset.exportStudioBackup) return exportStudioBackup();
    if (button.dataset.restoreStudioBackup) return restoreStudioBackup();
    if (button.dataset.viewerGroupEdit) return editViewerGroup(button.dataset.viewerGroupEdit);
    if (button.dataset.viewerGroupDelete) return deleteViewerGroup(button.dataset.viewerGroupDelete);
    if (button.dataset.assetPreview) return previewLibraryAsset(button.dataset.assetPreview);
    if (button.dataset.assetEdit) return openAssetEditor(button.dataset.assetEdit);
    if (button.dataset.assetAssign) return assignLibraryAsset(button.dataset.assetAssign);
    if (button.dataset.assetRemove) return removeLibraryAsset(button.dataset.assetRemove);
    if (button.dataset.clearAlertHistory) return clearAlertHistory();
    if (button.dataset.designCodeTab) return switchAlertCodeTab(button.dataset.designCodeTab);
    if (button.dataset.onboardingStep !== undefined) {
      onboardingStep = Math.max(0, Math.min(onboardingSteps.length - 1, Number(button.dataset.onboardingStep) || 0));
      return renderOnboarding();
    }
    if (button.dataset.onboardingGo) {
      $('#onboardingDialog').close();
      showSection(button.dataset.onboardingGo);
      if (button.dataset.onboardingGo === 'chatbot') switchChatbotTab('setup');
      return;
    }
    if (button.dataset.deleteInteractionAlert) return deleteInteractionAlert(button.dataset.deleteInteractionAlert);
    if (button.dataset.deleteTwitchAlert) return deleteTwitchAlert(button.dataset.deleteTwitchAlert);
    if (button.dataset.importAlertPack) return importAlertPack(button.dataset.importAlertPack);
    if (button.dataset.exportInteractionAlertPack) return exportAlertPack('interaction', button.dataset.exportInteractionAlertPack);
    if (button.dataset.exportTwitchAlertPack) return exportAlertPack('twitch', button.dataset.exportTwitchAlertPack);
    if (button.dataset.section) return showSection(button.dataset.section, button.dataset.navGroup);
    if (button.dataset.go) return showSection(button.dataset.go);
    if (button.dataset.dicePreset) {
      $('#diceExpression').value = button.dataset.dicePreset;
      $('#diceExpression').focus();
      return;
    }
    if (button.dataset.diceSides) {
      const count = Math.max(1, Math.min(20, Number($('#dicePickerCount').value) || 1));
      const modifier = Math.max(-1000, Math.min(1000, Number($('#dicePickerModifier').value) || 0));
      $('#diceExpression').value = `${count}d${button.dataset.diceSides}${modifier ? `${modifier > 0 ? '+' : ''}${modifier}` : ''}`;
      document.querySelectorAll('[data-dice-sides]').forEach((candidate) => candidate.classList.toggle('selected', candidate === button));
      $('#diceExpression').focus();
      return;
    }
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
    if (button.dataset.twitchAlertVariants) return openTwitchVariantManager(button.dataset.twitchAlertVariants);
    if (button.dataset.variantEdit) return beginEditTwitchVariant(button.dataset.parentAlert, button.dataset.variantEdit);
    if (button.dataset.variantSave) return saveTwitchVariantSettings(button.dataset.parentAlert, button.dataset.variantSave);
    if (button.dataset.variantDesign) return openTwitchVariantDesignEditor(button.dataset.parentAlert, button.dataset.variantDesign);
    if (button.dataset.variantAudio) return assignTwitchVariantAsset(button.dataset.parentAlert, button.dataset.variantAudio, 'audio');
    if (button.dataset.variantVisual) return assignTwitchVariantAsset(button.dataset.parentAlert, button.dataset.variantVisual, 'visual');
    if (button.dataset.variantPreview) return previewTwitchVisualAlert(button.dataset.parentAlert, button.dataset.variantPreview);
    if (button.dataset.variantDelete) return deleteTwitchVariant(button.dataset.parentAlert, button.dataset.variantDelete);
    if (button.dataset.variantToggle) {
      const alert = state.twitchVisualAlerts.alerts.find((entry) => entry.id === button.dataset.parentAlert);
      const variant = alert?.alertVariants?.find((entry) => entry.id === button.dataset.variantToggle);
      if (alert && variant) return updateTwitchVariant(alert.id, variant.id, { enabled: !variant.enabled }, `${variant.name} ${variant.enabled ? 'disabled' : 'enabled'}.`);
      return;
    }
    if (button.dataset.interactionAlertDesign) return openInteractionDesignEditor(button.dataset.interactionAlertDesign);
    if (button.dataset.twitchAlertDesign) return openTwitchDesignEditor(button.dataset.twitchAlertDesign);
    if (button.dataset.twitchAlertAudio) return assignTwitchAlertAudio(button.dataset.twitchAlertAudio);
    if (button.dataset.twitchVisualFile) return assignTwitchVisualFile(button.dataset.twitchVisualFile);
    if (button.dataset.twitchVisualPreview) return previewTwitchVisualAlert(button.dataset.twitchVisualPreview);
    if (button.dataset.giphySave) return saveGiphyKey();
    if (button.dataset.giphySearch) return searchGiphy();
    if (button.dataset.giphyResult) return chooseGiphyResult(button.dataset.giphyResult, button.dataset.giphyTitle, button.dataset.giphyMediaUrl, button);
    if (button.dataset.giphyAlertTarget) return openGiphyForAlert(button.dataset.giphyAlertTarget);
    if (button.dataset.chatOverlaySave) return saveChatOverlaySettings();
    if (button.dataset.chatOverlayPreview) return previewChatOverlay();
    if (button.dataset.chatOverlayClear) return clearChatOverlay();
    if (button.dataset.emoteWallSave) return saveEmoteWallSettings();
    if (button.dataset.emoteWallPreview) return previewEmoteWall();
    if (button.dataset.emotePyramidPreview) return previewEmotePyramid();
    if (button.dataset.emoteWallClear) return clearEmoteWall();
    if (button.dataset.emoteProviderRefresh) return refreshEmoteProviders();
    if (button.dataset.twitchExperienceMedia) return assignTwitchExperienceMedia(button.dataset.twitchExperienceMedia);
    if (button.dataset.twitchExperienceMediaClear) return clearTwitchExperienceMedia(button.dataset.twitchExperienceMediaClear);
    if (button.dataset.twitchExperienceCodeValidate) return validateTwitchExperienceCode(button.dataset.twitchExperienceCodeValidate);
    if (button.dataset.twitchExperienceSave) return saveTwitchExperiences();
    if (button.dataset.twitchExperiencePreview) return previewTwitchExperience(button.dataset.twitchExperiencePreview);
    if (button.dataset.twitchExperienceClear) return clearTwitchExperiences();
    if (button.dataset.twitchGoalAction) return controlStudioGoal(button.dataset.twitchGoalAction);
    if (button.dataset.discordVoiceSave) return saveDiscordVoiceSettings();
    if (button.dataset.discordVoicePreview) return previewDiscordVoice();
    if (button.dataset.discordVoiceClear) return clearDiscordVoicePreview();
    if (button.dataset.discordProfileAdd) return addDiscordVoiceProfile();
    if (button.dataset.discordProfileSave) return saveDiscordVoiceProfile(button.dataset.discordProfileSave);
    if (button.dataset.discordProfileExport) return exportDiscordVoiceProfile(button.dataset.discordProfileExport);
    if (button.dataset.importDiscordProfile) return importDiscordVoiceProfile();
    if (button.dataset.discordProfileHideSelf) return hideDiscordStreamerProfile(button.dataset.discordProfileHideSelf);
    if (button.dataset.discordProfileReset) return resetDiscordVoiceProfile(button.dataset.discordProfileReset);
    if (button.dataset.discordProfileForget) return forgetDiscordVoiceProfile(button.dataset.discordProfileForget);
    if (button.dataset.discordImageId) return assignDiscordVoiceImage(button.dataset.discordImageId, button.dataset.discordImageKind);
    if (button.dataset.twitchVisualToggle) {
      const alert = state.twitchVisualAlerts.alerts.find((entry) => entry.id === button.dataset.twitchVisualToggle);
      if (alert) return updateTwitchVisualAlert(alert.id, { enabled: !alert.enabled }, `${alert.name} ${alert.enabled ? 'disabled' : 'enabled'}.`);
      return;
    }
    if (button.dataset.chatbotCommand) return editChatbotCommand(button.dataset.chatbotCommand);
    if (button.dataset.soundAlertToggle) {
      const alert = state.soundAlerts.alerts.find((entry) => entry.id === button.dataset.soundAlertToggle);
      if (alert) return updateSoundAlert(alert.id, { enabled: !alert.enabled }, `${alert.name} ${alert.enabled ? 'disabled' : 'enabled'}.`);
      return;
    }
  }

  function bindEvents() {
    $('#privacyModeButton').addEventListener('click', togglePrivacyMode);
    $('#savePrivacySettings').addEventListener('click', savePrivacyControls);
    $('#refreshButton').addEventListener('click', () => refresh());
    $('#worldViewerForm').addEventListener('submit', addWorldViewer);
    $('#worldAvatarRedeemForm').addEventListener('submit', saveWorldAvatarRedeem);
    $('#worldAvatarRedeemEffect').addEventListener('change', updateWorldAvatarRedeemValueHint);
    $('#worldViewerLookForm').addEventListener('submit', saveWorldViewerCosmetics);
    $('#worldViewerPrimaryColor').addEventListener('change', updateWorldViewerColorPreview);
    $('#worldViewerSecondaryColor').addEventListener('change', updateWorldViewerColorPreview);
    $('#stageActorPackForm').addEventListener('submit', createStageActorPack);
    $('#stageActorBuildMode').addEventListener('change', updateStageActorBuildMode);
    updateStageActorBuildMode();
    $('#stageActorEditForm').addEventListener('submit', saveStageActorEdit);
    $('#worldPresenceForm').addEventListener('submit', saveWorldPresence);
    $('#worldAvatarSize').addEventListener('input', () => { $('#worldAvatarSizeValue').textContent = `${$('#worldAvatarSize').value}%`; });
    $('#interactionComposerForm').addEventListener('submit', saveInteractionRecipe);
    $('#worldPetForm').addEventListener('submit', saveWorldPet);
    $('#worldStartBattle').addEventListener('click', startWorldBattle);
    $('#worldEndBattle').addEventListener('click', endWorldBattle);
    $('#worldGazeForm').addEventListener('submit', saveWorldGaze);
    $('#worldSimulateGaze').addEventListener('click', simulateWorldGaze);
    $('#worldSafetyForm').addEventListener('submit', saveWorldSafety);
    $('#interactiveStageCreateForm').addEventListener('submit', createInteractiveStageObject);
    $('#interactiveStageSelectionForm').addEventListener('submit', saveInteractiveStageSelection);
    $('#interactiveStageZoneForm').addEventListener('submit', saveInteractiveStageZone);
    $('#interactiveStageWorldForm').addEventListener('submit', saveInteractiveStageWorld);
    $('#interactiveStagePlatformForm').addEventListener('submit', saveInteractiveStagePlatform);
    $('#interactiveStageInteractableForm').addEventListener('submit', saveInteractiveStageInteractable);
    $('#saveUnifiedStageSettings').addEventListener('click', saveUnifiedStageSettings);
    $('#unifiedStageEnabled').addEventListener('change', (event) => {
      document.querySelectorAll('[data-unified-module]').forEach((input) => { input.disabled = !event.currentTarget.checked; });
    });
    $('#interactiveStageOrientation').addEventListener('change', (event) => {
      interactiveStageOrientation = event.target.value === 'vertical' ? 'vertical' : 'horizontal';
      renderInteractiveStage();
    });
    $('#interactiveStageLayoutCanvas').addEventListener('pointerdown', beginInteractiveStageDrag);
    $('#interactiveStageLayoutCanvas').addEventListener('pointermove', moveInteractiveStageDrag);
    $('#interactiveStageLayoutCanvas').addEventListener('pointerup', (event) => { void endInteractiveStageDrag(event); });
    $('#interactiveStageLayoutCanvas').addEventListener('pointercancel', (event) => { void endInteractiveStageDrag(event); });
    $('#diceRollForm').addEventListener('submit', rollDiceOnStream);
    $('#saveDiceOverlaySettings').addEventListener('click', saveDiceOverlaySettings);
    $('#clearDiceOverlay').addEventListener('click', clearDiceOverlay);
    $('#testDiceAudio').addEventListener('click', testDiceAudio);
    $('#importDiceTheme').addEventListener('click', importDiceTheme);
    $('#resetDicePhysics').addEventListener('click', resetDicePhysics);
    $('#diceTheme').addEventListener('change', updateDicePickerAvailability);
    $('#diceColor').addEventListener('change', () => {
      const colors = { stormglass: '#2e91ad', brass: '#a7792b', obsidian: '#3d315f' };
      $('#diceThemeColor').value = colors[$('#diceColor').value] || '#2e91ad';
    });
    document.querySelectorAll('.twitch-experience-panel input,.twitch-experience-panel select,.twitch-experience-panel textarea').forEach((input) => input.addEventListener('input', () => { twitchExperienceSettingsDirty = true; }));
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
    $('#saveWarudoReceiver').addEventListener('click', saveWarudoReceiver);
    $('#authorizeVTubeStudio').addEventListener('click', authorizeVTubeStudio);
    $('#refreshVTubeStudioHotkeys').addEventListener('click', refreshVTubeStudioHotkeys);
    $('#forgetVTubeStudio').addEventListener('click', forgetVTubeStudio);
    $('#connectDiscordVoice').addEventListener('click', connectDiscordVoice);
    $('#disconnectDiscordVoice').addEventListener('click', disconnectDiscordVoice);
    $('#discordVoiceLayout').addEventListener('change', (event) => {
      discordSettingsDirty = true;
      if (state.discordVoice?.settings) state.discordVoice.settings.layout = event.target.value;
      renderDiscordVoice({ force: true });
    });
    document.querySelectorAll('.discord-voice-settings-panel input,.discord-voice-settings-panel select').forEach((input) => input.addEventListener('input', () => { discordSettingsDirty = true; }));
    $('#discordVoiceParticipantGrid').addEventListener('input', rememberDiscordProfileDraft);
    $('#discordVoiceParticipantGrid').addEventListener('change', rememberDiscordProfileDraft);
    $('#discordVoiceCanvasPreview').addEventListener('pointerdown', beginDiscordCanvasDrag);
    $('#discordVoiceCanvasPreview').addEventListener('pointermove', moveDiscordCanvasDrag);
    $('#discordVoiceCanvasPreview').addEventListener('pointerup', endDiscordCanvasDrag);
    $('#discordVoiceCanvasPreview').addEventListener('pointercancel', endDiscordCanvasDrag);
    $('#forgetDiscordVoice').addEventListener('click', forgetDiscordVoice);
    $('#discordGuestUserId').addEventListener('keydown', (event) => { if (event.key === 'Enter') addDiscordVoiceProfile(); });
    $('#previewDualFormatButton').addEventListener('click', () => { void previewDualFormat(); });
    $('#refreshDualFormatButton').addEventListener('click', () => { void refreshDualFormat(); });
    $('#runSimulcastPreflightButton').addEventListener('click', () => { void runSimulcastPreflight(); });
    $('#refreshSimulcastButton').addEventListener('click', () => { void api('/v1/broadcast/simulcast/refresh', { method: 'POST', body: {} }).then(() => refreshRuntime()).catch((error) => toast(error.message, true)); });
    $('#startSimulcastButton').addEventListener('click', () => { void startSimulcast(); });
    $('#retryKickOutputButton').addEventListener('click', () => { void retryKickOutput(); });
    $('#stopKickOutputButton').addEventListener('click', () => { void stopSimulcast('kick'); });
    $('#stopAllOutputsButton').addEventListener('click', () => { void stopSimulcast('all', true); });
    document.querySelectorAll('.simulcast-manual-check').forEach((input) => input.addEventListener('change', saveSimulcastChecklist));
    $('#resetSimulcastChecklistButton').addEventListener('click', () => {
      document.querySelectorAll('.simulcast-manual-check').forEach((input) => { input.checked = false; });
      saveSimulcastChecklist();
    });
    $('#clearSimulcastTimelineButton').addEventListener('click', () => {
      simulcastOperations.incidents = [];
      saveSimulcastOperations();
      renderSimulcast();
    });
    $('#emergencyStopButton').addEventListener('click', toggleSafety);
    $('#eventSearch').addEventListener('input', renderEvents);
    $('#eventLevelFilter').addEventListener('change', renderEvents);
    $('#alertHistorySearch').addEventListener('input', renderAlertHistory);
    $('#alertHistoryKind').addEventListener('change', renderAlertHistory);
    $('#alertHistoryState').addEventListener('change', renderAlertHistory);
    $('#giphyTargetAlert').addEventListener('change', updateGiphyTargetContext);
    $('#twitchExperienceGoalSource').addEventListener('change', updateGoalEditorAvailability);
    $('#twitchExperienceGoalKind').addEventListener('change', (event) => {
      const presets = {
        subscriptions: ['Subscriber Goal', 'subs'],
        followers: ['Follower Goal', 'followers'],
        bits: ['Bits Goal', 'Bits'],
        donations: ['Donation Goal', 'donations'],
        custom: ['Stream Goal', 'points']
      };
      const [title, unit] = presets[event.target.value] || presets.custom;
      $('#twitchExperienceGoalTitle').value = title;
      $('#twitchExperienceGoalUnit').value = unit;
    });
    for (const meta of Object.values(twitchExperienceDesigners)) {
      $(`#twitchExperience${meta.prefix}MediaOpacity`).addEventListener('input', (event) => {
        $(`#twitchExperience${meta.prefix}MediaOpacityValue`).textContent = `${event.target.value}%`;
      });
    }
    $('#newInteractionAlertButton').addEventListener('click', openInteractionAlertDialog);
    $('#importMediaAsset').addEventListener('click', importMediaAsset);
    $('#adoptAssignedMedia').addEventListener('click', adoptAssignedMedia);
    $('#assetLibrarySearch').addEventListener('input', renderAssetLibrary);
    $('#assetLibraryFilter').addEventListener('change', renderAssetLibrary);
    $('#assetLibraryCollection').addEventListener('change', renderAssetLibrary);
    $('#assetEditorForm').addEventListener('submit', saveAssetDetails);
    $('#viewerGroupForm').addEventListener('submit', saveViewerGroup);
    $('#cancelViewerGroupEdit').addEventListener('click', resetViewerGroupForm);
    $('#newTwitchAlertButton').addEventListener('click', openTwitchAlertDialog);
    $('#interactionAlertForm').addEventListener('submit', createInteractionAlert);
    $('#twitchAlertForm').addEventListener('submit', createTwitchAlert);
    $('#twitchVariantForm').addEventListener('submit', createTwitchVariant);
    $('#newVariantConditionType').addEventListener('change', updateVariantConditionFields);
    $('#cancelVariantEdit').addEventListener('click', () => {
      const alert = state.twitchVisualAlerts.alerts.find((entry) => entry.id === $('#twitchVariantAlertId').value);
      if (alert) resetVariantRuleForm(alert);
    });
    $('#twitchDesignForm').addEventListener('submit', (event) => saveTwitchDesign(event));
    $('#savePreviewTwitchDesign').addEventListener('click', (event) => saveTwitchDesign(event, true));
    $('#resetTwitchDesign').addEventListener('click', () => { populateTwitchDesign(defaultCurrentAlertDesign()); pushAlertDesignHistory(); });
    $('#undoAlertDesign').addEventListener('click', () => moveAlertDesignHistory(-1));
    $('#redoAlertDesign').addEventListener('click', () => moveAlertDesignHistory(1));
    $('#previewAlertDesignHere').addEventListener('click', previewAlertDesignHere);
    $('#stopAlertDesignPreview').addEventListener('click', stopAlertDesignPreview);
    $('#previewAlertDesignOnCanvas').addEventListener('click', () => { void toggleAlertCanvasPositionPreview(); });
    $('#alignAlertHorizontal').addEventListener('click', () => alignTwitchPlacement('horizontal'));
    $('#alignAlertVertical').addEventListener('click', () => alignTwitchPlacement('vertical'));
    $('#alignAlertCenter').addEventListener('click', () => alignTwitchPlacement('both'));
    $('#twitchDesignSnap').addEventListener('change', updateTwitchPlacementPreview);
    $('#alertDesignSceneScope').addEventListener('change', (event) => { switchAlertScenePlacement(event.target.value); pushAlertDesignHistory(); });
    $('#useCurrentAlertScene').addEventListener('click', useCurrentAlertScene);
    $('#removeAlertScenePlacement').addEventListener('click', removeCurrentAlertScenePlacement);
    $('#validateAlertDesignCode').addEventListener('click', () => validateAlertDesignCode().catch((error) => toast(error.message, true)));
    $('#importAlertDesign').addEventListener('click', importAlertDesignTemplate);
    $('#exportAlertDesign').addEventListener('click', exportAlertDesignTemplate);
    $('#duplicateAlertDesign').addEventListener('click', openDuplicateAlertDesign);
    $('#duplicateAlertDesignForm').addEventListener('submit', duplicateAlertDesign);
    $('#twitchDesignPosition').addEventListener('change', updateTwitchPlacementPreview);
    ['#twitchDesignCustomX', '#twitchDesignCustomY'].forEach((selector) => $(selector).addEventListener('input', () => {
      $('#twitchDesignPosition').value = 'custom';
      updateTwitchPlacementPreview();
    }));
    ['#twitchDesignScale', '#twitchDesignPositionX', '#twitchDesignPositionY', '#twitchDesignCardWidth', '#twitchDesignMediaWidth', '#twitchDesignMediaHeight', '#twitchDesignTextPositionX', '#twitchDesignTextPositionY', '#twitchDesignEyebrowX', '#twitchDesignEyebrowY', '#twitchDesignHeadlineX', '#twitchDesignHeadlineY', '#twitchDesignDetailX', '#twitchDesignDetailY', '#twitchDesignMessageX', '#twitchDesignMessageY', '#twitchDesignShowEyebrow', '#twitchDesignShowHeadline', '#twitchDesignShowDetail', '#twitchDesignShowMessage', '#twitchDesignFont', '#twitchDesignTextAlign', '#twitchDesignMediaFit', '#twitchDesignMediaScale', '#twitchDesignMediaPositionX', '#twitchDesignMediaPositionY', '#twitchDesignMediaOpacity', '#twitchDesignEyebrowFontSize', '#twitchDesignHeadlineFontSize', '#twitchDesignDetailFontSize', '#twitchDesignMessageFontSize', '#twitchDesignEyebrowColor', '#twitchDesignHeadlineColor', '#twitchDesignDetailColor', '#twitchDesignMessageColor', '#twitchDesignEyebrowMaxWidth', '#twitchDesignHeadlineMaxWidth', '#twitchDesignDetailMaxWidth', '#twitchDesignMessageMaxWidth', '#twitchDesignHeadline', '#twitchDesignDetail', '#alertDesignPreviewViewer', '#alertDesignPreviewAmount', '#alertDesignPreviewMessage'].forEach((selector) => $(selector).addEventListener('input', updateTwitchPlacementPreview));
    $('#twitchDesignLayout').addEventListener('change', updateTwitchPlacementPreview);
    $('#twitchDesignForm').addEventListener('change', pushAlertDesignHistory);
    $('#twitchDesignForm').addEventListener('input', scheduleAlertCanvasPositionPreview);
    $('#twitchPlacementMock').addEventListener('pointerdown', beginTwitchPlacementInteraction);
    $('#twitchPlacementMock').addEventListener('keydown', moveTwitchPlacementWithKeyboard);
    $('#twitchDesignDialog').addEventListener('close', () => { stopAlertDesignPreview(); void stopAlertCanvasPositionPreview(false); });
    window.addEventListener('resize', updateTwitchPlacementPreview);
    $('#newInteractionAlertName').addEventListener('input', () => {
      const key = $('#newInteractionAlertKey');
      if (key.dataset.auto === 'true') key.value = alertKey($('#newInteractionAlertName').value);
      updateInteractionCuePreview();
    });
    $('#newInteractionAlertKey').addEventListener('input', () => { $('#newInteractionAlertKey').dataset.auto = 'false'; updateInteractionCuePreview(); });
    $('#newInteractionWarudoEnabled').addEventListener('change', () => { $('#newInteractionWarudoOptions').hidden = !$('#newInteractionWarudoEnabled').checked; });
    $('#newInteractionVTubeStudioEnabled').addEventListener('change', () => { $('#newInteractionVTubeStudioOptions').hidden = !$('#newInteractionVTubeStudioEnabled').checked; });
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
    $('#openStreamTogetherCall').addEventListener('click', openStreamTogetherCall);
    $('#closeStreamTogetherCall').addEventListener('click', closeStreamTogetherCall);
    $('#connectChatbotButton').addEventListener('click', connectChatbot);
    $('#saveChatbotIdentity').addEventListener('click', () => { void saveChatbotIdentity(); });
    $('#validateChatbotButton').addEventListener('click', validateChatbot);
    $('#disconnectChatbotButton').addEventListener('click', disconnectChatbot);
    $('#saveKickConfiguration').addEventListener('click', () => { void saveKickConfiguration(); });
    $('#connectKickButton').addEventListener('click', connectKick);
    $('#validateKickButton').addEventListener('click', validateKick);
    $('#linkKickRelayButton').addEventListener('click', () => { void linkKickRelay(); });
    $('#disconnectKickButton').addEventListener('click', disconnectKick);
    $('#copyKickRedirectUri').addEventListener('click', (event) => copyToClipboard($('#kickRedirectUri').value, event.currentTarget));
    $('#copyKickWebhookUrl').addEventListener('click', (event) => copyToClipboard($('#kickWebhookUrl').value, event.currentTarget));
    $('#openChatbotIsolatedAuthorization').addEventListener('click', openChatbotIsolatedAuthorization);
    $('#copyChatbotAuthorizationCode').addEventListener('click', (event) => state.chatbotDeviceAuthorization && copyToClipboard(state.chatbotDeviceAuthorization.userCode, event.currentTarget));
    $('#copyChatbotAuthorizationLink').addEventListener('click', (event) => state.chatbotDeviceAuthorization && copyToClipboard(state.chatbotDeviceAuthorization.verificationUri, event.currentTarget));
    $('#openChatbotAuthorization').addEventListener('click', () => state.chatbotDeviceAuthorization && window.tempestStudio.openExternal(state.chatbotDeviceAuthorization.verificationUri).catch((error) => toast(error.message, true)));
    $('#chatbotCommandForm').addEventListener('submit', saveChatbotCommand);
    $('#chatbotAutoMessagesForm').addEventListener('submit', saveChatbotAutoMessages);
    $('#chatbotPollForm').addEventListener('submit', startChatbotPoll);
    $('#stopChatbotPoll').addEventListener('click', stopChatbotPoll);
    $('#clearChatbotPoll').addEventListener('click', clearChatbotPoll);
    $('#copyChatbotPollOverlayUrl').addEventListener('click', (event) => copyToClipboard($('#chatbotPollOverlayUrl').textContent, event.currentTarget));
    $('#twitchPredictionForm').addEventListener('submit', startTwitchPrediction);
    $('#refreshTwitchPrediction').addEventListener('click', refreshTwitchPrediction);
    $('#lockTwitchPrediction').addEventListener('click', () => endTwitchPrediction('LOCKED'));
    $('#cancelTwitchPrediction').addEventListener('click', () => endTwitchPrediction('CANCELED'));
    $('#chatbotAutoModForm').addEventListener('submit', saveChatbotAutoMod);
    $('#testChatbotAutoMod').addEventListener('click', testChatbotAutoMod);
    $('#chatbotAutoModAction').addEventListener('change', () => { $('#chatbotAutoModTimeoutControl').hidden = $('#chatbotAutoModAction').value !== 'timeout'; });
    $('#chatbotRaidAutomationForm').addEventListener('submit', saveChatbotRaidAutomation);
    $('#testChatbotRaidAutomation').addEventListener('click', testChatbotRaidAutomation);
    $('#chatbotFirstChatShoutoutForm').addEventListener('submit', saveChatbotFirstChatShoutouts);
    $('#chatbotProvidersForm').addEventListener('submit', saveChatbotProviders);
    $('#chatbotCommandPermission').addEventListener('change', protectSharedChatCommandPolicy);
    $('#chatbotCommandHandler').addEventListener('change', () => {
      const counter = $('#chatbotCommandHandler').value === 'counter';
      $('#chatbotCounterFields').hidden = !counter;
      if (counter && !$('#chatbotCounterLabel').value.trim()) $('#chatbotCounterLabel').value = $('#chatbotCommandName').value.trim() || 'Counter';
    });
    $('#chatbotCommandWorkflow').addEventListener('change', protectSharedChatCommandPolicy);
    $('#resetChatbotCommand').addEventListener('click', resetChatbotCommandForm);
    $('#deleteChatbotCommand').addEventListener('click', deleteChatbotCommand);
    $('#chatbotPrefix').addEventListener('change', saveChatbotPrefix);
    $('#testChatbotCommand').addEventListener('click', testChatbotCommand);
    $('#sharedChatComposer').addEventListener('submit', sendSharedChatMessage);
    $('#sharedChatPlatform').addEventListener('change', renderChatbot);
    $('#clearSharedChatMessages').addEventListener('click', clearSharedChatMessages);
    $('#startLocalExtension').addEventListener('click', startLocalExtension);
    document.querySelectorAll('input[name="twitchExtensionCompanion"]').forEach((input) => input.addEventListener('change', saveTwitchExtensionCompanions));
    $('#resetExtensionFeaturePlacement').addEventListener('click', resetExtensionFeaturePlacement);
    $('#pairHostedExtension').addEventListener('click', pairHostedExtension);
    $('#switchHostedExtensionToOfficialTwitch').addEventListener('click', switchHostedExtensionToOfficialTwitch);
    $('#revokeHostedExtension').addEventListener('click', revokeHostedExtension);
    $('#stopLocalExtension').addEventListener('click', stopLocalExtension);
    $('#openLocalExtensionPanel').addEventListener('click', () => window.tempestStudio.openLocalExtensionPanel().catch((error) => toast(error.message, true)));
    $('#prepareLocalExtensionCertificate').addEventListener('click', prepareLocalExtensionCertificate);
    $('#removeLocalExtensionCertificate').addEventListener('click', removeLocalExtensionCertificate);
    $('#forgetLocalExtensionSecret').addEventListener('click', forgetLocalExtensionSecret);
    $('#panelDesignForm').addEventListener('submit', savePanelDesign);
    $('#panelDesignForm').querySelectorAll('input, select').forEach((input) => input.addEventListener('input', updatePanelDesignPreview));
    $('#panelDesignPreset').addEventListener('change', applyPanelPreset);
    $('#resetPanelDesign').addEventListener('click', () => populatePanelDesign(defaultPanelDesign()));
    $('#openDesignedPanel').addEventListener('click', openDesignedPanel);
    $('#saveInterfaceMode').addEventListener('click', saveInterfaceMode);
    $('#openStudioDataDirectory').addEventListener('click', () => window.tempestStudio.openDataDirectory().catch((error) => toast(error.message, true)));
    $('#checkForStudioUpdates').addEventListener('click', checkForStudioUpdates);
    $('#downloadStudioUpdate').addEventListener('click', downloadStudioUpdate);
    $('#installStudioUpdate').addEventListener('click', installStudioUpdate);
    $('#exportStudioDiagnostics').addEventListener('click', async () => {
      try {
        const result = await window.tempestStudio.exportDiagnostics();
        if (result) toast('Redacted diagnostics exported.');
      } catch (error) { toast(error.message, true); }
    });
    $('#openTwitchAuthorization').addEventListener('click', () => state.twitchDeviceAuthorization && window.tempestStudio.openExternal(state.twitchDeviceAuthorization.verificationUri).catch((error) => toast(error.message, true)));
    document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
    document.body.addEventListener('change', (event) => {
      const extensionFeatureInput = event.target.closest('[data-extension-feature-destination]');
      if (extensionFeatureInput) {
        void saveExtensionFeaturePlacement(extensionFeatureInput);
        return;
      }
      const worldViewerActor = event.target.closest('[data-world-viewer-actor]');
      if (worldViewerActor) {
        void setWorldViewerActor(worldViewerActor.dataset.worldViewerActor, worldViewerActor.value);
        return;
      }
      const canvasMode = event.target.closest('#onboardingCanvasProfileMode');
      if (canvasMode) {
        writeOnboardingPreferences({ canvasProfileMode: canvasMode.value, flags: { canvasConfigured: canvasMode.value === 'auto' ? Boolean(broadcastCanvasProfile()) : true } });
        renderOnboardingSummary();
        renderOnboarding();
        updateTwitchPlacementPreview();
        return;
      }
      const canvasField = event.target.closest('[data-canvas-field]');
      if (canvasField) {
        const preferences = readOnboardingPreferences();
        const current = { ...(preferences.customCanvasProfile || activeCanvasProfile()), [canvasField.dataset.canvasField]: Number(canvasField.value) };
        writeOnboardingPreferences({ canvasProfileMode: 'custom', customCanvasProfile: current, flags: { canvasConfigured: true } });
        renderOnboardingSummary();
        renderOnboarding();
        updateTwitchPlacementPreview();
        return;
      }
      const onboardingFlag = event.target.closest('[data-onboarding-flag]');
      if (onboardingFlag) {
        writeOnboardingPreferences({ flags: { [onboardingFlag.dataset.onboardingFlag]: onboardingFlag.checked } });
        renderOnboardingSummary();
        renderOnboarding();
        return;
      }
      const warudoInput = event.target.closest('[data-alert-warudo-enabled]');
      if (warudoInput) {
        const options = document.querySelector(`[data-alert-warudo-options="${CSS.escape(warudoInput.dataset.alertWarudoEnabled)}"]`);
        if (options) options.hidden = !warudoInput.checked;
        return;
      }
      const vtubeStudioInput = event.target.closest('[data-alert-vtube-studio-enabled]');
      if (vtubeStudioInput) {
        const options = document.querySelector(`[data-alert-vtube-studio-options="${CSS.escape(vtubeStudioInput.dataset.alertVtubeStudioEnabled)}"]`);
        if (options) options.hidden = !vtubeStudioInput.checked;
      }
    });
    document.body.addEventListener('click', handleAction);
  }

  async function initialize() {
    bindEvents();
    renderInterfaceMode();
    switchChatbotTab(chatbotWorkspaceTab);
    showSection('overview', 'home');
    restoreSimulcastChecklist();
    restoreSimulcastOperations();
    window.tempestStudio.onSoundAlertPlayback(handleSoundAlertPlayback);
    window.tempestStudio.onUpdateStatus((update) => { state.update = update; renderUpdateStatus(); });
    window.tempestStudio.onStreamTogetherStatus((status) => { state.streamTogether = status; renderStreamTogether(); });
    [state.config, state.panelDesign, state.appInfo, state.privacy, state.update, state.streamTogether] = await Promise.all([window.tempestStudio.getBridgeConfig(), window.tempestStudio.getTwitchPanelDesign(), window.tempestStudio.getAppInfo(), window.tempestStudio.getPrivacySettings(), window.tempestStudio.getUpdateStatus(), window.tempestStudio.getStreamTogetherStatus()]);
    renderPrivacySettings();
    populatePanelDesign(state.panelDesign);
    $('#panelDesignStateBadge').textContent = 'SAVED LOCALLY';
    $('#panelDesignStateBadge').classList.remove('offline');
    $('#protocolBadge').textContent = `API ${state.config.protocolVersion}`;
    $('#studioDataVersion').textContent = `DATA V${state.config.dataMigration?.dataVersion || '?'}${state.config.dataMigration?.migrated ? ' · UPGRADED' : ' · CURRENT'}`;
    $('#httpEndpoint').textContent = state.config.baseUrl;
    $('#socketEndpoint').textContent = `${state.config.baseUrl.replace('http', 'ws')}/v1/socket`;
    renderAbout();
    renderUpdateStatus();
    await refresh();
    if (!onboardingAutoOpened && readOnboardingPreferences().completed !== true) {
      onboardingAutoOpened = true;
      openOnboarding({ firstIncomplete: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void refresh({ quiet: true });
    });
    setInterval(() => { if (!document.hidden) void refreshRuntime(); }, 1000);
    setInterval(() => { if (!document.hidden) void refresh({ quiet: true }); }, fullRefreshIntervalMs);
    window.__tempestStudioReady = true;
  }

  initialize().catch((error) => {
    console.error('Studio initialization failed:', error);
    renderBridgeStatus(false);
    toast(`Studio initialization failed: ${error.message}`, true);
  });
})();
