import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TempestSoundAlertDefinition,
  TempestSoundAlertTriggerRequest,
  TempestTwitchAlertDesign
} from '@tempest/contracts';
import { defaultTwitchAlertDesign, validateTwitchAlertDesign } from './twitch-visual-alerts';

interface SoundAlertDocument {
  schemaVersion: 1;
  alerts: TempestSoundAlertDefinition[];
  updatedAt: string;
}

export interface PreparedSoundAlertTrigger {
  alert: TempestSoundAlertDefinition;
  eventId: string;
  request: TempestSoundAlertTriggerRequest;
  payload: Record<string, unknown>;
}

const idPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;
const replayWindowMs = 10 * 60 * 1000;
const broadcastEffects = ['pulse', 'glow', 'glitch', 'spectrum', 'surge'] as const;
const broadcastCircuits = ['all', 'core', 'frame', 'chat', 'plates', 'alerts'] as const;

const catalogSeed: Array<Pick<TempestSoundAlertDefinition, 'id' | 'name' | 'cue' | 'durationMs' | 'legacyReceiver' | 'accent'>> = [
  { id: 'sound-alert.hype-pulse', name: 'Hype Pulse', cue: 'sound-alert.hype-pulse', durationMs: 8000, accent: '#54f2eb' },
  { id: 'sound-alert.dance-break', name: 'Dance Break', cue: 'sound-alert.dance-break', durationMs: 15000, accent: '#f5a6d5' },
  { id: 'sound-alert.celebration', name: 'Celebration', cue: 'sound-alert.celebration', durationMs: 10000, accent: '#ffd55f' },
  { id: 'sound-alert.dramatic-entrance', name: 'Dramatic Entrance', cue: 'sound-alert.dramatic-entrance', durationMs: 12000, accent: '#86d7ff' },
  { id: 'sound-alert.victory-pose', name: 'Victory Pose', cue: 'sound-alert.victory-pose', durationMs: 9000, accent: '#7cf0b2' },
  { id: 'sound-alert.chaos-mode', name: 'Chaos Mode', cue: 'sound-alert.chaos-mode', durationMs: 20000, accent: '#ff7edb' }
];
const bundledIds = new Set(catalogSeed.map((alert) => alert.id));

function defaultInteractionAlertDesign(): TempestTwitchAlertDesign {
  return {
    ...defaultTwitchAlertDesign(),
    position: 'custom',
    customPositionX: 50,
    customPositionY: 82,
    headlineTemplate: '{event}',
    detailTemplate: 'Requested by {viewer}',
    showViewerMessage: false,
    ttsTemplate: '{viewer} requested {event}'
  };
}

export const bundledSoundAlerts: TempestSoundAlertDefinition[] = catalogSeed.map((alert) => ({
  schemaVersion: 1,
  ...alert,
  description: `Starter viewer interaction. Add local media, then optionally connect an avatar or broadcast reaction.`,
  enabled: true,
  free: true,
  warudoEnabled: false,
  viewerCooldownMs: 60000,
  globalCooldownMs: alert.durationMs,
  volume: 0.8,
  visualDurationMs: 6000,
  broadcastEffect: 'spectrum',
  broadcastCircuit: 'all',
  broadcastEffectStrength: 1,
  design: defaultInteractionAlertDesign()
}));

function copy<T>(value: T): T {
  return structuredClone(value);
}

function boundedInteger(value: unknown, name: string, minimum: number, maximum: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return number;
}

function validateAudioUri(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('audioUri must be a local file URI.');
  const url = new URL(value);
  if (url.protocol !== 'file:') throw new Error('Sound Alert audio must remain a local file URI.');
  const extension = path.extname(fileURLToPath(url)).toLowerCase();
  if (!['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].includes(extension)) {
    throw new Error('Sound Alert audio supports MP3, WAV, OGG, M4A, AAC, or FLAC files.');
  }
  return url.href;
}

function validateVisualUri(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('visualUri must be a local image or video file URI.');
  const url = new URL(value);
  if (url.protocol !== 'file:') throw new Error('Sound Alert visuals must remain a local file URI.');
  const extension = path.extname(fileURLToPath(url)).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.mp4', '.webm'].includes(extension)) {
    throw new Error('Sound Alert visuals support PNG, JPG, GIF, WebP, AVIF, MP4, or WebM files.');
  }
  return url.href;
}

function validateSourceName(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error(`${field} must be an OBS source name.`);
  const sourceName = value.trim();
  if (!sourceName || sourceName.length > 128 || /[\r\n\0]/.test(sourceName)) throw new Error(`${field} must contain 1 to 128 printable characters.`);
  return sourceName;
}

