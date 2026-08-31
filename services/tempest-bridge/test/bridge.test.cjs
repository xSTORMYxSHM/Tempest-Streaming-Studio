const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, writeFile } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const WebSocket = require('ws');
const { startTempestBridge, TempestTwitchVisualAlertCatalog } = require('../dist');
const { createBridgeMessage } = require('@tempest/contracts');

const application = {
  schemaVersion: 1,
  id: 'com.tempestmainframe.test-client',
  name: 'Test Client',
  version: '1.0.0',
  apiVersion: '1.0',
  state: 'development',
  capabilities: { provides: ['test.events'], consumes: ['system.health'] },
  assetTypes: { reads: ['tempest.scene'], writes: ['tempest.profile'] }
};

test('selects the highest-priority matching Twitch alert variant and keeps the base fallback', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-twitch-variant-test-'));
  const catalog = new TempestTwitchVisualAlertCatalog(dataDirectory);
  await catalog.initialize();
  const base = catalog.find('twitch.cheer');
  assert.ok(base);
  await catalog.update('twitch.cheer', {
    alertVariants: [
      { schemaVersion: 1, id: 'large', name: 'Large Cheer', enabled: true, priority: 5, condition: { minimumBits: 500 }, durationMs: 5000, volume: 0.6, accent: '#22CCFF', design: base.design },
      { schemaVersion: 1, id: 'mega', name: 'Mega Cheer', enabled: true, priority: 20, condition: { minimumBits: 1000 }, durationMs: 8000, volume: 0.9, accent: '#FF44AA', design: { ...base.design, preset: 'cinematic' } }
    ]
  });
  const event = (id, bits) => ({ schemaVersion: 1, id, topic: 'viewer.cheer.received', occurredAt: new Date().toISOString(), source: 'twitch', channel: { id: 'channel' }, viewer: { id: 'viewer', displayName: 'Variant Tester' }, payload: { bits } });
  const mega = catalog.findForEvent(event('mega-event', 1500));
  assert.equal(mega.selectedVariantId, 'mega');
  assert.equal(mega.name, 'Mega Cheer');
  assert.equal(mega.durationMs, 8000);
  assert.equal(mega.design.preset, 'cinematic');
  const large = catalog.findForEvent(event('large-event', 750));
  assert.equal(large.selectedVariantId, 'large');
  const fallback = catalog.findForEvent(event('base-event', 100));
  assert.equal(fallback.selectedVariantId, undefined);
  assert.equal(fallback.name, 'Cheer / Bits');
});

