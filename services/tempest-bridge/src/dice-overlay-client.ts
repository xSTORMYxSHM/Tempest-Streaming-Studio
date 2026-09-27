export const tempestDiceOverlayClient = String.raw`
const world = document.getElementById('diceWorld');
const hud = document.getElementById('diceHud');
const errorBanner = document.getElementById('diceError');
const colors = { stormglass: '#2e91ad', brass: '#a7792b', obsidian: '#3d315f' };
let settings = { theme: 'stormglass', diceTheme: 'default', themeColor: '#2e91ad', durationMs: 5200, soundEnabled: false, showReason: true, scalePercent: 100, gravity: 1, mass: 1, friction: .8, restitution: .1, angularDamping: .4, linearDamping: .5, spinForce: 6, throwForce: 5, startingHeight: 8, settleTimeout: 5000, diceDelayMs: 10, lightIntensity: 1, enableShadows: true, shadowTransparency: .8 };
let box;
let boxPromise;
let DiceBoxClass;
let configPromise = Promise.resolve();
let configuredSignature = '';
let clientId = '';
let activeDiceTheme = 'default';
const obsBrowserRuntime = /(?:^|\s)OBS\/\d/i.test(navigator.userAgent);
let rendererMode = obsBrowserRuntime ? 'onscreen' : 'offscreen';
let rendererFallbackError = '';
let startupScheduledFor = '';
let clearTimer = 0;
let errorTimer = 0;
let impactAudio;
let impactUrl;
let impactEncoded;
let impactAudioContext;
let impactAudioBuffer;
let impactAudioSource;
let physicalDieListener;
let physicalRollListener;
let presentedRollId = '';

function themeColor() { return settings.themeColor || colors[settings.theme] || colors.stormglass; }

function boxConfig(theme = activeDiceTheme) {
  return {
    theme, themeColor: themeColor(),
    scale: 5 * Math.max(.6, Math.min(1.4, Number(settings.scalePercent || 100) / 100)),
    gravity: Number(settings.gravity), mass: Number(settings.mass), friction: Number(settings.friction), restitution: Number(settings.restitution),
    angularDamping: Number(settings.angularDamping), linearDamping: Number(settings.linearDamping), spinForce: Number(settings.spinForce), throwForce: Number(settings.throwForce),
    startingHeight: Number(settings.startingHeight), settleTimeout: Number(settings.settleTimeout), delay: Number(settings.diceDelayMs),
    lightIntensity: Number(settings.lightIntensity), enableShadows: settings.enableShadows !== false, shadowTransparency: Number(settings.shadowTransparency)
  };
}

function bounded(promise, timeoutMs, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); })]).finally(() => clearTimeout(timer));
}

async function postJson(path, body, attempts = 4) {
  let latestError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Studio returned HTTP ' + response.status + '.');
      return payload;
    } catch (error) {
      latestError = error;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * Math.pow(2, attempt)));
    } finally { clearTimeout(timeout); }
  }
  throw latestError || new Error('Studio did not answer the Browser Source.');
}

async function reportClient(state, error) {
  if (!clientId) return;
  await postJson('/dice-overlay/client-status', { clientId, state, theme: activeDiceTheme, renderer: rendererMode, error: error ? String(error).slice(0, 500) : undefined }, 2).catch(() => {});
}

function showError(message) {
  clearTimeout(errorTimer);
  errorBanner.textContent = String(message || 'The dice could not be rolled.');
  errorBanner.classList.add('visible');
  errorTimer = setTimeout(() => errorBanner.classList.remove('visible'), 8000);
}

function impactWav() {
  const rate = 22050, count = Math.floor(rate * .32), buffer = new ArrayBuffer(44 + count * 2), view = new DataView(buffer);
  const write = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const t = i / rate, envelope = Math.pow(1 - i / count, 3);
    const sample = (Math.sin(2 * Math.PI * 132 * t) + .55 * Math.sin(2 * Math.PI * 197 * t) + .28 * Math.sin(2 * Math.PI * 281 * t)) * envelope * .24;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
  }
  return buffer;
}

function stopImpact() {
  if (impactAudio) { impactAudio.pause(); impactAudio.currentTime = 0; }
  if (impactAudioSource) { try { impactAudioSource.stop(); } catch {} try { impactAudioSource.disconnect(); } catch {} impactAudioSource = undefined; }
}

async function reportAudio(state, method, testId, error) {
  if (!clientId) return;
  await postJson('/dice-overlay/audio-status', { clientId, state, method, testId, error: error ? String(error).slice(0, 500) : undefined }, 2).catch(() => {});
}

async function playImpact({ force = false, testId } = {}) {
  if (!force && !settings.soundEnabled) return;
  stopImpact();
  if (!impactEncoded) impactEncoded = impactWav();
  let mediaError;
  try {
    if (!impactUrl) impactUrl = URL.createObjectURL(new Blob([impactEncoded], { type: 'audio/wav' }));
    if (!impactAudio) { impactAudio = new Audio(); impactAudio.preload = 'auto'; impactAudio.autoplay = true; impactAudio.volume = .72; }
    impactAudio.src = impactUrl; impactAudio.load();
    await bounded(impactAudio.play(), 3000, 'dice media element timed out while starting');
    await reportAudio('ready', 'media', testId);
    return;
  } catch (error) { mediaError = error; }
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio is unavailable.');
    if (!impactAudioContext || impactAudioContext.state === 'closed') impactAudioContext = new AudioContextClass({ latencyHint: 'interactive' });
    if (impactAudioContext.state !== 'running') await bounded(impactAudioContext.resume(), 2500, 'Web Audio resume timed out');
    if (impactAudioContext.state !== 'running') throw new Error('Web Audio context is ' + impactAudioContext.state + '.');
    if (!impactAudioBuffer) impactAudioBuffer = await bounded(impactAudioContext.decodeAudioData(impactEncoded.slice(0)), 4000, 'Dice sound decode timed out');
    const source = impactAudioContext.createBufferSource(), gain = impactAudioContext.createGain();
    gain.gain.value = .72; source.buffer = impactAudioBuffer; source.connect(gain); gain.connect(impactAudioContext.destination); impactAudioSource = source;
    source.onended = () => { if (impactAudioSource === source) impactAudioSource = undefined; try { source.disconnect(); } catch {} try { gain.disconnect(); } catch {} };
    source.start(0);
    await reportAudio('ready', 'web-audio', testId);
  } catch (error) {
    const media = mediaError instanceof Error ? mediaError.message : String(mediaError || 'unknown media error');
    const fallback = error instanceof Error ? error.message : String(error);
    const failure = 'media element: ' + media + '; Web Audio fallback: ' + fallback;
    console.error('Tempest dice impact audio failed: ' + failure);
    showError('Dice sound failed: ' + failure);
    await reportAudio('failed', 'web-audio', testId, failure);
  }
}

async function configureBox(diceBox) {
  const requested = settings.diceTheme || 'default';
  const desiredSignature = JSON.stringify([requested, settings.theme, settings.themeColor, settings.scalePercent, settings.gravity, settings.mass, settings.friction, settings.restitution, settings.angularDamping, settings.linearDamping, settings.spinForce, settings.throwForce, settings.startingHeight, settings.settleTimeout, settings.diceDelayMs, settings.lightIntensity, settings.enableShadows, settings.shadowTransparency]);
  if (desiredSignature === configuredSignature) return;
  const nextConfiguration = configPromise.catch(() => undefined).then(async () => {
    if (desiredSignature === configuredSignature) return;
    try {
      const loaded = await bounded(diceBox.loadTheme(requested), 6000, 'Dice theme load timed out.');
      if (!loaded || !Array.isArray(loaded.diceAvailable)) throw new Error('Dice theme did not provide valid model metadata.');
      activeDiceTheme = requested;
      await bounded(diceBox.updateConfig(boxConfig(activeDiceTheme)), 6000, 'Dice engine configuration timed out.');
      configuredSignature = desiredSignature;
      await reportClient(rendererFallbackError ? 'degraded' : 'ready', rendererFallbackError);
    } catch (error) {
      activeDiceTheme = 'default';
      const fallback = await bounded(diceBox.loadTheme('default'), 6000, 'Classic fallback theme load timed out.');
      if (!fallback || !Array.isArray(fallback.diceAvailable)) throw error;
      await bounded(diceBox.updateConfig(boxConfig('default')), 6000, 'Classic fallback configuration timed out.');
      configuredSignature = desiredSignature;
      showError((error instanceof Error ? error.message : String(error)) + ' Using Classic dice instead.');
      await reportClient('degraded', error);
    }
  });
  configPromise = nextConfiguration.catch(() => undefined);
  try { await nextConfiguration; }
  catch (error) { await reportClient('failed', error); throw error; }
}

async function getBox() {
  if (boxPromise) return boxPromise;
  boxPromise = (async () => {
    await reportClient('connecting', 'Loading the Dice Box runtime.');
    if (!DiceBoxClass) {
      const runtime = await bounded(import('/dice-overlay/vendor/dice-box.es.min.js'), 8000, 'Dice Box runtime import timed out.');
      DiceBoxClass = runtime.default;
      if (typeof DiceBoxClass !== 'function') throw new Error('Dice Box runtime did not export its renderer.');
    }
    const create = (offscreen) => new DiceBoxClass({
      container: '#diceWorld', assetPath: '/dice-overlay/assets/', offscreen, ...boxConfig('default'),
      onDieComplete: (die) => physicalDieListener?.(die), onRollComplete: (results) => physicalRollListener?.(results)
    });
    if (obsBrowserRuntime) {
      // OBS already renders the page offscreen. DiceBox's nested OffscreenCanvas worker can
      // terminate the CEF renderer before it reports an error, so use its stable main-thread
      // WebGL renderer inside OBS and reserve the worker renderer for normal browsers.
      rendererMode = 'onscreen';
      await reportClient('connecting', 'Initializing the OBS-compatible Dice Box renderer.');
      box = create(false);
      await bounded(box.init(), 12000, 'OBS-compatible Dice Box initialization timed out.');
    } else {
      await reportClient('connecting', 'Initializing the offscreen Dice Box renderer.');
      try {
        rendererMode = 'offscreen';
        box = create(true);
        await bounded(box.init(), 12000, 'Offscreen Dice Box initialization timed out.');
      } catch (offscreenError) {
        rendererFallbackError = 'Offscreen renderer unavailable (' + (offscreenError instanceof Error ? offscreenError.message : String(offscreenError)) + '); using the onscreen renderer.';
        try { box?.clear(); } catch {}
        world.replaceChildren();
        rendererMode = 'onscreen';
        await reportClient('connecting', rendererFallbackError);
        box = create(false);
        await bounded(box.init(), 12000, 'Onscreen Dice Box fallback initialization timed out.');
      }
    }
    return box;
  })().catch(async (error) => { boxPromise = undefined; await reportClient('failed', error); showError('Dice Box could not start: ' + error.message); throw error; });
  return boxPromise;
}

async function apply(next) {
  settings = { ...settings, ...next };
  document.documentElement.style.setProperty('--dice-scale', String(Math.max(.6, Math.min(1.4, Number(settings.scalePercent || 100) / 100))));
  const diceBox = await getBox();
  await configureBox(diceBox);
}

function flatten(results) {
  return (Array.isArray(results) ? results : []).flatMap((result) => {
    if (Array.isArray(result?.rolls)) return result.rolls;
    return result && Object.prototype.hasOwnProperty.call(result, 'value') ? [result] : [];
  });
}

async function waitForPhysicalDice(startRoll, expectedCount) {
  let timer = 0;
  const callbackResult = new Promise((resolve, reject) => {
    const settled = [];
    physicalDieListener = (die) => {
      if (!die || !Object.prototype.hasOwnProperty.call(die, 'value')) return;
      settled.push(die);
      if (settled.length >= expectedCount) resolve(settled.slice(0, expectedCount));
    };
    physicalRollListener = (results) => {
      const completed = flatten(results);
      if (completed.length >= expectedCount) resolve(completed.slice(0, expectedCount));
    };
    timer = setTimeout(() => reject(new Error('Dice Box settled visually but did not return its physical result within 20 seconds.')), 20000);
  });
  try {
    const apiResult = Promise.resolve().then(startRoll).then((results) => {
      const completed = flatten(results);
      if (completed.length < expectedCount) return callbackResult;
      return completed.slice(0, expectedCount);
    });
    return await Promise.race([apiResult, callbackResult]);
  } finally {
    clearTimeout(timer);
    physicalDieListener = undefined;
    physicalRollListener = undefined;
  }
}

async function reportRollFailure(request, error) {
  if (!request?.id || !request?.token) return;
  await postJson('/dice-overlay/error', { id: request.id, token: request.token, message: error instanceof Error ? error.message : String(error) }, 2).catch(() => {});
}

async function performRoll(request) {
  try {
    clearTimeout(clearTimer);
    hud.replaceChildren();
    hud.classList.remove('visible');
    errorBanner.classList.remove('visible');
    const diceBox = await getBox();
    await configureBox(diceBox);
    const notation = String(request.count) + 'd' + String(request.physicalSides);
    let pending = await waitForPhysicalDice(() => diceBox.roll(notation, { theme: activeDiceTheme, themeColor: themeColor() }), Number(request.count));
    const accepted = [];
    let attempts = 0;
    while (pending.length && attempts < 40) {
      const rejected = [];
      for (const die of pending) {
        const value = Number(die.value);
        if (Number.isInteger(value) && value >= 1 && value <= Number(request.sides)) accepted.push(value);
        else rejected.push(die);
      }
      if (!rejected.length) break;
      attempts++;
      pending = await waitForPhysicalDice(() => diceBox.reroll(rejected, { remove: true, newStartPoint: true }), rejected.length);
    }
    if (accepted.length !== Number(request.count)) throw new Error('Dice Box did not produce the requested number of in-range results.');
    const payload = await postJson('/dice-overlay/result', { id: request.id, token: request.token, values: accepted });
    if (payload.roll) showResult(payload.roll);
  } catch (error) {
    console.error('Tempest Dice Box roll failed.', error);
    if (box) box.clear();
    showError(error instanceof Error ? error.message : String(error));
    await reportRollFailure(request, error);
  }
}

function showResult(roll) {
  if (!roll) return;
  const repeated = presentedRollId === roll.id;
  presentedRollId = String(roll.id || '');
  clearTimeout(clearTimer);
  hud.replaceChildren();
  const card = document.createElement('section'); card.className = 'dice-result';
  const eyebrow = document.createElement('small'); eyebrow.textContent = 'TEMPEST · DICE BOX PHYSICS';
  const total = document.createElement('strong'); total.textContent = String(roll.total);
  const expression = document.createElement('span'); expression.textContent = String(roll.expression || '');
  card.append(eyebrow, total, expression);
  if (settings.showReason && roll.reason) { const reason = document.createElement('p'); reason.textContent = roll.reason; card.append(reason); }
  if (roll.rollerName) { const roller = document.createElement('em'); roller.textContent = 'Rolled by ' + roll.rollerName; card.append(roller); }
  hud.append(card);
  hud.classList.add('visible');
  if (!repeated) playImpact().catch((error) => console.error('Tempest dice impact audio failed: ' + error.message));
  clearTimer = setTimeout(clearPresentation, Math.max(2500, Number(settings.durationMs) || 5200));
}

function clearPresentation() {
  clearTimeout(clearTimer);
  hud.classList.remove('visible');
  hud.replaceChildren();
  presentedRollId = '';
  stopImpact();
  if (box) box.clear();
}

const events = window.__tempestDiceEvents || new EventSource('/dice-overlay/events');
let pollClientId = '';
let pollRevision = 0;
let pollStarted = false;
const handleInit = (event) => {
  const data = JSON.parse(event.data);
  const nextClientId = String(data.clientId || '');
  if (!nextClientId || startupScheduledFor) return;
  clientId = nextClientId;
  startupScheduledFor = clientId;
  reportClient('connecting', obsBrowserRuntime ? 'OBS transport ready; preparing the main-thread renderer.' : 'Browser transport ready; preparing the renderer.').catch(() => {});
  // Let OBS finish activating the Browser Source before WebGL allocates its scene. Starting
  // DiceBox in the same task as the first SSE message can terminate CEF during source startup.
  setTimeout(() => apply(data.settings || {}).catch((error) => showError(error.message)), obsBrowserRuntime ? 1500 : 0);
};
async function runPollFallback() {
  try {
    const result = await postJson('/dice-overlay/poll', { clientId: pollClientId, after: pollRevision }, 1);
    pollClientId = String(result.clientId || pollClientId);
    pollRevision = Number(result.revision || pollRevision);
    for (const item of Array.isArray(result.events) ? result.events : []) {
      const event = { data: JSON.stringify(item.payload) };
      if (item.type === 'init') handleInit(event);
      else if (item.type === 'settings') apply(item.payload || {}).catch((error) => showError(error.message));
      else if (item.type === 'roll-request') performRoll(item.payload);
      else if (item.type === 'roll-result') showResult(item.payload);
      else if (item.type === 'roll-error') showError(item.payload?.message);
      else if (item.type === 'audio-test') playImpact({ force: true, testId: item.payload?.id }).catch((error) => showError(error.message));
      else if (item.type === 'clear') clearPresentation();
    }
  } catch (error) {
    console.error('Tempest dice polling fallback failed.', error);
  } finally {
    setTimeout(runPollFallback, 250);
  }
}
function startPollingFallback() {
  if (pollStarted) return;
  pollStarted = true;
  runPollFallback();
}
events.addEventListener('init', handleInit);
if (window.__tempestDiceRuntime?.initData) handleInit({ data: window.__tempestDiceRuntime.initData });
events.addEventListener('settings', (event) => apply(JSON.parse(event.data)).catch((error) => showError(error.message)));
events.addEventListener('roll-request', (event) => performRoll(JSON.parse(event.data)));
events.addEventListener('roll-result', (event) => showResult(JSON.parse(event.data)));
events.addEventListener('roll-error', (event) => showError(JSON.parse(event.data).message));
events.addEventListener('audio-test', (event) => playImpact({ force: true, testId: JSON.parse(event.data).id }).catch((error) => showError(error.message)));
events.addEventListener('clear', clearPresentation);
events.onerror = () => { if (!pollClientId) clientId = ''; startPollingFallback(); };
setTimeout(() => { if (!clientId) startPollingFallback(); }, 750);
window.addEventListener('beforeunload', () => { stopImpact(); if (impactUrl) URL.revokeObjectURL(impactUrl); if (impactAudioContext && impactAudioContext.state !== 'closed') impactAudioContext.close().catch(() => {}); });
`;