function validateChoice<T extends string>(value: unknown, field: string, choices: readonly T[]): T | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new Error(`${field} must be one of: ${choices.join(', ')}.`);
  return value as T;
}

function validateAccent(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('accent must be a six-digit hex color.');
  return value.toUpperCase();
}

function validateEffectStrength(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const strength = Number(value);
  if (!Number.isFinite(strength) || strength < 0.05 || strength > 1.5) throw new Error('broadcastEffectStrength must be between 0.05 and 1.5.');
  return strength;
}

export class TempestSoundAlertCatalog {
  private alerts: TempestSoundAlertDefinition[] = [];
  private lastAlertTrigger = new Map<string, number>();
  private lastViewerTrigger = new Map<string, number>();
  private eventIds = new Map<string, number>();
  private readonly documentPath: string;

  constructor(private readonly dataDirectory: string) {
    this.documentPath = path.join(dataDirectory, 'sound-alerts.json');
  }

  async initialize(): Promise<void> {
    let stored: SoundAlertDocument | null = null;
    try {
      stored = JSON.parse(await readFile(this.documentPath, 'utf8')) as SoundAlertDocument;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!stored) {
      this.alerts = bundledSoundAlerts.map(copy);
    } else {
      const seedsById = new Map(bundledSoundAlerts.map((entry) => [entry.id, entry]));
      this.alerts = [];
      for (const saved of stored.alerts || []) {
        const seed = seedsById.get(saved.id);
        try {
          this.alerts.push(this.validate(seed
            ? { ...seed, ...saved, id: seed.id, cue: seed.cue, free: true, custom: false }
            : { ...saved, custom: true }));
        } catch {
          if (seed) this.alerts.push(copy(seed));
          /* Ignore invalid custom entries while preserving valid existing profiles. */
        }
      }
    }
    await this.persist();
  }

  list(): TempestSoundAlertDefinition[] {
    return this.alerts.map(copy);
  }

  find(idOrCue: string): TempestSoundAlertDefinition | undefined {
    const normalized = idOrCue.trim().toLowerCase();
    const alert = this.alerts.find((entry) => entry.id.toLowerCase() === normalized || entry.cue.toLowerCase() === normalized || entry.legacyReceiver?.toLowerCase() === normalized);
    return alert ? copy(alert) : undefined;
  }

  async update(id: string, patch: unknown): Promise<TempestSoundAlertDefinition> {
    const index = this.alerts.findIndex((entry) => entry.id === id);
    if (index < 0) throw new Error(`Sound Alert ${id} was not found.`);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Sound Alert changes must be an object.');
    const source = patch as Record<string, unknown>;
    const allowed = new Set(['enabled', 'warudoEnabled', 'durationMs', 'viewerCooldownMs', 'globalCooldownMs', 'volume', 'audioUri', 'visualUri', 'visualDurationMs', 'broadcastAudioSource', 'broadcastVisualSource', 'broadcastEffect', 'broadcastCircuit', 'broadcastEffectStrength', 'accent', 'design']);
    for (const key of Object.keys(source)) if (!allowed.has(key)) throw new Error(`${key} cannot be changed through the Sound Alert catalog.`);
    const current = this.alerts[index];
    const updated = this.validate({
      ...current,
      ...(source.enabled === undefined ? {} : { enabled: source.enabled }),
      ...(source.warudoEnabled === undefined ? {} : { warudoEnabled: source.warudoEnabled }),
      ...(source.durationMs === undefined ? {} : { durationMs: source.durationMs }),
      ...(source.viewerCooldownMs === undefined ? {} : { viewerCooldownMs: source.viewerCooldownMs }),
      ...(source.globalCooldownMs === undefined ? {} : { globalCooldownMs: source.globalCooldownMs }),
      ...(source.volume === undefined ? {} : { volume: source.volume }),
      ...(Object.hasOwn(source, 'audioUri') ? { audioUri: validateAudioUri(source.audioUri) } : {}),
      ...(Object.hasOwn(source, 'visualUri') ? { visualUri: validateVisualUri(source.visualUri) } : {}),
      ...(source.visualDurationMs === undefined ? {} : { visualDurationMs: source.visualDurationMs }),
      ...(Object.hasOwn(source, 'broadcastAudioSource') ? { broadcastAudioSource: validateSourceName(source.broadcastAudioSource, 'broadcastAudioSource') } : {}),
      ...(Object.hasOwn(source, 'broadcastVisualSource') ? { broadcastVisualSource: validateSourceName(source.broadcastVisualSource, 'broadcastVisualSource') } : {}),
      ...(Object.hasOwn(source, 'broadcastEffect') ? { broadcastEffect: validateChoice(source.broadcastEffect, 'broadcastEffect', broadcastEffects) } : {}),
      ...(Object.hasOwn(source, 'broadcastCircuit') ? { broadcastCircuit: validateChoice(source.broadcastCircuit, 'broadcastCircuit', broadcastCircuits) } : {}),
      ...(Object.hasOwn(source, 'broadcastEffectStrength') ? { broadcastEffectStrength: validateEffectStrength(source.broadcastEffectStrength) } : {}),
      ...(Object.hasOwn(source, 'accent') ? { accent: validateAccent(source.accent) } : {}),
      ...(source.design === undefined ? {} : { design: validateTwitchAlertDesign(source.design) }),
      updatedAt: new Date().toISOString()
    });
    this.alerts[index] = updated;
    await this.persist();
    return copy(updated);
  }

