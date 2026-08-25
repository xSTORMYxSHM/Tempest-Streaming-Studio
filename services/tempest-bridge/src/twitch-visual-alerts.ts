import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizedTwitchEventTopics, TempestNormalizedTwitchEvent, TempestTwitchAlertDesign, TempestTwitchVisualAlertDefinition } from '@tempest/contracts';

interface TwitchVisualAlertDocument {
  schemaVersion: 1;
  alerts: TempestTwitchVisualAlertDefinition[];
  updatedAt: string;
}

export function defaultTwitchAlertDesign(): TempestTwitchAlertDesign {
  return {
    preset: 'tempest', layout: 'media-left', position: 'bottom-center', positionOffsetX: 0, positionOffsetY: 0, customPositionX: 50, customPositionY: 82, scale: 1, entranceAnimation: 'slide-up', exitAnimation: 'fade', textAnimation: 'glow',
    headlineTemplate: '{event}', detailTemplate: 'Triggered by {viewer}', showEyebrow: true, showHeadline: true, showDetail: true, showViewerMessage: true,
    fontFamily: 'Inter', fontSize: 42, fontWeight: 800, textAlign: 'left', textColor: '#F5FBFF', secondaryTextColor: '#A9BDC7', textShadow: 0.35, letterSpacing: 0,
    textOffsetX: 0, textOffsetY: 0, textPositionX: 50, textPositionY: 72, eyebrowPositionX: 50, eyebrowPositionY: 52, headlinePositionX: 50, headlinePositionY: 63, detailPositionX: 50, detailPositionY: 74, messagePositionX: 50, messagePositionY: 84, cardWidth: 900, backgroundColor: '#050C13', backgroundOpacity: 0.94, borderWidth: 1, borderRadius: 24, padding: 22, cardShadow: 0.55,
    mediaWidth: 320, mediaHeight: 210, mediaFit: 'contain', mediaBorderRadius: 16, mediaDelayMs: 0, textDelayMs: 0, textDurationMs: 0, soundDelayMs: 0,
    ttsEnabled: false, ttsTemplate: '{viewer}: {event}', ttsVolume: 0.8, ttsRate: 1, ttsPitch: 1, customHtml: '', customCss: '', customJavaScript: ''
  };
}

const seeds: TempestTwitchVisualAlertDefinition[] = [
  { schemaVersion: 1, id: 'twitch.follow', topic: 'viewer.followed', name: 'New Follower', enabled: true, durationMs: 6000, volume: 0.8, accent: '#54F2EB', design: defaultTwitchAlertDesign() },
  { schemaVersion: 1, id: 'twitch.subscription', topic: 'viewer.subscription.started', variant: 'standard', name: 'New Subscription', enabled: true, durationMs: 7000, volume: 0.8, accent: '#A98BFF', design: defaultTwitchAlertDesign() },
  { schemaVersion: 1, id: 'twitch.gift-subscription', topic: 'viewer.subscription.started', variant: 'gift', name: 'Gift Subscription', enabled: true, durationMs: 7000, volume: 0.8, accent: '#F5A6D5', design: defaultTwitchAlertDesign() },
  { schemaVersion: 1, id: 'twitch.cheer', topic: 'viewer.cheer.received', name: 'Cheer / Bits', enabled: true, durationMs: 7000, volume: 0.8, accent: '#8D74E8', design: defaultTwitchAlertDesign() },
  { schemaVersion: 1, id: 'twitch.raid', topic: 'viewer.raid.received', name: 'Incoming Raid', enabled: true, durationMs: 9000, volume: 0.8, accent: '#FF955C', design: defaultTwitchAlertDesign() },
  { schemaVersion: 1, id: 'twitch.channel-points', topic: 'viewer.reward.redeemed', name: 'Channel Point Reward', enabled: true, durationMs: 6000, volume: 0.8, accent: '#7CF0B2', design: defaultTwitchAlertDesign() }
];
const seedIds = new Set(seeds.map((alert) => alert.id));
const idPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;

const copy = <T>(value: T): T => structuredClone(value);

function choice<T extends string>(value: unknown, fallback: T, choices: readonly T[], field: string): T {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new Error(`${field} must be one of: ${choices.join(', ')}.`);
  return value as T;
}

