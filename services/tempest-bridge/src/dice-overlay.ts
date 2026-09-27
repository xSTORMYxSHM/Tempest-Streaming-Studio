import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { ServerResponse } from 'node:http';
import path from 'node:path';
import { tempestDiceOverlayClient } from './dice-overlay-client';

export type TempestDiceTheme = 'stormglass' | 'brass' | 'obsidian';
export type TempestDiceStyle = string;

export interface TempestDiceThemeOption {
  id: string;
  name: string;
  custom: boolean;
  diceAvailable: string[];
  colorConfigurable: boolean;
}

export interface TempestDiceOverlaySettings {
  schemaVersion: 1;
  enabled: boolean;
  theme: TempestDiceTheme;
  diceTheme: TempestDiceStyle;
  themeColor: string;
  durationMs: number;
  soundEnabled: boolean;
  showReason: boolean;
  scalePercent: number;
  gravity: number;
  mass: number;
  friction: number;
  restitution: number;
  angularDamping: number;
  linearDamping: number;
  spinForce: number;
  throwForce: number;
  startingHeight: number;
  settleTimeout: number;
  diceDelayMs: number;
  lightIntensity: number;
  enableShadows: boolean;
  shadowTransparency: number;
  updatedAt?: string;
}

export interface TempestResolvedDie {
  index: number;
  sides: number;
  value: number;
  kept: boolean;
}

export interface TempestStudioDiceRoll {
  id: string;
  expression: string;
  dice: TempestResolvedDie[];
  modifier: number;
  subtotal: number;
  total: number;
  reason: string;
  rollerName: string;
  rolledAt: string;
}

interface ParsedDiceExpression {
  expression: string;
  count: number;
  sides: number;
  keepMode?: 'kh' | 'kl';
  keepCount?: number;
  modifier: number;
}

interface DiceBoxRollRequest {
  id: string;
  token: string;
  expression: string;
  count: number;
  sides: number;
  physicalSides: number;
  reason: string;
  rollerName: string;
}

