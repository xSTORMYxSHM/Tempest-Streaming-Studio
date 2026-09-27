export const tempestDiceOverlayClient = String.raw`
import DiceBox from '/dice-overlay/vendor/dice-box.es.min.js';

const world = document.getElementById('diceWorld');
const hud = document.getElementById('diceHud');
const errorBanner = document.getElementById('diceError');
const colors = { stormglass: '#2e91ad', brass: '#a7792b', obsidian: '#3d315f' };
let settings = { theme: 'stormglass', durationMs: 5200, soundEnabled: false, showReason: true, scalePercent: 100 };
let box;
let boxPromise;
let clearTimer = 0;
let errorTimer = 0;
let impactAudio;
let impactUrl;

function themeColor() { return colors[settings.theme] || colors.stormglass; }

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
  return new Blob([buffer], { type: 'audio/wav' });
}

function playImpact() {
  if (!settings.soundEnabled) return;
  try {
    if (!impactUrl) impactUrl = URL.createObjectURL(impactWav());
    if (!impactAudio) { impactAudio = new Audio(impactUrl); impactAudio.preload = 'auto'; impactAudio.volume = .72; }
    else { impactAudio.pause(); impactAudio.currentTime = 0; }
    impactAudio.play().catch((error) => console.error('Tempest dice impact audio failed: ' + error.message));
  } catch (error) { console.error('Tempest dice impact audio failed: ' + error.message); }
}

async function getBox() {
  if (boxPromise) return boxPromise;
  boxPromise = (async () => {
    box = new DiceBox({
      container: '#diceWorld', assetPath: '/dice-overlay/assets/', theme: 'default', themeColor: themeColor(),
      enableShadows: true, shadowTransparency: .72, lightIntensity: 1.15, offscreen: true,
      scale: 5 * Math.max(.6, Math.min(1.4, Number(settings.scalePercent || 100) / 100))
    });
    await box.init();
    return box;
  })().catch((error) => { boxPromise = undefined; showError('Dice Box could not start: ' + error.message); throw error; });
  return boxPromise;
}

async function apply(next) {
  settings = { ...settings, ...next };
  if (boxPromise) {
    const diceBox = await boxPromise;
    await diceBox.updateConfig({ themeColor: themeColor(), scale: 5 * Math.max(.6, Math.min(1.4, Number(settings.scalePercent || 100) / 100)) });
  }
}

function flatten(results) {
  return (Array.isArray(results) ? results : []).flatMap((result) => {
    if (Array.isArray(result?.rolls)) return result.rolls;
    return result && Object.prototype.hasOwnProperty.call(result, 'value') ? [result] : [];
  });
}

async function performRoll(request) {
  try {
    clearTimeout(clearTimer);
    hud.replaceChildren();
    hud.classList.remove('visible');
    errorBanner.classList.remove('visible');
    const diceBox = await getBox();
    const notation = String(request.count) + 'd' + String(request.physicalSides);
    let pending = flatten(await diceBox.roll(notation, { themeColor: themeColor() }));
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
      pending = flatten(await diceBox.reroll(rejected, { remove: true, newStartPoint: true }));
    }
    if (accepted.length !== Number(request.count)) throw new Error('Dice Box did not produce the requested number of in-range results.');
    const response = await fetch('/dice-overlay/result', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: request.id, token: request.token, values: accepted })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Studio rejected the physical dice result.');
  } catch (error) {
    console.error('Tempest Dice Box roll failed.', error);
    showError(error instanceof Error ? error.message : String(error));
  }
}

function showResult(roll) {
  if (!roll) return;
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
  playImpact();
  clearTimer = setTimeout(clearPresentation, Math.max(2500, Number(settings.durationMs) || 5200));
}

function clearPresentation() {
  clearTimeout(clearTimer);
  hud.classList.remove('visible');
  hud.replaceChildren();
  if (box) box.clear();
}

getBox().catch(() => {});
const events = new EventSource('/dice-overlay/events');
events.addEventListener('init', (event) => apply(JSON.parse(event.data).settings || {}).catch((error) => showError(error.message)));
events.addEventListener('settings', (event) => apply(JSON.parse(event.data)).catch((error) => showError(error.message)));
events.addEventListener('roll-request', (event) => performRoll(JSON.parse(event.data)));
events.addEventListener('roll-result', (event) => showResult(JSON.parse(event.data)));
events.addEventListener('roll-error', (event) => showError(JSON.parse(event.data).message));
events.addEventListener('clear', clearPresentation);
events.onerror = () => {};
window.addEventListener('beforeunload', () => { if (impactUrl) URL.revokeObjectURL(impactUrl); });
`;