  async create(input: unknown): Promise<TempestSoundAlertDefinition> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('New Interaction Alert details must be an object.');
    const source = input as Record<string, unknown>;
    const id = typeof source.id === 'string' ? source.id.trim().toLowerCase() : '';
    const cue = typeof source.cue === 'string' && source.cue.trim() ? source.cue.trim().toLowerCase() : id;
    if (this.alerts.some((entry) => entry.id === id)) throw new Error(`Interaction Alert ${id} already exists.`);
    if (this.alerts.some((entry) => entry.cue === cue)) throw new Error(`Warudo cue ${cue} is already assigned to another Interaction Alert.`);
    const durationMs = source.durationMs === undefined ? 10000 : source.durationMs;
    const alert = this.validate({
      schemaVersion: 1,
      id,
      name: source.name,
      description: typeof source.description === 'string' ? source.description.trim() : 'Custom viewer interaction created in Tempest Streaming Studio.',
      enabled: source.enabled === undefined ? true : source.enabled,
      free: true,
      warudoEnabled: source.warudoEnabled === undefined ? false : source.warudoEnabled,
      cue,
      durationMs,
      viewerCooldownMs: source.viewerCooldownMs === undefined ? 60000 : source.viewerCooldownMs,
      globalCooldownMs: source.globalCooldownMs === undefined ? durationMs : source.globalCooldownMs,
      volume: source.volume === undefined ? 0.8 : source.volume,
      audioUri: source.audioUri,
      visualUri: source.visualUri,
      visualDurationMs: source.visualDurationMs === undefined ? 6000 : source.visualDurationMs,
      broadcastAudioSource: source.broadcastAudioSource,
      broadcastVisualSource: source.broadcastVisualSource,
      broadcastEffect: source.broadcastEffect === undefined ? 'spectrum' : source.broadcastEffect,
      broadcastCircuit: source.broadcastCircuit === undefined ? 'all' : source.broadcastCircuit,
      broadcastEffectStrength: source.broadcastEffectStrength === undefined ? 1 : source.broadcastEffectStrength,
      accent: source.accent === undefined ? '#54F2EB' : source.accent,
      design: source.design === undefined ? defaultInteractionAlertDesign() : source.design,
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
    if (!this.alerts[index].custom || bundledIds.has(id)) throw new Error('Bundled Interaction Alerts cannot be deleted. They can be disabled instead.');
    this.alerts.splice(index, 1);
    await this.persist();
    return true;
  }

  prepare(idOrCue: string, request: TempestSoundAlertTriggerRequest): PreparedSoundAlertTrigger {
    const alert = this.find(idOrCue);
    if (!alert) throw new Error(`Sound Alert ${idOrCue} was not found.`);
    if (!alert.enabled && !request.bypassCooldown) throw new Error(`${alert.name} is disabled.`);
    const eventId = request.eventId?.trim() || globalThis.crypto.randomUUID();
    const now = Date.now();
    this.expireReplayIds(now);
    if (this.eventIds.has(eventId)) throw new Error(`Sound Alert event ${eventId} was already handled.`);
    if (!request.bypassCooldown) {
      const globalRemaining = (this.lastAlertTrigger.get(alert.id) || 0) + alert.globalCooldownMs - now;
      if (globalRemaining > 0) throw new Error(`${alert.name} is cooling down for ${Math.ceil(globalRemaining / 1000)} more seconds.`);
      const viewer = request.viewerId || request.viewerName;
      const viewerRemaining = viewer ? (this.lastViewerTrigger.get(`${alert.id}:${viewer}`) || 0) + alert.viewerCooldownMs - now : 0;
      if (viewerRemaining > 0) throw new Error(`${request.viewerName || 'This viewer'} can use ${alert.name} again in ${Math.ceil(viewerRemaining / 1000)} seconds.`);
    }
    const intensity = request.intensity === undefined ? 1 : Number(request.intensity);
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) throw new Error('Sound Alert intensity must be between 0 and 1.');
    return {
      alert,
      eventId,
      request,
      payload: {
        action: 'tempest.sound-alert.performance',
        alertId: alert.id,
        cue: alert.cue,
        warudoEnabled: alert.warudoEnabled,
        name: alert.name,
        durationMs: alert.durationMs,
        visualDurationMs: alert.visualDurationMs,
        intensity,
        eventType: 'sound-alert',
        circuit: alert.broadcastCircuit || 'all',
        accent: alert.accent,
        effect: alert.broadcastEffect || 'spectrum',
        strength: Math.min(1.5, (alert.broadcastEffectStrength || 1) * intensity),
        dedupeId: eventId,
        broadcastAudioSource: alert.broadcastAudioSource,
        broadcastVisualSource: alert.broadcastVisualSource
      }
    };
  }