interface PendingRoll {
  request: DiceBoxRollRequest;
  parsed: ParsedDiceExpression;
  reason: string;
  rollerName: string;
  resolve: (roll: TempestStudioDiceRoll) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export interface TempestDiceAudioStatus {
  state: 'untested' | 'testing' | 'ready' | 'failed';
  method?: 'media' | 'web-audio';
  testedAt?: string;
  error?: string;
}

interface DiceClientStatus {
  state: 'connecting' | 'ready' | 'degraded' | 'failed';
  theme?: string;
  renderer?: 'offscreen' | 'onscreen' | 'fallback';
  updatedAt: string;
  error?: string;
}

interface PendingAudioTest {
  id: string;
  resolve: (status: TempestDiceAudioStatus) => void;
  timeout: NodeJS.Timeout;
}

const defaultSettings: TempestDiceOverlaySettings = {
  schemaVersion: 1,
  enabled: true,
  theme: 'stormglass',
  diceTheme: 'default',
  themeColor: '#2e91ad',
  durationMs: 5200,
  soundEnabled: false,
  showReason: true,
  scalePercent: 100,
  gravity: 1,
  mass: 1,
  friction: 0.8,
  restitution: 0.1,
  angularDamping: 0.4,
  linearDamping: 0.5,
  spinForce: 6,
  throwForce: 5,
  startingHeight: 8,
  settleTimeout: 5000,
  diceDelayMs: 10,
  lightIntensity: 1,
  enableShadows: true,
  shadowTransparency: 0.8
};

const builtInThemes: TempestDiceThemeOption[] = [
  { id: 'default', name: 'Classic', custom: false, diceAvailable: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'], colorConfigurable: true },
  { id: 'smooth', name: 'Smooth edge', custom: false, diceAvailable: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'], colorConfigurable: true },
  { id: 'gemstone', name: 'Gemstone', custom: false, diceAvailable: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'], colorConfigurable: true },
  { id: 'gemstoneMarble', name: 'Gemstone rainbow marble', custom: false, diceAvailable: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'], colorConfigurable: false },
  { id: 'rock', name: 'Carved rock', custom: false, diceAvailable: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'], colorConfigurable: true },
  { id: 'rust', name: 'Weathered rust', custom: false, diceAvailable: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'], colorConfigurable: true },
  { id: 'wooden', name: 'Wooden', custom: false, diceAvailable: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'], colorConfigurable: false },
  { id: 'diceOfRolling', name: 'Multicolor Dice of Rolling', custom: false, diceAvailable: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'], colorConfigurable: false },
  { id: 'blueGreenMetal', name: 'Blue-green metal', custom: false, diceAvailable: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'], colorConfigurable: false }
];

const diceOverlayPage = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tempest Studio 3D Dice</title>
<style>
*{box-sizing:border-box}html,body,#diceWorld{width:100%;height:100%;margin:0;overflow:hidden;background:transparent}body{font-family:Inter,"Segoe UI",sans-serif;color:#edffff;pointer-events:none}#diceWorld{position:absolute;inset:0;transform:scale(var(--dice-scale,1));transform-origin:center}#diceWorld canvas{width:100%!important;height:100%!important;background:transparent!important}.dice-hud{position:absolute;inset:0;display:grid;place-items:end center;padding:0 4vw 5vh;opacity:0;transition:opacity .2s ease}.dice-hud.visible{opacity:1}.dice-result{display:grid;grid-template-columns:auto auto;align-items:end;gap:4px clamp(14px,1.4vw,26px);min-width:min(560px,88vw);padding:18px 28px;border:1px solid rgba(139,234,255,.45);border-radius:14px;background:linear-gradient(135deg,rgba(3,13,20,.9),rgba(7,26,35,.72));box-shadow:0 18px 55px rgba(0,0,0,.55);text-align:center;text-shadow:0 4px 16px #000;backdrop-filter:blur(7px)}.dice-result small{grid-column:1/-1;color:#8beaff;font:800 clamp(9px,.7vw,14px)/1 Consolas,monospace;letter-spacing:.18em}.dice-result strong{color:#fff1b9;font:800 clamp(56px,6vw,112px)/.85 Georgia,serif}.dice-result span{align-self:center;color:#d8f5f5;font:800 clamp(18px,1.7vw,34px)/1 Consolas,monospace}.dice-result p{grid-column:1/-1;max-width:80vw;margin:7px 0 0;color:#fff;font:700 clamp(17px,1.6vw,31px)/1.2 Inter,sans-serif}.dice-result em{grid-column:1/-1;color:#9fc6cc;font:700 clamp(9px,.7vw,14px)/1 Consolas,monospace;letter-spacing:.13em;text-transform:uppercase;font-style:normal}.dice-error{position:absolute;top:4vh;left:50%;max-width:86vw;transform:translateX(-50%);padding:12px 18px;border:1px solid #ff6079;border-radius:10px;background:rgba(28,5,10,.92);color:#ffdbe1;font:700 14px/1.35 "Segoe UI",sans-serif;opacity:0;transition:opacity .2s}.dice-error.visible{opacity:1;transition:none}
</style></head><body><div id="diceWorld" aria-hidden="true"></div><main id="diceHud" class="dice-hud" aria-live="polite"></main><div id="diceError" class="dice-error" role="alert"></div><script src="/dice-overlay/client.js?v=__CLIENT_VERSION__"></script></body></html>`;

function integer(value: unknown, name: string, minimum: number, maximum: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  return number;
}

function numberRange(value: unknown, name: string, minimum: number, maximum: number): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  return Math.round(number * 1000) / 1000;
}

function color(value: unknown): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^#[a-f0-9]{6}$/.test(normalized)) throw new Error('Dice color must be a six-digit HEX color.');
  return normalized;
}

export function parseStudioDiceExpression(value: unknown): ParsedDiceExpression {
  const expression = String(value || '').replace(/\s+/g, '').toLowerCase();
  const match = expression.match(/^(\d{1,2})d(\d{1,3})(?:(kh|kl)(\d{1,2}))?([+-]\d{1,4})?$/);
  if (!match) throw new Error('Use dice notation such as 1d20, 1d50, 2d6+3, 2d20kh1, or 2d20kl1.');
  const count = integer(match[1], 'Dice count', 1, 20);
  const sides = integer(match[2], 'Maximum die value', 2, 100);
  const keepMode = match[3] as 'kh' | 'kl' | undefined;
  const keepCount = match[4] === undefined ? undefined : integer(match[4], 'Keep count', 1, count);
  const modifier = match[5] === undefined ? 0 : integer(match[5], 'Modifier', -1000, 1000);
  return { expression: `${count}d${sides}${keepMode ? `${keepMode}${keepCount}` : ''}${modifier ? `${modifier > 0 ? '+' : ''}${modifier}` : ''}`, count, sides, keepMode, keepCount, modifier };
}

export function diceBoxPhysicalSides(sides: number): number {
  return [4, 6, 8, 10, 12, 20, 100].find((candidate) => candidate >= sides) || 100;
}

function validateSettings(input: TempestDiceOverlaySettings, themes: TempestDiceThemeOption[] = builtInThemes): TempestDiceOverlaySettings {
  if (typeof input.enabled !== 'boolean' || typeof input.soundEnabled !== 'boolean' || typeof input.showReason !== 'boolean' || typeof input.enableShadows !== 'boolean') throw new Error('Dice overlay toggles must be boolean.');
  if (!['stormglass', 'brass', 'obsidian'].includes(input.theme)) throw new Error('Dice theme must be stormglass, brass, or obsidian.');
  if (!themes.some((theme) => theme.id === input.diceTheme)) throw new Error('Dice style is not supported or has not been imported.');
  return {
    ...input,
    schemaVersion: 1,
    themeColor: color(input.themeColor),
    durationMs: integer(input.durationMs, 'Display duration', 2500, 15000),
    scalePercent: integer(input.scalePercent, 'Dice scale', 60, 140),
    gravity: numberRange(input.gravity, 'Gravity', 0.25, 3),
    mass: numberRange(input.mass, 'Mass', 0.25, 5),
    friction: numberRange(input.friction, 'Friction', 0, 1),
    restitution: numberRange(input.restitution, 'Bounce', 0, 0.9),
    angularDamping: numberRange(input.angularDamping, 'Spin damping', 0.05, 0.95),
    linearDamping: numberRange(input.linearDamping, 'Movement damping', 0.05, 0.95),
    spinForce: numberRange(input.spinForce, 'Spin force', 0, 12),
    throwForce: numberRange(input.throwForce, 'Throw force', 1, 12),
    startingHeight: numberRange(input.startingHeight, 'Starting height', 2, 30),
    settleTimeout: integer(input.settleTimeout, 'Settle timeout', 2000, 15000),
    diceDelayMs: integer(input.diceDelayMs, 'Dice release delay', 0, 250),
    lightIntensity: numberRange(input.lightIntensity, 'Light intensity', 0.2, 3),
    shadowTransparency: numberRange(input.shadowTransparency, 'Shadow transparency', 0, 1)
  };
}

export class TempestDiceOverlay {
  private settings = structuredClone(defaultSettings);
  private latestRoll?: TempestStudioDiceRoll;
  private history: TempestStudioDiceRoll[] = [];
  private clients = new Map<ServerResponse, string>();
  private clientStatuses = new Map<string, DiceClientStatus>();
  private clientHeartbeats = new Map<ServerResponse, NodeJS.Timeout>();
  private pending?: PendingRoll;
  private pendingAudioTest?: PendingAudioTest;
  private audioStatus: TempestDiceAudioStatus = { state: 'untested' };
  private completedRolls = new Map<string, { token: string; roll: TempestStudioDiceRoll }>();
  private requests = { pageLoads: 0, clientLoads: 0, eventConnections: 0, lastPageLoadedAt: '', lastClientLoadedAt: '', lastEventConnectedAt: '' };
  private readonly documentPath: string;
  private readonly customThemeDirectory: string;
  private customThemes: TempestDiceThemeOption[] = [];

  constructor(private readonly dataDirectory: string) {
    this.documentPath = path.join(dataDirectory, 'dice-overlay.json');
    this.customThemeDirectory = path.join(dataDirectory, 'dice-themes');
  }

  async initialize(): Promise<void> {
    await this.refreshThemes();
    try { this.settings = validateSettings({ ...defaultSettings, ...JSON.parse(await readFile(this.documentPath, 'utf8')) }, this.themes()); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && error instanceof SyntaxError) throw error; }
    await this.persist();
  }

  themes(): TempestDiceThemeOption[] { return structuredClone([...builtInThemes, ...this.customThemes]); }

  async refreshThemes(): Promise<TempestDiceThemeOption[]> {
    await mkdir(this.customThemeDirectory, { recursive: true });
    const imported: TempestDiceThemeOption[] = [];
    for (const entry of await readdir(this.customThemeDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[a-z][a-z0-9_-]{0,63}$/i.test(entry.name)) continue;
      if (builtInThemes.some((theme) => theme.id.toLowerCase() === entry.name.toLowerCase())) continue;
      try {
        const directory = path.join(this.customThemeDirectory, entry.name);
        const manifestPath = path.join(directory, 'theme.config.json');
        if (!(await stat(manifestPath)).isFile()) continue;
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
        if (manifest.systemName !== entry.name || !Array.isArray(manifest.diceAvailable)) continue;
        const diceAvailable = manifest.diceAvailable.filter((die): die is string => typeof die === 'string' && ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].includes(die)).slice(0, 7);
        if (!diceAvailable.length) continue;
        const material = manifest.material && typeof manifest.material === 'object' && !Array.isArray(manifest.material) ? manifest.material as Record<string, unknown> : undefined;
        imported.push({ id: entry.name, name: String(manifest.name || entry.name).trim().slice(0, 80) || entry.name, custom: true, diceAvailable, colorConfigurable: material?.type === 'color' });
      } catch { /* Invalid theme folders stay unavailable. */ }
    }
    this.customThemes = imported.sort((left, right) => left.name.localeCompare(right.name));
    if (!this.themes().some((theme) => theme.id === this.settings.diceTheme)) this.settings.diceTheme = 'default';
    return this.themes();
  }

  resolveCustomThemeAsset(themeId: string, segments: string[]): string | undefined {
    if (!this.customThemes.some((theme) => theme.id === themeId)) return undefined;
    const root = path.resolve(this.customThemeDirectory, themeId);
    const filePath = path.resolve(root, ...segments);
    return filePath.startsWith(`${root}${path.sep}`) ? filePath : undefined;
  }

  page(): string {
    this.requests.pageLoads++;
    this.requests.lastPageLoadedAt = new Date().toISOString();
    return diceOverlayPage.replace('__CLIENT_VERSION__', createHash('sha256').update(tempestDiceOverlayClient).digest('hex').slice(0, 12));
  }
  client(): string {
    this.requests.clientLoads++;
    this.requests.lastClientLoadedAt = new Date().toISOString();
    return tempestDiceOverlayClient;
  }

  connect(response: ServerResponse): void {
    this.requests.eventConnections++;
    this.requests.lastEventConnectedAt = new Date().toISOString();
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    const clientId = randomUUID();
    this.clients.set(response, clientId);
    this.clientStatuses.set(clientId, { state: 'connecting', updatedAt: new Date().toISOString() });
    this.write(response, 'init', { settings: this.settings, themes: this.themes(), clientId, authority: this.authorityClientId() === clientId });
    const heartbeat = setInterval(() => {
      if (response.destroyed || response.writableEnded) return;
      this.write(response, 'heartbeat', { at: new Date().toISOString(), authority: this.authorityClientId() === clientId });
    }, 15_000);
    heartbeat.unref?.();
    this.clientHeartbeats.set(response, heartbeat);
    response.on('close', () => {
      const wasAuthority = this.authorityClientId() === clientId;
      this.removeClient(response);
      if (wasAuthority && this.pending) {
        if (this.clients.size) this.sendPendingToAuthority();
        else this.rejectPending('The active 3D Dice Browser Source disconnected before the roll settled.');
      }
      if (wasAuthority && this.pendingAudioTest && !this.clients.size) this.resolveAudioFailure('The active 3D Dice Browser Source disconnected during its sound test.');
    });
  }

  reportClient(input: unknown): DiceClientStatus {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Dice Browser Source status must be an object.');
    const report = input as Record<string, unknown>;
    const clientId = String(report.clientId || '');
    if (![...this.clients.values()].includes(clientId)) throw new Error('The Dice Browser Source client is no longer connected.');
    const state = ['connecting', 'ready', 'degraded', 'failed'].includes(String(report.state)) ? report.state as DiceClientStatus['state'] : undefined;
    if (!state) throw new Error('Dice Browser Source status is invalid.');
    const status: DiceClientStatus = {
      state,
      updatedAt: new Date().toISOString(),
      ...(typeof report.theme === 'string' ? { theme: report.theme.slice(0, 64) } : {}),
      ...(['offscreen', 'onscreen', 'fallback'].includes(String(report.renderer)) ? { renderer: report.renderer as DiceClientStatus['renderer'] } : {}),
      ...(typeof report.error === 'string' && report.error.trim() ? { error: report.error.trim().slice(0, 500) } : {})
    };
    this.clientStatuses.set(clientId, status);
    return structuredClone(status);
  }

  reportAudio(input: unknown): TempestDiceAudioStatus {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Dice audio status must be an object.');
    const report = input as Record<string, unknown>;
    const clientId = String(report.clientId || '');
    if (![...this.clients.values()].includes(clientId)) throw new Error('The Dice Browser Source client is no longer connected.');
    const state = report.state === 'ready' || report.state === 'failed' ? report.state : undefined;
    const method = report.method === 'media' || report.method === 'web-audio' ? report.method : undefined;
    if (!state || !method) throw new Error('Dice audio status is invalid.');
    this.audioStatus = {
      state,
      method,
      testedAt: new Date().toISOString(),
      ...(typeof report.error === 'string' && report.error.trim() ? { error: report.error.trim().slice(0, 500) } : {})
    };
    if (this.pendingAudioTest && report.testId === this.pendingAudioTest.id) {
      clearTimeout(this.pendingAudioTest.timeout);
      const pending = this.pendingAudioTest;
      this.pendingAudioTest = undefined;
      pending.resolve(structuredClone(this.audioStatus));
    }
    return structuredClone(this.audioStatus);
  }

  async testAudio(): Promise<TempestDiceAudioStatus> {
    const authority = this.authorityClient();
    if (!authority) throw new Error('Open the 3D Dice Browser Source in Broadcast before testing its sound.');
    if (this.pendingAudioTest) throw new Error('Wait for the current 3D Dice sound test to finish.');
    const id = randomUUID();
    this.audioStatus = { state: 'testing' };
    return new Promise<TempestDiceAudioStatus>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.pendingAudioTest?.id !== id) return;
        this.pendingAudioTest = undefined;
        this.audioStatus = { state: 'failed', testedAt: new Date().toISOString(), error: 'The Browser Source did not confirm dice audio within 8 seconds.' };
        resolve(structuredClone(this.audioStatus));
      }, 8_000);
      timeout.unref?.();
      this.pendingAudioTest = { id, resolve, timeout };
      this.write(authority[0], 'audio-test', { id });
    });
  }

  async roll(input: unknown): Promise<TempestStudioDiceRoll> {
    if (!this.settings.enabled) throw new Error('The 3D Dice overlay is disabled.');
    if (!this.clients.size) throw new Error('Open the 3D Dice Browser Source in Broadcast before rolling.');
    const authorityStatus = this.clientStatuses.get(this.authorityClientId() || '');
    if (authorityStatus?.state === 'failed') throw new Error(`The 3D Dice Browser Source engine failed${authorityStatus.error ? `: ${authorityStatus.error}` : '.'}`);
    if (this.pending) throw new Error('Wait for the current 3D dice roll to settle before starting another.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Dice roll request must be an object.');
    const request = input as Record<string, unknown>;
    const parsed = parseStudioDiceExpression(request.expression);
    const physicalSides = diceBoxPhysicalSides(parsed.sides);
    const selectedTheme = this.themes().find((theme) => theme.id === this.settings.diceTheme);
    if (!selectedTheme?.diceAvailable.includes(`d${physicalSides}`)) throw new Error(`${selectedTheme?.name || 'The selected theme'} does not include the d${physicalSides} model needed for this roll.`);
    const reason = String(request.reason || '').trim().slice(0, 160);
    const rollerName = String(request.rollerName || 'Streamer').trim().slice(0, 80) || 'Streamer';
    const presentation: DiceBoxRollRequest = {
      id: randomUUID(), token: randomUUID(), expression: parsed.expression,
      count: parsed.count, sides: parsed.sides, physicalSides, reason, rollerName
    };
    return new Promise<TempestStudioDiceRoll>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pending?.request.id !== presentation.id) return;
        this.pending = undefined;
        this.broadcast('roll-error', { id: presentation.id, message: 'The physical dice did not finish within 45 seconds.' });
        this.broadcast('clear', {});
        reject(new Error('The physical dice did not finish within 45 seconds.'));
      }, 45_000);
      this.pending = { request: presentation, parsed, reason, rollerName, resolve, reject, timeout };
      this.sendPendingToAuthority();
    });
  }

  complete(input: unknown): TempestStudioDiceRoll {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Dice result must be an object.');
    const submitted = input as Record<string, unknown>;
    if (!this.pending) {
      const completed = this.completedRolls.get(String(submitted.id || ''));
      if (completed && submitted.token === completed.token) return structuredClone(completed.roll);
      throw new Error('There is no active 3D dice roll.');
    }
    const pending = this.pending;
    if (submitted.id !== pending.request.id || submitted.token !== pending.request.token) throw new Error('The 3D dice result token is invalid or expired.');
    if (!Array.isArray(submitted.values) || submitted.values.length !== pending.parsed.count) throw new Error(`The 3D dice result must contain exactly ${pending.parsed.count} values.`);
    const values = submitted.values.map((value, index) => integer(value, `Die ${index + 1}`, 1, pending.parsed.sides));
    let keptIndices = new Set(values.map((_value, index) => index));
    if (pending.parsed.keepMode && pending.parsed.keepCount) {
      const descending = pending.parsed.keepMode === 'kh';
      const ranked = values.map((_value, index) => index).sort((left, right) => descending ? values[right] - values[left] : values[left] - values[right]);
      keptIndices = new Set(ranked.slice(0, pending.parsed.keepCount));
    }
    const dice = values.map((value, index) => ({ index, sides: pending.parsed.sides, value, kept: keptIndices.has(index) }));
    const subtotal = dice.reduce((sum, die) => sum + (die.kept ? die.value : 0), 0);
    const roll: TempestStudioDiceRoll = {
      id: pending.request.id, expression: pending.parsed.expression, dice, modifier: pending.parsed.modifier,
      subtotal, total: subtotal + pending.parsed.modifier, reason: pending.reason, rollerName: pending.rollerName, rolledAt: new Date().toISOString()
    };
    clearTimeout(pending.timeout);
    this.pending = undefined;
    this.latestRoll = roll;
    this.history.unshift(roll);
    this.history = this.history.slice(0, 20);
    this.completedRolls.set(roll.id, { token: pending.request.token, roll: structuredClone(roll) });
    while (this.completedRolls.size > 20) this.completedRolls.delete(this.completedRolls.keys().next().value as string);
    this.broadcast('roll-result', roll);
    pending.resolve(structuredClone(roll));
    return structuredClone(roll);
  }

  fail(input: unknown): void {
    if (!this.pending) throw new Error('There is no active 3D dice roll.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Dice failure report must be an object.');
    const submitted = input as Record<string, unknown>;
    const pending = this.pending;
    if (submitted.id !== pending.request.id || submitted.token !== pending.request.token) throw new Error('The 3D dice result token is invalid or expired.');
    const message = String(submitted.message || 'The Browser Source could not finish the physical dice roll.').trim().slice(0, 240) || 'The Browser Source could not finish the physical dice roll.';
    clearTimeout(pending.timeout);
    this.pending = undefined;
    this.broadcast('roll-error', { id: pending.request.id, message });
    this.broadcast('clear', {});
    pending.reject(new Error(message));
  }

  async update(patch: unknown): Promise<TempestDiceOverlaySettings> {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Dice overlay settings must be an object.');
    this.settings = validateSettings({ ...this.settings, ...(patch as Partial<TempestDiceOverlaySettings>), schemaVersion: 1, updatedAt: new Date().toISOString() }, this.themes());
    await this.persist();
    this.broadcast('settings', this.settings);
    return structuredClone(this.settings);
  }

  clear(): void {
    if (this.pending) {
      clearTimeout(this.pending.timeout);
      this.pending.reject(new Error('The 3D dice roll was cleared before it settled.'));
      this.pending = undefined;
    }
    this.broadcast('clear', {});
  }

  status(url: string): Record<string, unknown> {
    const authorityId = this.authorityClientId();
    const clients = [...this.clients.values()].map((id) => ({ id, authority: id === authorityId, ...(this.clientStatuses.get(id) || { state: 'connecting' }) }));
    return {
      url, connectedClients: this.clients.size, rolling: Boolean(this.pending), engine: '@3d-dice/dice-box 1.1.4',
      clients, readyClients: clients.filter((client) => client.state === 'ready' || client.state === 'degraded').length,
      duplicateClients: Math.max(0, clients.length - 1), audio: structuredClone(this.audioStatus),
      requests: structuredClone(this.requests),
      settings: structuredClone(this.settings), themes: this.themes(), latestRoll: this.latestRoll ? structuredClone(this.latestRoll) : undefined,
      history: structuredClone(this.history)
    };
  }

  close(): void {
    this.rejectPending('The 3D Dice overlay closed before the roll settled.', false);
    this.resolveAudioFailure('The 3D Dice overlay closed during its sound test.');
    for (const timer of this.clientHeartbeats.values()) clearInterval(timer);
    this.clientHeartbeats.clear();
    for (const client of this.clients.keys()) client.end();
    this.clients.clear();
    this.clientStatuses.clear();
  }

  private authorityClient(): [ServerResponse, string] | undefined { return this.clients.entries().next().value; }
  private authorityClientId(): string | undefined { return this.clients.values().next().value; }

  private removeClient(response: ServerResponse): void {
    const clientId = this.clients.get(response);
    const heartbeat = this.clientHeartbeats.get(response);
    if (heartbeat) clearInterval(heartbeat);
    this.clientHeartbeats.delete(response);
    this.clients.delete(response);
    if (clientId) this.clientStatuses.delete(clientId);
  }

  private rejectPending(message: string, notify = true): void {
    if (!this.pending) return;
    const pending = this.pending;
    clearTimeout(pending.timeout);
    this.pending = undefined;
    if (notify) {
      this.broadcast('roll-error', { id: pending.request.id, message });
      this.broadcast('clear', {});
    }
    pending.reject(new Error(message));
  }

  private resolveAudioFailure(error: string): void {
    if (!this.pendingAudioTest) return;
    const pending = this.pendingAudioTest;
    clearTimeout(pending.timeout);
    this.pendingAudioTest = undefined;
    this.audioStatus = { state: 'failed', testedAt: new Date().toISOString(), error };
    pending.resolve(structuredClone(this.audioStatus));
  }

  private sendPendingToAuthority(): void {
    if (!this.pending) return;
    const authority = this.clients.keys().next().value as ServerResponse | undefined;
    if (authority) this.write(authority, 'roll-request', this.pending.request);
  }

  private broadcast(type: string, payload: unknown): void {
    for (const client of [...this.clients.keys()]) {
      if (client.destroyed || client.writableEnded) this.removeClient(client);
      else this.write(client, type, payload);
    }
  }

  private write(response: ServerResponse, type: string, payload: unknown): void {
    response.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  private async persist(): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    const temporary = `${this.documentPath}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.documentPath);
  }
}