test('persists applications and assets behind authenticated routes', async (context) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-bridge-test-'));
  const runtime = await startTempestBridge({
    port: 0,
    dataDirectory,
    logger: { info() {}, warn() {}, error() {} },
    chatbotFetchImplementation: async (url) => {
      assert.equal(String(url), 'https://radio.example/api/nowplaying/station');
      return new Response(JSON.stringify({
        is_online: true,
        station: { name: 'Example Radio' },
        now_playing: { song: { artist: 'Aster Null', title: 'Error Stars', album: 'The Coordinates Are Laughing' } }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  context.after(() => runtime.close());

  const health = await fetch(`${runtime.baseUrl}/health`).then((response) => response.json());
  assert.equal(health.status, 'online');
  assert.equal(health.productVersion, '1.0.0');

  const unauthorized = await fetch(`${runtime.baseUrl}/v1/applications`);
  assert.equal(unauthorized.status, 401);

  const headers = { 'Content-Type': 'application/json', 'X-Tempest-Token': runtime.token };
  await fetch(`${runtime.baseUrl}/v1/chatbot/configuration`, { method: 'POST', headers, body: JSON.stringify({ nowPlayingProvider: { provider: 'azuracast', stationName: 'Example Radio', apiUrl: 'https://radio.example/api/nowplaying/station', publicPlayerUrl: 'https://radio.example/public/station' } }) });
  const registered = await fetch(`${runtime.baseUrl}/v1/applications`, {
    method: 'POST', headers, body: JSON.stringify(application)
  });
  assert.equal(registered.status, 201);

  const assetResponse = await fetch(`${runtime.baseUrl}/v1/assets`, {
    method: 'POST', headers, body: JSON.stringify({
      schemaVersion: 1,
      id: 'com.tempestmainframe.asset.test-scene',
      type: 'tempest.scene',
      name: 'Test Scene',
      version: '1.0.0',
      producer: application.id,
      uri: 'file:///test.scene'
    })
  });
  assert.equal(assetResponse.status, 201);

  const applications = await fetch(`${runtime.baseUrl}/v1/applications`, { headers }).then((response) => response.json());
  const assets = await fetch(`${runtime.baseUrl}/v1/assets`, { headers }).then((response) => response.json());
  const radio = await fetch(`${runtime.baseUrl}/v1/integrations/now-playing`, { headers }).then((response) => response.json());
  assert.equal(applications.applications.length, 1);
  assert.equal(assets.assets.length, 1);
  assert.equal(radio.state, 'online');
  assert.equal(radio.nowPlaying.title, 'Error Stars');
});

test('enforces assigned-creator access before Extension interactions enter Studio', async (context) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-interaction-access-test-'));
  const runtime = await startTempestBridge({ port: 0, dataDirectory, logger: { info() {}, warn() {}, error() {} } });
  context.after(() => runtime.close());
  const headers = { 'Content-Type': 'application/json', 'X-Tempest-Token': runtime.token };
  const configured = await fetch(`${runtime.baseUrl}/v1/chatbot/configuration`, {
    method: 'POST', headers, body: JSON.stringify({
      firstChatShoutouts: { enabled: false, channels: ['creator_one'] },
      interactionAccess: { mode: 'assigned-creators', allowBroadcasterAndModerators: true }
    })
  });
  assert.equal(configured.status, 200);
  const event = (id, viewer) => ({ schemaVersion: 1, id, topic: 'viewer.interaction.requested', occurredAt: new Date().toISOString(), source: 'twitch', channel: { id: '546679431' }, viewer, payload: { action: 'sound-alert.hype-pulse' } });
  const unlinked = await fetch(`${runtime.baseUrl}/v1/integrations/twitch/events`, { method: 'POST', headers, body: JSON.stringify(event('restricted-unlinked', { id: 'Uviewer123', roles: ['viewer'] })) });
  assert.equal(unlinked.status, 403);
  assert.equal((await unlinked.json()).code, 'identity_required');
  const moderator = await fetch(`${runtime.baseUrl}/v1/integrations/twitch/events`, { method: 'POST', headers, body: JSON.stringify(event('restricted-moderator', { id: '303', roles: ['moderator'] })) });
  assert.equal(moderator.status, 202);
});

test('accepts authenticated WebSocket clients and sends a welcome envelope', async (context) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-socket-test-'));
  const runtime = await startTempestBridge({ port: 0, dataDirectory, logger: { info() {}, warn() {}, error() {} } });
  context.after(() => runtime.close());

  const welcome = await new Promise((resolve, reject) => {
    const socket = new WebSocket(`${runtime.baseUrl.replace('http', 'ws')}/v1/socket?token=${runtime.token}`);
    socket.once('message', (data) => {
      resolve(JSON.parse(data.toString()));
      socket.close();
    });
    socket.once('error', reject);
  });
  assert.equal(welcome.kind, 'welcome');
  assert.equal(welcome.protocolVersion, '1.0');
});

test('reports adapter identity, capabilities, and published health on the connections route', async (context) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-adapter-health-test-'));
  const runtime = await startTempestBridge({ port: 0, dataDirectory, logger: { info() {}, warn() {}, error() {} } });
  context.after(() => runtime.close());
  const socket = new WebSocket(`${runtime.baseUrl.replace('http', 'ws')}/v1/socket?token=${runtime.token}`);
  context.after(() => socket.close());
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  socket.send(JSON.stringify(createBridgeMessage({
    kind: 'hello',
    source: 'com.tempestmainframe.tempest-broadcast',
    payload: {
      applicationId: 'com.tempestmainframe.tempest-broadcast',
      version: '0.15.0',
      capabilities: ['broadcast.reaction.trigger', 'broadcast.status']
    }
  })));
  socket.send(JSON.stringify(createBridgeMessage({
    kind: 'publish',
    source: 'com.tempestmainframe.tempest-broadcast',
    topic: 'broadcast.status',
    payload: { ready: true, streaming: false, recording: true, activeLeases: 1, canvasProfile: { baseWidth: 3440, baseHeight: 1440, outputWidth: 2580, outputHeight: 1080, fpsNumerator: 60, fpsDenominator: 1 } }
  })));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const headers = { 'X-Tempest-Token': runtime.token };
  const body = await fetch(`${runtime.baseUrl}/v1/connections`, { headers }).then((response) => response.json());
  assert.equal(body.connections[0].applicationId, 'com.tempestmainframe.tempest-broadcast');
  assert.equal(body.connections[0].version, '0.15.0');
  assert.deepEqual(body.connections[0].capabilities, ['broadcast.reaction.trigger', 'broadcast.status']);
  assert.equal(body.connections[0].status.recording, true);
  assert.equal(body.connections[0].status.activeLeases, 1);
  assert.deepEqual(body.connections[0].status.canvasProfile, { baseWidth: 3440, baseHeight: 1440, outputWidth: 2580, outputHeight: 1080, fpsNumerator: 60, fpsDenominator: 1 });
});

test('owns a free Sound Alert catalog, configuration, playback, and emergency stop', async (context) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-sound-alert-test-'));
  const visualPath = path.join(dataDirectory, 'hype-pulse.png');
  const audioPath = path.join(dataDirectory, 'hype-pulse.mp3');
  const audioBytes = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]);
  await writeFile(visualPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await writeFile(audioPath, audioBytes);
  const playback = [];
  const runtime = await startTempestBridge({
    port: 0,
    dataDirectory,
    soundAlertPlayback(command) { playback.push(command); },
    logger: { info() {}, warn() {}, error() {} }
  });
  context.after(() => runtime.close());
  const headers = { 'Content-Type': 'application/json', 'X-Tempest-Token': runtime.token };

  const catalog = await fetch(`${runtime.baseUrl}/v1/sound-alerts`, { headers }).then((response) => response.json());
  assert.equal(catalog.owner, 'tempest-mainframe-studio');
  assert.equal(catalog.pricing, 'free');
  assert.equal(catalog.alerts.length, 6);
  assert.ok(catalog.alerts.every((alert) => alert.free === true));
  assert.ok(catalog.alerts.every((alert) => alert.warudoEnabled === false));
  assert.ok(catalog.alerts.every((alert) => alert.vtubeStudioEnabled === false));
  assert.equal(catalog.alerts.find((alert) => alert.id === 'sound-alert.hype-pulse').durationMs, 8000);

  const configured = await fetch(`${runtime.baseUrl}/v1/sound-alerts/${encodeURIComponent('sound-alert.hype-pulse')}`, {
    method: 'POST', headers, body: JSON.stringify({
      durationMs: 1000,
      viewerCooldownMs: 5000,
      globalCooldownMs: 1000,
      volume: 0.5,
      audioUri: pathToFileURL(audioPath).href,
      visualUri: pathToFileURL(visualPath).href,
      visualDurationMs: 2000,
      broadcastVisualSource: 'Hype Pulse GIF',
      broadcastEffect: 'glitch',
      broadcastCircuit: 'frame',
      broadcastEffectStrength: 1.25,
      accent: '#22ccff'
    })
  });
  assert.equal(configured.status, 200);
  const configuredAlert = (await configured.json()).alert;
  assert.equal(configuredAlert.volume, 0.5);
  assert.equal(configuredAlert.visualUri, pathToFileURL(visualPath).href);
  assert.equal(configuredAlert.visualDurationMs, 2000);
  assert.equal(configuredAlert.broadcastAudioSource, undefined);
  assert.equal(configuredAlert.broadcastVisualSource, 'Hype Pulse GIF');
  assert.equal(configuredAlert.broadcastEffect, 'glitch');
  assert.equal(configuredAlert.broadcastCircuit, 'frame');
  assert.equal(configuredAlert.broadcastEffectStrength, 1.25);
  assert.equal(configuredAlert.accent, '#22CCFF');

  const triggered = await fetch(`${runtime.baseUrl}/v1/sound-alerts/${encodeURIComponent('sound-alert.hype-pulse')}/trigger`, {
    method: 'POST', headers, body: JSON.stringify({ source: 'studio.operator', eventId: 'hype-pulse-test-1', viewerId: 'operator', simulateMissing: true, bypassCooldown: true })
  });
  assert.equal(triggered.status, 202);
  const result = await triggered.json();
  assert.equal(result.alert.cue, 'sound-alert.hype-pulse');
  assert.equal(result.run.triggerEventId, 'hype-pulse-test-1');
  assert.equal(result.run.actions[0].capability, 'broadcast.reaction.trigger');
  assert.equal(result.run.actions.some((action) => action.capability === 'avatar.performance.apply'), false);
  assert.equal(new Date(result.run.endsAt).getTime() - new Date(result.run.startedAt).getTime(), 1000);
  assert.equal(playback[0].phase, 'play');
  assert.equal(playback[0].alert.audioUri, pathToFileURL(audioPath).href);

  const overlayPage = await fetch(`${runtime.baseUrl}/visual-alerts`);
  assert.equal(overlayPage.status, 200);
  assert.match(overlayPage.headers.get('content-type'), /^text\/html/);
  const overlayMarkup = await overlayPage.text();
  assert.match(overlayMarkup, /Tempest Studio Visual Alerts/);
  assert.match(overlayMarkup, /new EventSource\("\/visual-alerts\/interactions\/events"\)/);
  assert.match(overlayMarkup, /id="alertAudio"/);
  assert.match(overlayMarkup, /id="customStyle"/);
  assert.match(overlayMarkup, /id="placement"/);
  assert.match(overlayMarkup, /speechSynthesis/);
  assert.match(overlayMarkup, /data-layout="media-overlay"/);
  assert.match(overlayMarkup, /id="customHtml"/);
  assert.match(overlayMarkup, /TempestAlertContext/);
  assert.match(overlayMarkup, /Content-Security-Policy/);
  const overlayScript = overlayMarkup.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(overlayScript);
  assert.doesNotThrow(() => new Function(overlayScript));
  const overlayStatus = await fetch(`${runtime.baseUrl}/v1/visual-alerts`, { headers }).then((response) => response.json());
  assert.equal(overlayStatus.interaction.url, `${runtime.baseUrl}/visual-alerts/interactions`);
  assert.equal(overlayStatus.twitch.url, `${runtime.baseUrl}/visual-alerts/twitch`);
  assert.equal(overlayStatus.interaction.state, 'showing');
  assert.equal(overlayStatus.twitch.state, 'ready');
  assert.equal(overlayStatus.interaction.activeAlert.name, 'Hype Pulse');
  assert.equal(overlayStatus.interaction.activeAlert.viewerName, 'A viewer');
  assert.equal(overlayStatus.interaction.activeAlert.durationMs, 2000);
  assert.equal(overlayStatus.interaction.activeAlert.audioUrl, '/visual-alerts/audio/sound-alert.hype-pulse');
  assert.equal(overlayStatus.interaction.activeAlert.audioDurationMs, 1000);
  assert.equal(overlayStatus.interaction.activeAlert.volume, 0.5);
  const visual = await fetch(`${runtime.baseUrl}/visual-alerts/media/${encodeURIComponent('sound-alert.hype-pulse')}`);
  assert.equal(visual.status, 200);
  assert.equal(visual.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await visual.arrayBuffer()), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const audio = await fetch(`${runtime.baseUrl}/visual-alerts/audio/${encodeURIComponent('sound-alert.hype-pulse')}`);
  assert.equal(audio.status, 200);
  assert.equal(audio.headers.get('content-type'), 'audio/mpeg');
  assert.deepEqual(Buffer.from(await audio.arrayBuffer()), audioBytes);
  const audioRange = await fetch(`${runtime.baseUrl}/visual-alerts/audio/${encodeURIComponent('sound-alert.hype-pulse')}`, { headers: { Range: 'bytes=1-3' } });
  assert.equal(audioRange.status, 206);
  assert.equal(audioRange.headers.get('content-range'), `bytes 1-3/${audioBytes.length}`);
  assert.deepEqual(Buffer.from(await audioRange.arrayBuffer()), audioBytes.subarray(1, 4));

  await new Promise((resolve) => setTimeout(resolve, 1050));
  const browserSourceEvents = await fetch(`${runtime.baseUrl}/visual-alerts/interactions/events`);
  assert.equal(browserSourceEvents.status, 200);
  const browserRouted = await fetch(`${runtime.baseUrl}/v1/sound-alerts/${encodeURIComponent('sound-alert.hype-pulse')}/trigger`, {
    method: 'POST', headers, body: JSON.stringify({ source: 'studio.simulator', eventId: 'hype-pulse-test-browser-audio', viewerId: 'operator', simulateMissing: true, bypassCooldown: true })
  });
  assert.equal(browserRouted.status, 202);
  const browserRoutedResult = await browserRouted.json();
  assert.equal(browserRoutedResult.queued, true);
  assert.equal(browserRoutedResult.queuePosition, 1);
  const queuedStatus = await fetch(`${runtime.baseUrl}/v1/alert-queue`, { headers }).then((response) => response.json());
  assert.equal(queuedStatus.active.alertId, 'sound-alert.hype-pulse');
  assert.equal(queuedStatus.waitingCount, 1);
  assert.equal(queuedStatus.waiting[0].alertId, 'sound-alert.hype-pulse');
  assert.equal(playback.length, 1, 'connected Browser Source suppresses the duplicate desktop audio copy');
  await browserSourceEvents.body.cancel();
  const separateAudioOverride = await fetch(`${runtime.baseUrl}/v1/sound-alerts/${encodeURIComponent('sound-alert.hype-pulse')}`, {
    method: 'POST', headers, body: JSON.stringify({ broadcastAudioSource: 'Interaction Song' })
  });
  assert.equal(separateAudioOverride.status, 200);
  assert.equal((await separateAudioOverride.json()).alert.broadcastAudioSource, 'Interaction Song');

  const stopped = await fetch(`${runtime.baseUrl}/v1/safety/stop`, { method: 'POST', headers, body: '{}' });
  assert.equal(stopped.status, 200);
  assert.equal((await stopped.json()).clearedQueuedAlerts, 2);
  assert.equal(playback.at(-1).phase, 'stop-all');
  const clearedOverlay = await fetch(`${runtime.baseUrl}/v1/visual-alerts`, { headers }).then((response) => response.json());
  assert.equal(clearedOverlay.state, 'ready');
  assert.equal(clearedOverlay.interaction.activeAlert, undefined);
  assert.equal(clearedOverlay.twitch.activeAlert, undefined);

  const previewed = await fetch(`${runtime.baseUrl}/v1/visual-alerts/${encodeURIComponent('sound-alert.hype-pulse')}/preview`, {
    method: 'POST', headers, body: JSON.stringify({ viewerName: 'Visual Operator' })
  });
  assert.equal(previewed.status, 202);
  const preview = await previewed.json();
  assert.equal(preview.activeAlert.name, 'Hype Pulse');
  assert.equal(preview.activeAlert.viewerName, 'Visual Operator');
  assert.equal(preview.activeAlert.audioUrl, undefined);
  const clearedPreview = await fetch(`${runtime.baseUrl}/v1/visual-alerts/clear`, { method: 'POST', headers, body: '{}' });
  assert.equal(clearedPreview.status, 200);
  assert.equal((await clearedPreview.json()).state, 'ready');

  const twitchOverlayPage = await fetch(`${runtime.baseUrl}/visual-alerts/twitch`);
  assert.equal(twitchOverlayPage.status, 200);
  assert.match(await twitchOverlayPage.text(), /new EventSource\("\/visual-alerts\/twitch\/events"\)/);

  const twitchVisualCatalog = await fetch(`${runtime.baseUrl}/v1/visual-alerts/twitch`, { headers }).then((response) => response.json());
  assert.equal(twitchVisualCatalog.alerts.length, 6);
  assert.ok(twitchVisualCatalog.alerts.some((alert) => alert.id === 'twitch.gift-subscription' && alert.variant === 'gift'));
  const configuredTwitchVisual = await fetch(`${runtime.baseUrl}/v1/visual-alerts/twitch/${encodeURIComponent('twitch.cheer')}`, {
    method: 'POST', headers, body: JSON.stringify({
      durationMs: 3000,
      volume: 0.35,
      audioUri: pathToFileURL(audioPath).href,
      visualUri: pathToFileURL(visualPath).href,
      accent: '#9146ff',
      design: {
        preset: 'neon',
        layout: 'media-overlay',
        position: 'custom',
        customPositionX: 73.5,
        customPositionY: 28.25,
        scale: 1.35,
        entranceAnimation: 'glitch',
        exitAnimation: 'slide-right',
        textAnimation: 'typewriter',
        headlineTemplate: '{viewer} sent {amount} Bits!',
        detailTemplate: '{message}',
        showViewerMessage: false,
        fontFamily: 'Impact',
        fontSize: 58,
        eyebrowFontSize: 15,
        detailFontSize: 26,
        messageFontSize: 18,
        textColor: '#ffffff',
        eyebrowTextColor: '#54f2eb',
        messageTextColor: '#ffccdd',
        textPositionX: 48.5,
        textPositionY: 76.25,
        mediaWidth: 1920,
        mediaHeight: 1080,
        mediaScale: 1.2,
        mediaPositionX: 62,
        mediaPositionY: 41,
        mediaOpacity: 0.9,
        soundDelayMs: 500,
        ttsEnabled: true,
        ttsTemplate: '{viewer} cheered {amount} Bits',
        customHtml: '<div class="custom-badge">{amount}</div>',
        customCss: '.name { text-transform: uppercase; }',
        customJavaScript: 'elements.card.dataset.testAmount = variables.amount;'
      }
    })
  });
  assert.equal(configuredTwitchVisual.status, 200);
  const configuredTwitchAlert = (await configuredTwitchVisual.json()).alert;
  assert.equal(configuredTwitchAlert.accent, '#9146FF');
  assert.equal(configuredTwitchAlert.volume, 0.35);
  assert.equal(configuredTwitchAlert.audioUri, pathToFileURL(audioPath).href);
  assert.equal(configuredTwitchAlert.visualUri, pathToFileURL(visualPath).href);
  assert.equal(configuredTwitchAlert.design.preset, 'neon');
  assert.equal(configuredTwitchAlert.design.layout, 'media-overlay');
  assert.equal(configuredTwitchAlert.design.position, 'custom');
  assert.equal(configuredTwitchAlert.design.customPositionX, 73.5);
  assert.equal(configuredTwitchAlert.design.customPositionY, 28.25);
  assert.equal(configuredTwitchAlert.design.scale, 1.35);
  assert.equal(configuredTwitchAlert.design.fontWeight, 800);
  assert.equal(configuredTwitchAlert.design.textPositionX, 48.5);
  assert.equal(configuredTwitchAlert.design.textPositionY, 76.25);
  assert.equal(configuredTwitchAlert.design.mediaWidth, 1920);
  assert.equal(configuredTwitchAlert.design.mediaHeight, 1080);
  assert.equal(configuredTwitchAlert.design.eyebrowFontSize, 15);
  assert.equal(configuredTwitchAlert.design.detailFontSize, 26);
  assert.equal(configuredTwitchAlert.design.messageTextColor, '#FFCCDD');
  assert.equal(configuredTwitchAlert.design.mediaScale, 1.2);
  assert.equal(configuredTwitchAlert.design.mediaPositionX, 62);
  assert.equal(configuredTwitchAlert.design.mediaOpacity, 0.9);
  assert.equal(configuredTwitchAlert.design.customHtml, '<div class="custom-badge">{amount}</div>');
  assert.equal(configuredTwitchAlert.design.customCss, '.name { text-transform: uppercase; }');
  assert.equal(configuredTwitchAlert.design.customJavaScript, 'elements.card.dataset.testAmount = variables.amount;');
  const configuredVariantResponse = await fetch(`${runtime.baseUrl}/v1/visual-alerts/twitch/${encodeURIComponent('twitch.cheer')}`, {
    method: 'POST', headers, body: JSON.stringify({ alertVariants: [{ schemaVersion: 1, id: 'mega-cheer', name: 'Mega Cheer', enabled: true, priority: 10, condition: { minimumBits: 1000 }, durationMs: 5000, volume: 0.75, audioUri: pathToFileURL(audioPath).href, visualUri: pathToFileURL(visualPath).href, accent: '#FF44AA', design: { ...configuredTwitchAlert.design, preset: 'cinematic' } }] })
  });
  assert.equal(configuredVariantResponse.status, 200);
  const armedForTwitchPreview = await fetch(`${runtime.baseUrl}/v1/safety/arm`, { method: 'POST', headers, body: '{}' });
  assert.equal(armedForTwitchPreview.status, 200);
  const broadcastSocket = new WebSocket(`${runtime.baseUrl.replace('http', 'ws')}/v1/socket?token=${runtime.token}`);
  context.after(() => broadcastSocket.close());
  await new Promise((resolve, reject) => {
    broadcastSocket.once('open', resolve);
    broadcastSocket.once('error', reject);
  });
  broadcastSocket.send(JSON.stringify(createBridgeMessage({
    kind: 'hello',
    source: 'com.tempestmainframe.tempest-broadcast',
    payload: {
      applicationId: 'com.tempestmainframe.tempest-broadcast',
      version: '0.15.0',
      capabilities: ['broadcast.reaction.trigger', 'broadcast.reaction.clear']
    }
  })));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const reactionCommandPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Twitch preview did not send a Broadcast reaction command.')), 1000);
    broadcastSocket.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.kind !== 'command' || message.topic !== 'broadcast.reaction.trigger') return;
      clearTimeout(timeout);
      resolve(message);
    });
  });
  const twitchPreview = await fetch(`${runtime.baseUrl}/v1/visual-alerts/twitch/${encodeURIComponent('twitch.cheer')}/preview`, { method: 'POST', headers, body: '{}' });
  assert.equal(twitchPreview.status, 202);
  const twitchPreviewBody = await twitchPreview.json();
  const twitchActiveAlert = twitchPreviewBody.activeAlert;
  const reactionCommand = await reactionCommandPromise;
  assert.equal(twitchActiveAlert.name, '100 Bits');
  assert.equal(twitchActiveAlert.audioUrl, '/visual-alerts/audio/twitch.cheer');
  assert.equal(twitchActiveAlert.mediaUrl, '/visual-alerts/media/twitch.cheer');
  assert.equal(twitchActiveAlert.volume, 0.35);
  assert.equal(twitchActiveAlert.design.entranceAnimation, 'glitch');
  assert.equal(twitchActiveAlert.variables.amount, '100');
  assert.equal(twitchActiveAlert.variables.viewer, 'Studio Operator');
  assert.equal(twitchPreviewBody.reactionRun.workflowId, 'com.tempestmainframe.workflow.twitch-alert-reaction');
  assert.equal(twitchPreviewBody.reactionRun.actions.length, 1);
  assert.equal(twitchPreviewBody.reactionRun.actions[0].releaseCapability, 'broadcast.reaction.clear');
  assert.equal(reactionCommand.payload.arguments.alertId, 'twitch.cheer');
  assert.equal(reactionCommand.payload.arguments.eventType, 'twitch-alert');
  assert.equal(reactionCommand.payload.arguments.circuit, 'alerts');
  assert.equal(reactionCommand.payload.arguments.effect, 'spectrum');
  assert.equal(reactionCommand.payload.arguments.accent, '#9146FF');
  assert.equal(reactionCommand.payload.arguments.preview, true);
  assert.equal(reactionCommand.payload.lease.durationMs, 3000);
  const variantPreview = await fetch(`${runtime.baseUrl}/v1/visual-alerts/twitch/${encodeURIComponent('twitch.cheer')}/preview`, { method: 'POST', headers, body: JSON.stringify({ variantId: 'mega-cheer' }) });
  assert.equal(variantPreview.status, 202);
  const variantActiveAlert = (await variantPreview.json()).activeAlert;
  assert.equal(variantActiveAlert.name, '1000 Bits');
  assert.equal(variantActiveAlert.mediaUrl, '/visual-alerts/media/twitch.cheer?variant=mega-cheer');
  assert.equal(variantActiveAlert.audioUrl, '/visual-alerts/audio/twitch.cheer?variant=mega-cheer');
  assert.equal(variantActiveAlert.design.preset, 'cinematic');
  assert.equal((await fetch(`${runtime.baseUrl}${variantActiveAlert.mediaUrl}`)).status, 200);
  assert.equal((await fetch(`${runtime.baseUrl}${variantActiveAlert.audioUrl}`)).status, 200);
  const splitOverlayStatus = await fetch(`${runtime.baseUrl}/v1/visual-alerts`, { headers }).then((response) => response.json());
  assert.equal(splitOverlayStatus.interaction.state, 'ready');
  assert.equal(splitOverlayStatus.twitch.state, 'showing');
  assert.equal(splitOverlayStatus.twitch.activeAlert.alertId, 'twitch.cheer');
  const alertHistory = await fetch(`${runtime.baseUrl}/v1/alert-history`, { headers }).then((response) => response.json());
  assert.ok(alertHistory.records.some((record) => record.alertId === 'twitch.cheer' && record.preview && record.state === 'completed'));
  const alertDiagnostics = await fetch(`${runtime.baseUrl}/v1/alert-diagnostics`, { headers }).then((response) => response.json());
  assert.equal(alertDiagnostics.configured.unavailableAssets, 0);
  assert.ok(alertDiagnostics.configured.assignedAssets >= 3);
  const twitchAudio = await fetch(`${runtime.baseUrl}/visual-alerts/audio/${encodeURIComponent('twitch.cheer')}`);
  assert.equal(twitchAudio.status, 200);
  assert.equal(twitchAudio.headers.get('content-type'), 'audio/mpeg');
  assert.deepEqual(Buffer.from(await twitchAudio.arrayBuffer()), audioBytes);

  const chatPage = await fetch(`${runtime.baseUrl}/chat-overlay`);
  assert.equal(chatPage.status, 200);
  assert.match(await chatPage.text(), /Tempest Studio Chat Overlay/);
  const chatSettings = await fetch(`${runtime.baseUrl}/v1/chat-overlay/settings`, {
    method: 'POST', headers, body: JSON.stringify({ position: 'right', maxMessages: 4, messageDurationMs: 5000, showRoles: false, accent: '#22ccff', backgroundOpacity: 0.75 })
  });
  assert.equal(chatSettings.status, 200);
  assert.equal((await chatSettings.json()).settings.position, 'right');
  const chatPreview = await fetch(`${runtime.baseUrl}/v1/chat-overlay/preview`, { method: 'POST', headers, body: '{}' });
  assert.equal(chatPreview.status, 202);
  assert.match((await chatPreview.json()).message.text, /chat overlay is online/i);
  const chatStatus = await fetch(`${runtime.baseUrl}/v1/chat-overlay`, { headers }).then((response) => response.json());
  assert.equal(chatStatus.messageCount, 1);
  assert.equal(chatStatus.settings.accent, '#22CCFF');
  assert.equal((await fetch(`${runtime.baseUrl}/v1/chat-overlay/clear`, { method: 'POST', headers, body: '{}' })).status, 200);

  const emoteWallPage = await fetch(`${runtime.baseUrl}/emote-wall`);
  assert.equal(emoteWallPage.status, 200);
  assert.match(await emoteWallPage.text(), /Tempest Studio Emote Wall/);
  const emoteSettings = await fetch(`${runtime.baseUrl}/v1/emote-wall/settings`, {
    method: 'POST', headers, body: JSON.stringify({ enabled: true, maxActive: 12, lifetimeMs: 6000, sizePx: 120, speed: 140, includeAnimated: true, includeGifs: false })
  });
  assert.equal(emoteSettings.status, 200);
  assert.equal((await emoteSettings.json()).settings.maxActive, 12);
  const emotePreview = await fetch(`${runtime.baseUrl}/v1/emote-wall/preview`, { method: 'POST', headers, body: '{}' });
  assert.equal(emotePreview.status, 202);
  assert.equal((await emotePreview.json()).items.length, 2);
  const emoteStatus = await fetch(`${runtime.baseUrl}/v1/emote-wall`, { headers }).then((response) => response.json());
  assert.equal(emoteStatus.activeCount, 2);
  assert.equal(emoteStatus.settings.sizePx, 120);
  assert.equal((await fetch(`${runtime.baseUrl}/v1/emote-wall/clear`, { method: 'POST', headers, body: '{}' })).status, 200);
});