  commit(prepared: PreparedSoundAlertTrigger): void {
    const now = Date.now();
    this.eventIds.set(prepared.eventId, now);
    this.lastAlertTrigger.set(prepared.alert.id, now);
    const viewer = prepared.request.viewerId || prepared.request.viewerName;
    if (viewer) this.lastViewerTrigger.set(`${prepared.alert.id}:${viewer}`, now);
  }

  private validate(input: TempestSoundAlertDefinition | Record<string, unknown>): TempestSoundAlertDefinition {
    if (input.schemaVersion !== 1) throw new Error('Sound Alert schemaVersion must be 1.');
    if (typeof input.id !== 'string' || !idPattern.test(input.id)) throw new Error('Sound Alert id must be a namespaced identifier.');
    if (typeof input.name !== 'string' || !input.name.trim()) throw new Error('Sound Alert name is required.');
    if (typeof input.cue !== 'string' || !idPattern.test(input.cue)) throw new Error('Sound Alert cue must be a namespaced identifier.');
    if (typeof input.enabled !== 'boolean') throw new Error('Sound Alert enabled must be boolean.');
    const warudoEnabled = input.warudoEnabled === undefined ? true : input.warudoEnabled;
    if (typeof warudoEnabled !== 'boolean') throw new Error('Sound Alert warudoEnabled must be boolean.');
    if (input.free !== true) throw new Error('Studio Sound Alerts must remain free.');
    const volume = Number(input.volume);
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new Error('Sound Alert volume must be between 0 and 1.');
    return {
      ...input,
      schemaVersion: 1,
      id: input.id,
      name: input.name.trim(),
      cue: input.cue,
      enabled: input.enabled,
      free: true,
      warudoEnabled,
      durationMs: boundedInteger(input.durationMs, 'durationMs', 1000, 60000),
      viewerCooldownMs: boundedInteger(input.viewerCooldownMs, 'viewerCooldownMs', 0, 24 * 60 * 60 * 1000),
      globalCooldownMs: boundedInteger(input.globalCooldownMs, 'globalCooldownMs', 0, 24 * 60 * 60 * 1000),
      volume,
      audioUri: validateAudioUri(input.audioUri),
      visualUri: validateVisualUri(input.visualUri),
      visualDurationMs: boundedInteger(input.visualDurationMs ?? 6000, 'visualDurationMs', 1000, 60000),
      broadcastAudioSource: validateSourceName(input.broadcastAudioSource, 'broadcastAudioSource'),
      broadcastVisualSource: validateSourceName(input.broadcastVisualSource, 'broadcastVisualSource'),
      broadcastEffect: validateChoice(input.broadcastEffect, 'broadcastEffect', broadcastEffects),
      broadcastCircuit: validateChoice(input.broadcastCircuit, 'broadcastCircuit', broadcastCircuits),
      broadcastEffectStrength: validateEffectStrength(input.broadcastEffectStrength),
      accent: validateAccent(input.accent),
      design: validateTwitchAlertDesign(input.design === undefined ? defaultInteractionAlertDesign() : input.design)
    } as TempestSoundAlertDefinition;
  }

  private expireReplayIds(now: number): void {
    for (const [id, timestamp] of this.eventIds) if (now - timestamp > replayWindowMs) this.eventIds.delete(id);
  }

  private async persist(): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    const document: SoundAlertDocument = { schemaVersion: 1, alerts: this.alerts, updatedAt: new Date().toISOString() };
    const temporaryPath = `${this.documentPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, this.documentPath);
  }
}