function numberRange(value: unknown, fallback: number, minimum: number, maximum: number, field: string, integer = false): number {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum || (integer && !Number.isInteger(number))) throw new Error(`${field} must be between ${minimum} and ${maximum}.`);
  return number;
}

function designColor(value: unknown, fallback: string, field: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${field} must be a six-digit hex color.`);
  return value.toUpperCase();
}

function designText(value: unknown, fallback: string, maximum: number, field: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > maximum || /\0/.test(value)) throw new Error(`${field} must contain at most ${maximum} characters.`);
  return value;
}

export function validateTwitchAlertDesign(value: unknown): TempestTwitchAlertDesign {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error('design must be an object.');
  const input = (value || {}) as Record<string, unknown>;
  const base = defaultTwitchAlertDesign();
  return {
    preset: choice(input.preset, base.preset, ['tempest', 'minimal', 'compact', 'glass', 'neon', 'cinematic'], 'design.preset'),
    layout: choice(input.layout, base.layout, ['media-left', 'media-right', 'media-top', 'media-overlay', 'text-only', 'media-only'], 'design.layout'),
    position: choice(input.position, base.position, ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right', 'custom'], 'design.position'),
    positionOffsetX: numberRange(input.positionOffsetX, base.positionOffsetX, -1000, 1000, 'design.positionOffsetX', true),
    positionOffsetY: numberRange(input.positionOffsetY, base.positionOffsetY, -1000, 1000, 'design.positionOffsetY', true),
    customPositionX: numberRange(input.customPositionX, base.customPositionX, 0, 100, 'design.customPositionX'),
    customPositionY: numberRange(input.customPositionY, base.customPositionY, 0, 100, 'design.customPositionY'),
    scale: numberRange(input.scale, base.scale, 0.25, 2, 'design.scale'),
    entranceAnimation: choice(input.entranceAnimation, base.entranceAnimation, ['fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'zoom', 'bounce', 'flip', 'glitch'], 'design.entranceAnimation'),
    exitAnimation: choice(input.exitAnimation, base.exitAnimation, ['fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'zoom'], 'design.exitAnimation'),
    textAnimation: choice(input.textAnimation, base.textAnimation, ['none', 'pulse', 'wiggle', 'glow', 'typewriter'], 'design.textAnimation'),
    headlineTemplate: designText(input.headlineTemplate, base.headlineTemplate, 240, 'design.headlineTemplate'),
    detailTemplate: designText(input.detailTemplate, base.detailTemplate, 320, 'design.detailTemplate'),
    showEyebrow: input.showEyebrow === undefined ? base.showEyebrow : Boolean(input.showEyebrow),
    showHeadline: input.showHeadline === undefined ? base.showHeadline : Boolean(input.showHeadline),
    showDetail: input.showDetail === undefined ? base.showDetail : Boolean(input.showDetail),
    showViewerMessage: input.showViewerMessage === undefined ? base.showViewerMessage : Boolean(input.showViewerMessage),
    fontFamily: choice(input.fontFamily, base.fontFamily, ['Inter', 'Segoe UI', 'Consolas', 'Arial', 'Georgia', 'Impact', 'Trebuchet MS', 'Times New Roman'], 'design.fontFamily'),
    fontSize: numberRange(input.fontSize, base.fontSize, 16, 120, 'design.fontSize', true),
    fontWeight: numberRange(input.fontWeight, base.fontWeight, 100, 900, 'design.fontWeight', true),
    textAlign: choice(input.textAlign, base.textAlign, ['left', 'center', 'right'], 'design.textAlign'),
    textColor: designColor(input.textColor, base.textColor, 'design.textColor'),
    secondaryTextColor: designColor(input.secondaryTextColor, base.secondaryTextColor, 'design.secondaryTextColor'),
    textShadow: numberRange(input.textShadow, base.textShadow, 0, 1, 'design.textShadow'),
    letterSpacing: numberRange(input.letterSpacing, base.letterSpacing, -5, 30, 'design.letterSpacing'),
    textOffsetX: numberRange(input.textOffsetX, base.textOffsetX, -1500, 1500, 'design.textOffsetX', true),
    textOffsetY: numberRange(input.textOffsetY, base.textOffsetY, -1000, 1000, 'design.textOffsetY', true),
    textPositionX: numberRange(input.textPositionX, base.textPositionX, 0, 100, 'design.textPositionX'),
    textPositionY: numberRange(input.textPositionY, base.textPositionY, 0, 100, 'design.textPositionY'),
    eyebrowPositionX: numberRange(input.eyebrowPositionX, input.textPositionX === undefined ? base.eyebrowPositionX : Number(input.textPositionX), 0, 100, 'design.eyebrowPositionX'),
    eyebrowPositionY: numberRange(input.eyebrowPositionY, input.textPositionY === undefined ? base.eyebrowPositionY : Math.max(0, Number(input.textPositionY) - 11), 0, 100, 'design.eyebrowPositionY'),
    headlinePositionX: numberRange(input.headlinePositionX, input.textPositionX === undefined ? base.headlinePositionX : Number(input.textPositionX), 0, 100, 'design.headlinePositionX'),
    headlinePositionY: numberRange(input.headlinePositionY, input.textPositionY === undefined ? base.headlinePositionY : Number(input.textPositionY), 0, 100, 'design.headlinePositionY'),
    detailPositionX: numberRange(input.detailPositionX, input.textPositionX === undefined ? base.detailPositionX : Number(input.textPositionX), 0, 100, 'design.detailPositionX'),
    detailPositionY: numberRange(input.detailPositionY, input.textPositionY === undefined ? base.detailPositionY : Math.min(100, Number(input.textPositionY) + 11), 0, 100, 'design.detailPositionY'),
    messagePositionX: numberRange(input.messagePositionX, input.textPositionX === undefined ? base.messagePositionX : Number(input.textPositionX), 0, 100, 'design.messagePositionX'),
    messagePositionY: numberRange(input.messagePositionY, input.textPositionY === undefined ? base.messagePositionY : Math.min(100, Number(input.textPositionY) + 21), 0, 100, 'design.messagePositionY'),
    cardWidth: numberRange(input.cardWidth, base.cardWidth, 280, 2600, 'design.cardWidth', true),
    backgroundColor: designColor(input.backgroundColor, base.backgroundColor, 'design.backgroundColor'),
    backgroundOpacity: numberRange(input.backgroundOpacity, base.backgroundOpacity, 0, 1, 'design.backgroundOpacity'),
    borderWidth: numberRange(input.borderWidth, base.borderWidth, 0, 16, 'design.borderWidth', true),
    borderRadius: numberRange(input.borderRadius, base.borderRadius, 0, 100, 'design.borderRadius', true),
    padding: numberRange(input.padding, base.padding, 0, 100, 'design.padding', true),
    cardShadow: numberRange(input.cardShadow, base.cardShadow, 0, 1, 'design.cardShadow'),
    mediaWidth: numberRange(input.mediaWidth, base.mediaWidth, 40, 2400, 'design.mediaWidth', true),
    mediaHeight: numberRange(input.mediaHeight, base.mediaHeight, 40, 1440, 'design.mediaHeight', true),
    mediaFit: choice(input.mediaFit, base.mediaFit, ['contain', 'cover', 'fill'], 'design.mediaFit'),
    mediaBorderRadius: numberRange(input.mediaBorderRadius, base.mediaBorderRadius, 0, 100, 'design.mediaBorderRadius', true),
    mediaDelayMs: numberRange(input.mediaDelayMs, base.mediaDelayMs, 0, 60000, 'design.mediaDelayMs', true),
    textDelayMs: numberRange(input.textDelayMs, base.textDelayMs, 0, 60000, 'design.textDelayMs', true),
    textDurationMs: numberRange(input.textDurationMs, base.textDurationMs, 0, 60000, 'design.textDurationMs', true),
    soundDelayMs: numberRange(input.soundDelayMs, base.soundDelayMs, 0, 60000, 'design.soundDelayMs', true),
    ttsEnabled: input.ttsEnabled === undefined ? base.ttsEnabled : Boolean(input.ttsEnabled),
    ttsTemplate: designText(input.ttsTemplate, base.ttsTemplate, 320, 'design.ttsTemplate'),
    ttsVolume: numberRange(input.ttsVolume, base.ttsVolume, 0, 1, 'design.ttsVolume'),
    ttsRate: numberRange(input.ttsRate, base.ttsRate, 0.5, 2, 'design.ttsRate'),
    ttsPitch: numberRange(input.ttsPitch, base.ttsPitch, 0.5, 2, 'design.ttsPitch'),
    customHtml: designText(input.customHtml, base.customHtml, 24000, 'design.customHtml'),
    customCss: designText(input.customCss, base.customCss, 24000, 'design.customCss'),
    customJavaScript: designText(input.customJavaScript, base.customJavaScript, 24000, 'design.customJavaScript')
  };
}

function validateVisualUri(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('visualUri must be a local image or video file URI.');
  const url = new URL(value);
  if (url.protocol !== 'file:') throw new Error('Twitch Alert visuals must remain local file URIs.');
  const extension = path.extname(fileURLToPath(url)).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.mp4', '.webm'].includes(extension)) throw new Error('Twitch Alert visuals support PNG, JPG, GIF, WebP, AVIF, MP4, or WebM files.');
  return url.href;
}

function validateAudioUri(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('audioUri must be a local audio file URI.');
  const url = new URL(value);
  if (url.protocol !== 'file:') throw new Error('Twitch Alert audio must remain a local file URI.');
  const extension = path.extname(fileURLToPath(url)).toLowerCase();
  if (!['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].includes(extension)) throw new Error('Twitch Alert audio supports MP3, WAV, OGG, M4A, AAC, or FLAC files.');
  return url.href;
}

function validate(input: TempestTwitchVisualAlertDefinition): TempestTwitchVisualAlertDefinition {
  if (input.schemaVersion !== 1) throw new Error('Twitch Alert schemaVersion must be 1.');
  if (typeof input.id !== 'string' || !idPattern.test(input.id)) throw new Error('Twitch Alert id must be a namespaced identifier.');
  if (typeof input.name !== 'string' || !input.name.trim()) throw new Error('Twitch Alert name is required.');
  if (!normalizedTwitchEventTopics.includes(input.topic)) throw new Error('Twitch Alert topic is not a supported normalized Twitch event.');
  if (input.variant !== undefined && (input.topic !== 'viewer.subscription.started' || !['standard', 'gift'].includes(input.variant))) throw new Error('variant is only supported for standard or gift subscription alerts.');
  const durationMs = Number(input.durationMs);
  if (!Number.isInteger(durationMs) || durationMs < 1000 || durationMs > 60000) throw new Error('durationMs must be an integer between 1000 and 60000.');
  const volume = Number(input.volume);
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new Error('volume must be between 0 and 1.');
  if (typeof input.enabled !== 'boolean') throw new Error('enabled must be boolean.');
  if (!/^#[0-9a-f]{6}$/i.test(input.accent)) throw new Error('accent must be a six-digit hex color.');
  return { ...input, name: input.name.trim(), durationMs, audioUri: validateAudioUri(input.audioUri), volume, visualUri: validateVisualUri(input.visualUri), accent: input.accent.toUpperCase(), design: validateTwitchAlertDesign(input.design) };
}

function eventSignature(alert: Pick<TempestTwitchVisualAlertDefinition, 'topic' | 'variant'>): string {
  return `${alert.topic}:${alert.topic === 'viewer.subscription.started' ? alert.variant || 'standard' : ''}`;
}

export class TempestTwitchVisualAlertCatalog {
  private alerts: TempestTwitchVisualAlertDefinition[] = [];
  private readonly documentPath: string;

  constructor(private readonly dataDirectory: string) {
    this.documentPath = path.join(dataDirectory, 'twitch-visual-alerts.json');
  }

  async initialize(): Promise<void> {
    let stored: TwitchVisualAlertDocument | undefined;
    try { stored = JSON.parse(await readFile(this.documentPath, 'utf8')) as TwitchVisualAlertDocument; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const storedById = new Map((stored?.alerts || []).map((alert) => [alert.id, alert]));
    this.alerts = seeds.map((seed) => {
      try { return validate({ ...seed, ...storedById.get(seed.id), id: seed.id, topic: seed.topic, variant: seed.variant, custom: false }); }
      catch { return copy(seed); }
    });
    for (const saved of stored?.alerts || []) {
      if (seedIds.has(saved.id)) continue;
      try {
        const alert = validate({ ...saved, custom: true });
        if (!this.alerts.some((entry) => eventSignature(entry) === eventSignature(alert))) this.alerts.push(alert);
      } catch { /* Ignore invalid custom entries while preserving the bundled presets. */ }
    }
    await this.persist();
  }

  list(): TempestTwitchVisualAlertDefinition[] { return this.alerts.map(copy); }

  find(id: string): TempestTwitchVisualAlertDefinition | undefined {
    const alert = this.alerts.find((entry) => entry.id === id);
    return alert ? copy(alert) : undefined;
  }

  findForEvent(event: TempestNormalizedTwitchEvent): TempestTwitchVisualAlertDefinition | undefined {
    const isGift = event.topic === 'viewer.subscription.started' && event.payload.isGift === true;
    const alert = this.alerts.find((entry) => entry.topic === event.topic && (entry.topic !== 'viewer.subscription.started' || entry.variant === (isGift ? 'gift' : 'standard')));
    return alert ? copy(alert) : undefined;
  }

  async update(id: string, patch: unknown): Promise<TempestTwitchVisualAlertDefinition> {
    const index = this.alerts.findIndex((entry) => entry.id === id);
    if (index < 0) throw new Error(`Twitch Visual Alert ${id} was not found.`);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Twitch Visual Alert changes must be an object.');
    const source = patch as Record<string, unknown>;
    const allowed = new Set(['enabled', 'durationMs', 'audioUri', 'volume', 'visualUri', 'accent', 'design']);
    for (const key of Object.keys(source)) if (!allowed.has(key)) throw new Error(`${key} cannot be changed through the Twitch Visual Alert catalog.`);
    const updated = validate({
      ...this.alerts[index],
      ...(source.enabled === undefined ? {} : { enabled: source.enabled as boolean }),
      ...(source.durationMs === undefined ? {} : { durationMs: Number(source.durationMs) }),
      ...(Object.hasOwn(source, 'audioUri') ? { audioUri: validateAudioUri(source.audioUri) } : {}),
      ...(source.volume === undefined ? {} : { volume: Number(source.volume) }),
      ...(Object.hasOwn(source, 'visualUri') ? { visualUri: validateVisualUri(source.visualUri) } : {}),
      ...(source.accent === undefined ? {} : { accent: String(source.accent) }),
      ...(source.design === undefined ? {} : { design: validateTwitchAlertDesign(source.design) }),
      updatedAt: new Date().toISOString()
    });
    this.alerts[index] = updated;
    await this.persist();
    return copy(updated);
  }

  async create(input: unknown): Promise<TempestTwitchVisualAlertDefinition> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('New Twitch Alert details must be an object.');
    const source = input as Record<string, unknown>;
    const id = typeof source.id === 'string' ? source.id.trim().toLowerCase() : '';
    const topic = source.topic as TempestTwitchVisualAlertDefinition['topic'];
    const variant = topic === 'viewer.subscription.started' ? (source.variant === 'gift' ? 'gift' : 'standard') : undefined;
    if (this.alerts.some((entry) => entry.id === id)) throw new Error(`Twitch Alert ${id} already exists.`);
    if (this.alerts.some((entry) => eventSignature(entry) === eventSignature({ topic, variant }))) throw new Error('That Twitch event already has an alert. Edit the existing preset instead.');
    const alert = validate({
      schemaVersion: 1,
      id,
      topic,
      ...(variant ? { variant } : {}),
      name: source.name as string,
      enabled: source.enabled === undefined ? true : Boolean(source.enabled),
      durationMs: source.durationMs === undefined ? 6000 : Number(source.durationMs),
      volume: source.volume === undefined ? 0.8 : Number(source.volume),
      accent: source.accent === undefined ? '#54F2EB' : String(source.accent),
      design: validateTwitchAlertDesign(source.design),
      custom: true,
      updatedAt: new Date().toISOString()
    });
    this.alerts.push(alert);
    await this.persist();
    return copy(alert);
  }

  async remove(id: string): Promise<boolean> {
    const index = this.alerts.findIndex((entry) => entry.id === id);
    if (index < 0) return false;
    if (!this.alerts[index].custom || seedIds.has(id)) throw new Error('Bundled Twitch Alerts cannot be deleted. They can be disabled instead.');
    this.alerts.splice(index, 1);
    await this.persist();
    return true;
  }

  private async persist(): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    const temporaryPath = `${this.documentPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify({ schemaVersion: 1, alerts: this.alerts, updatedAt: new Date().toISOString() }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, this.documentPath);
  }
}