test('creates, persists, protects, and removes custom Interaction and Twitch Alerts', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-custom-alert-test-'));
  const packedAudioPath = path.join(dataDirectory, 'packed-alert.mp3');
  const packedVisualPath = path.join(dataDirectory, 'packed-alert.gif');
  await writeFile(packedAudioPath, Buffer.from([0x49, 0x44, 0x33, 0x04]));
  await writeFile(packedVisualPath, Buffer.from('GIF89a', 'ascii'));
  let runtime = await startTempestBridge({ port: 0, dataDirectory, logger: { info() {}, warn() {}, error() {} } });
  let headers = { 'Content-Type': 'application/json', 'X-Tempest-Token': runtime.token };

  const interactionCreated = await fetch(`${runtime.baseUrl}/v1/sound-alerts`, {
    method: 'POST', headers, body: JSON.stringify({
      id: 'sound-alert.moonlight-dance',
      cue: 'sound-alert.moonlight-dance',
      name: 'Moonlight Dance',
      durationMs: 11000,
      visualDurationMs: 7000,
      viewerCooldownMs: 45000,
      globalCooldownMs: 11000,
      audioUri: pathToFileURL(packedAudioPath).href,
      visualUri: pathToFileURL(packedVisualPath).href,
      accent: '#123abc'
    })
  });
  assert.equal(interactionCreated.status, 201);
  const interactionAlert = (await interactionCreated.json()).alert;
  assert.equal(interactionAlert.custom, true);
  assert.equal(interactionAlert.free, true);
  assert.equal(interactionAlert.accent, '#123ABC');
  assert.equal(interactionAlert.warudoEnabled, false);
  assert.equal(interactionAlert.vtubeStudioEnabled, false);
  assert.equal(interactionAlert.design.position, 'custom');
  assert.equal(interactionAlert.audioUri, pathToFileURL(packedAudioPath).href);
  assert.equal(interactionAlert.visualUri, pathToFileURL(packedVisualPath).href);

  const overlayOnlyTrigger = await fetch(`${runtime.baseUrl}/v1/sound-alerts/${encodeURIComponent(interactionAlert.id)}/trigger`, {
    method: 'POST', headers, body: JSON.stringify({ source: 'studio.operator', viewerName: 'Test Operator', bypassCooldown: true })
  });
  assert.equal(overlayOnlyTrigger.status, 202);
  const overlayOnlyRun = (await overlayOnlyTrigger.json()).run;
  assert.equal(overlayOnlyRun.actions.some((action) => action.capability === 'avatar.performance.apply'), false);

  const interactionUpdated = await fetch(`${runtime.baseUrl}/v1/sound-alerts/${encodeURIComponent(interactionAlert.id)}`, {
    method: 'POST', headers, body: JSON.stringify({
      warudoEnabled: true,
      vtubeStudioEnabled: true,
      vtubeStudioHotkey: 'hotkey-dance',
      design: { ...interactionAlert.design, position: 'custom', customPositionX: 27.5, customPositionY: 41.25, scale: 1.2 }
    })
  });
  assert.equal(interactionUpdated.status, 200);
  const updatedInteractionAlert = (await interactionUpdated.json()).alert;
  assert.equal(updatedInteractionAlert.warudoEnabled, true);
  assert.equal(updatedInteractionAlert.vtubeStudioEnabled, true);
  assert.equal(updatedInteractionAlert.vtubeStudioHotkey, 'hotkey-dance');
  assert.equal(updatedInteractionAlert.design.customPositionX, 27.5);
  assert.equal(updatedInteractionAlert.design.customPositionY, 41.25);

  const duplicateInteraction = await fetch(`${runtime.baseUrl}/v1/sound-alerts`, {
    method: 'POST', headers, body: JSON.stringify({ id: interactionAlert.id, cue: interactionAlert.cue, name: 'Duplicate' })
  });
  assert.equal(duplicateInteraction.status, 400);

  const twitchCreated = await fetch(`${runtime.baseUrl}/v1/visual-alerts/twitch`, {
    method: 'POST', headers, body: JSON.stringify({ id: 'twitch.stream-online', topic: 'channel.stream.online', name: 'Stream Online', durationMs: 8000, volume: 0.6, audioUri: pathToFileURL(packedAudioPath).href, visualUri: pathToFileURL(packedVisualPath).href, accent: '#ff8800' })
  });
  assert.equal(twitchCreated.status, 201);
  const twitchAlert = (await twitchCreated.json()).alert;
  assert.equal(twitchAlert.custom, true);
  assert.equal(twitchAlert.topic, 'channel.stream.online');
  assert.equal(twitchAlert.audioUri, pathToFileURL(packedAudioPath).href);
  assert.equal(twitchAlert.visualUri, pathToFileURL(packedVisualPath).href);

  const duplicateTopic = await fetch(`${runtime.baseUrl}/v1/visual-alerts/twitch`, {
    method: 'POST', headers, body: JSON.stringify({ id: 'twitch.also-online', topic: 'channel.stream.online', name: 'Also Online' })
  });
  assert.equal(duplicateTopic.status, 400);

  await runtime.close();
  runtime = await startTempestBridge({ port: 0, dataDirectory, logger: { info() {}, warn() {}, error() {} } });
  headers = { 'Content-Type': 'application/json', 'X-Tempest-Token': runtime.token };
  try {
    const interactions = await fetch(`${runtime.baseUrl}/v1/sound-alerts`, { headers }).then((response) => response.json());
    assert.ok(interactions.alerts.some((alert) => alert.id === interactionAlert.id && alert.custom && alert.warudoEnabled && alert.vtubeStudioEnabled && alert.vtubeStudioHotkey === 'hotkey-dance' && alert.design.customPositionX === 27.5));
    const twitchAlerts = await fetch(`${runtime.baseUrl}/v1/visual-alerts/twitch`, { headers }).then((response) => response.json());
    assert.ok(twitchAlerts.alerts.some((alert) => alert.id === twitchAlert.id && alert.custom));

    const protectedBundled = await fetch(`${runtime.baseUrl}/v1/sound-alerts/${encodeURIComponent('sound-alert.hype-pulse')}`, { method: 'DELETE', headers });
    assert.equal(protectedBundled.status, 400);
    assert.equal((await fetch(`${runtime.baseUrl}/v1/sound-alerts/${encodeURIComponent(interactionAlert.id)}`, { method: 'DELETE', headers })).status, 200);
    assert.equal((await fetch(`${runtime.baseUrl}/v1/visual-alerts/twitch/${encodeURIComponent(twitchAlert.id)}`, { method: 'DELETE', headers })).status, 200);
  } finally {
    await runtime.close();
  }
});

test('runs simulated workflows, expires leases, and exposes the safety control', async (context) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-workflow-test-'));
  const runtime = await startTempestBridge({ port: 0, dataDirectory, logger: { info() {}, warn() {}, error() {} } });
  context.after(() => runtime.close());
  const headers = { 'Content-Type': 'application/json', 'X-Tempest-Token': runtime.token };
  const workflow = {
    schemaVersion: 1,
    id: 'com.tempestmainframe.workflow.test-pulse',
    name: 'Test Pulse',
    enabled: true,
    trigger: { type: 'viewer.interaction', action: 'tempest.test-pulse' },
    cooldowns: { viewerMs: 50, effectMs: 50, globalMs: 0 },
    maximumConcurrent: 1,
    actions: [{
      id: 'pulse',
      name: 'Pulse visual',
      target: 'com.tempestmainframe.data-horizon',
      capability: 'scene.visualization.activate',
      lease: { durationMs: 25 }
    }]
  };

  const registered = await fetch(`${runtime.baseUrl}/v1/workflows`, {
    method: 'POST', headers, body: JSON.stringify(workflow)
  });
  assert.equal(registered.status, 201);

  const triggered = await fetch(`${runtime.baseUrl}/v1/interactions`, {
    method: 'POST', headers, body: JSON.stringify({
      action: 'tempest.test-pulse',
      source: 'studio.simulator',
      eventId: 'simulator-event-1',
      viewerId: 'test-viewer',
      simulateMissing: true,
      bypassCooldown: true
    })
  });
  assert.equal(triggered.status, 202);
  const triggeredBody = await triggered.json();
  assert.equal(triggeredBody.run.state, 'running');

  const replayed = await fetch(`${runtime.baseUrl}/v1/interactions`, {
    method: 'POST', headers, body: JSON.stringify({
      action: 'tempest.test-pulse',
      source: 'studio.simulator',
      eventId: 'simulator-event-1',
      viewerId: 'test-viewer',
      simulateMissing: true,
      bypassCooldown: true
    })
  });
  assert.equal(replayed.status, 202);
  assert.equal((await replayed.json()).run.id, triggeredBody.run.id);

  await new Promise((resolve) => setTimeout(resolve, 80));
  const runs = await fetch(`${runtime.baseUrl}/v1/runs`, { headers }).then((response) => response.json());
  assert.equal(runs.runs[0].state, 'completed');
  assert.equal(runs.runs[0].actions[0].state, 'released');
  assert.equal(runs.runs[0].actions[0].delivery, 'simulated');

  const events = await fetch(`${runtime.baseUrl}/v1/events`, { headers }).then((response) => response.json());
  assert.ok(events.events.some((event) => event.type === 'workflow.action.released'));
  assert.ok(events.events.some((event) => event.type === 'workflow.completed'));

  const twitchEvent = {
    schemaVersion: 1,
    id: 'extension-event-1',
    topic: 'viewer.interaction.requested',
    occurredAt: new Date().toISOString(),
    source: 'twitch',
    channel: { id: 'channel-1', login: 'tempest' },
    viewer: { id: 'viewer-1', displayName: 'Test Viewer' },
    payload: { action: 'tempest.test-pulse' }
  };
  const twitchTrigger = await fetch(`${runtime.baseUrl}/v1/integrations/twitch/events`, {
    method: 'POST', headers, body: JSON.stringify(twitchEvent)
  });
  assert.equal(twitchTrigger.status, 202);
  assert.equal((await twitchTrigger.json()).run.triggerEventId, twitchEvent.id);

  const duplicate = await fetch(`${runtime.baseUrl}/v1/integrations/twitch/events`, {
    method: 'POST', headers, body: JSON.stringify(twitchEvent)
  });
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), { accepted: false, duplicate: true, eventId: twitchEvent.id });

  const twitchStatus = await fetch(`${runtime.baseUrl}/v1/integrations/twitch`, { headers }).then((response) => response.json());
  assert.equal(twitchStatus.owner, 'tempest-mainframe-studio');
  assert.equal(twitchStatus.acceptedEvents, 1);
  assert.equal(twitchStatus.duplicateEvents, 1);

  const soundAlert = await fetch(`${runtime.baseUrl}/v1/integrations/twitch/events`, {
    method: 'POST', headers, body: JSON.stringify({
      ...twitchEvent,
      id: 'sound-alert-event-1',
      payload: { action: 'tempest.sound-alert.performance', cue: 'song-branch-01', durationMs: 1000, intensity: 0.75 }
    })
  });
  assert.equal(soundAlert.status, 202);
  const soundRun = (await soundAlert.json()).run;
  assert.equal(soundRun.actions.length, 4);
  assert.equal(soundRun.actions[0].capability, 'avatar.performance.apply');
  assert.equal(soundRun.actions[1].releaseCapability, 'broadcast.reaction.clear');
  assert.equal(soundRun.actions[2].capability, 'broadcast.audio.play');
  assert.equal(soundRun.actions[3].releaseCapability, 'broadcast.visual.hide');
  assert.equal(new Date(soundRun.endsAt).getTime() - new Date(soundRun.startedAt).getTime(), 1000);

  const unmappedCheer = await fetch(`${runtime.baseUrl}/v1/integrations/twitch/events`, {
    method: 'POST', headers, body: JSON.stringify({
      ...twitchEvent,
      id: 'unmapped-cheer-event-1',
      topic: 'viewer.cheer.received',
      payload: { bits: 100 }
    })
  });
  assert.equal(unmappedCheer.status, 202);
  assert.equal(Object.hasOwn(await unmappedCheer.json(), 'run'), false);
  const cheerOverlay = await fetch(`${runtime.baseUrl}/v1/visual-alerts`, { headers }).then((response) => response.json());
  assert.equal(cheerOverlay.twitch.activeAlert.alertId, 'twitch.cheer');
  assert.equal(cheerOverlay.twitch.activeAlert.name, '100 Bits');
  const chatMessage = await fetch(`${runtime.baseUrl}/v1/integrations/twitch/events`, {
    method: 'POST', headers, body: JSON.stringify({
      ...twitchEvent,
      id: 'chat-overlay-event-1',
      topic: 'viewer.chat.message',
      viewer: { id: 'viewer-1', displayName: 'Overlay Viewer', roles: ['subscriber'] },
      payload: {
        messageId: 'chat-overlay-message-1',
        text: '<b>This stays text</b> Kappa',
        fragments: [{ type: 'emote', text: 'Kappa', emote: { id: '25', format: ['static'] } }]
      }
    })
  });
  assert.equal(chatMessage.status, 202);
  const chatOverlayStatus = await fetch(`${runtime.baseUrl}/v1/chat-overlay`, { headers }).then((response) => response.json());
  assert.equal(chatOverlayStatus.messages.at(-1).viewerName, 'Overlay Viewer');
  assert.equal(chatOverlayStatus.messages.at(-1).text, '<b>This stays text</b> Kappa');
  const emoteWallStatus = await fetch(`${runtime.baseUrl}/v1/emote-wall`, { headers }).then((response) => response.json());
  assert.equal(emoteWallStatus.items.at(-1).name, 'Kappa');
  assert.match(emoteWallStatus.items.at(-1).url, /emoticons\/v2\/25\/static\/dark\/3\.0/);

  const cheerWorkflow = {
    ...workflow,
    id: 'com.tempestmainframe.workflow.explicit-cheer',
    name: 'Explicit Cheer Mapping',
    trigger: { type: 'twitch.cheer', action: 'tempest.explicit-cheer' },
    actions: [{
      id: 'cheer',
      name: 'Mapped cheer',
      target: 'com.tempestmainframe.tempest-broadcast',
      capability: 'broadcast.audio.play'
    }]
  };
  assert.equal((await fetch(`${runtime.baseUrl}/v1/workflows`, { method: 'POST', headers, body: JSON.stringify(cheerWorkflow) })).status, 201);
  const mappedCheer = await fetch(`${runtime.baseUrl}/v1/integrations/twitch/events`, {
    method: 'POST', headers, body: JSON.stringify({
      ...twitchEvent,
      id: 'cheer-event-1',
      topic: 'viewer.cheer.received',
      payload: { bits: 100, action: 'tempest.explicit-cheer' }
    })
  });
  assert.equal(mappedCheer.status, 202);
  assert.equal((await mappedCheer.json()).run.source, 'twitch.cheer');

  const stopped = await fetch(`${runtime.baseUrl}/v1/safety/stop`, {
    method: 'POST', headers, body: JSON.stringify({ reason: 'Automated test' })
  }).then((response) => response.json());
  assert.equal(stopped.armed, false);

  const blocked = await fetch(`${runtime.baseUrl}/v1/workflows/${encodeURIComponent(workflow.id)}/trigger`, {
    method: 'POST', headers, body: JSON.stringify({ source: 'studio.simulator', simulateMissing: true, bypassCooldown: true })
  });
  assert.equal(blocked.status, 400);

  const armed = await fetch(`${runtime.baseUrl}/v1/safety/arm`, { method: 'POST', headers }).then((response) => response.json());
  assert.equal(armed.armed, true);
});
