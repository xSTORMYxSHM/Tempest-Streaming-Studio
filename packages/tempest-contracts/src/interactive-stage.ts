export const INTERACTIVE_STAGE_SCHEMA_VERSION = 1 as const;

export const interactiveStageObjectKinds = [
  'sprite',
  'avatar',
  'pet',
  'effect',
  'meter',
  'game-object',
  'text'
] as const;

export const interactiveStageAnchors = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right'
] as const;

export type InteractiveStageObjectKind = typeof interactiveStageObjectKinds[number];
export type InteractiveStageAnchor = typeof interactiveStageAnchors[number];
export type InteractiveStageOrientation = 'horizontal' | 'vertical';
export type InteractiveStageProperty = string | number | boolean;

export interface InteractiveStageProtectedZone {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  enabled: boolean;
  orientations: InteractiveStageOrientation[];
}

export interface InteractiveStagePlatform {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  collision: 'one-way' | 'solid';
  enabled: boolean;
  orientations: InteractiveStageOrientation[];
}

export const interactiveStageInteractableKinds = [
  'toy',
  'switch',
  'pickup',
  'treasure',
  'pet-station',
  'pressure-plate',
  'hazard',
  'checkpoint',
  'door',
  'push-block'
] as const;

export type InteractiveStageInteractableKind = typeof interactiveStageInteractableKinds[number];

export interface InteractiveStageInteractable {
  id: string;
  name: string;
  kind: InteractiveStageInteractableKind;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  glyph: string;
  linkId?: string;
  enabled: boolean;
  orientations: InteractiveStageOrientation[];
}

export interface InteractiveStageWorldObjectState {
  active?: boolean;
  collectedUntil?: string;
  x?: number;
  y?: number;
}

export interface InteractiveStageWorldRuntimeState {
  revision: number;
  objects: Record<string, InteractiveStageWorldObjectState>;
}

export interface InteractiveStageWorldMap {
  enabled: boolean;
  wanderEnabled: boolean;
  jumpEnabled: boolean;
  floorY: number;
  speed: number;
  gravity: number;
  jumpStrength: number;
  platforms: InteractiveStagePlatform[];
  interactables: InteractiveStageInteractable[];
}

export interface InteractiveStageOwner {
  platform: 'twitch' | 'kick' | 'studio';
  userId: string;
  displayName?: string;
}

export interface InteractiveStagePlacement {
  x: number;
  y: number;
  scale: number;
  anchor: InteractiveStageAnchor;
  layer: number;
}

export interface InteractiveStageObject {
  id: string;
  kind: InteractiveStageObjectKind;
  owner?: InteractiveStageOwner;
  sourceEventId?: string;
  dedupeKey?: string;
  assetId?: string;
  state: string;
  placement: InteractiveStagePlacement;
  scenePlacements?: Record<string, InteractiveStagePlacement>;
  properties: Record<string, InteractiveStageProperty>;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface InteractiveStageState {
  schemaVersion: typeof INTERACTIVE_STAGE_SCHEMA_VERSION;
  revision: number;
  updatedAt: string;
  objects: InteractiveStageObject[];
  protectedZones?: InteractiveStageProtectedZone[];
  collisionAvoidance?: boolean;
  worldMap?: InteractiveStageWorldMap;
  worldState?: InteractiveStageWorldRuntimeState;
}

export interface InteractiveStageObjectInput {
  id?: string;
  kind?: InteractiveStageObjectKind;
  owner?: InteractiveStageOwner;
  sourceEventId?: string;
  dedupeKey?: string;
  assetId?: string;
  state?: string;
  placement?: Partial<InteractiveStagePlacement>;
  scenePlacements?: Record<string, Partial<InteractiveStagePlacement>>;
  properties?: Record<string, InteractiveStageProperty>;
  createdAt?: string;
  expiresAt?: string;
  lifetimeMs?: number;
}

export interface InteractiveStageValidationResult<T> {
  ok: boolean;
  errors: string[];
  value?: T;
}

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const statePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function finiteNumber(value: unknown, fallback: number, minimum: number, maximum: number, label: string, errors: string[]): number {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    errors.push(`${label} must be between ${minimum} and ${maximum}.`);
    return fallback;
  }
  return number;
}

function timestamp(value: unknown, label: string, fallback: string, errors: string[]): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    errors.push(`${label} must be an ISO timestamp.`);
    return fallback;
  }
  return new Date(value).toISOString();
}

export function validateInteractiveStagePlacement(
  input: unknown,
  fallback: InteractiveStagePlacement = { x: 0.5, y: 0.5, scale: 1, anchor: 'center', layer: 0 }
): InteractiveStageValidationResult<InteractiveStagePlacement> {
  const errors: string[] = [];
  if (input !== undefined && !isRecord(input)) return { ok: false, errors: ['placement must be an object.'] };
  const source = isRecord(input) ? input : {};
  const anchor = source.anchor === undefined ? fallback.anchor : String(source.anchor);
  if (!interactiveStageAnchors.includes(anchor as InteractiveStageAnchor)) errors.push(`placement.anchor must be one of: ${interactiveStageAnchors.join(', ')}.`);
  const layer = finiteNumber(source.layer, fallback.layer, -100, 100, 'placement.layer', errors);
  if (!Number.isInteger(layer)) errors.push('placement.layer must be an integer.');
  const value: InteractiveStagePlacement = {
    x: finiteNumber(source.x, fallback.x, 0, 1, 'placement.x', errors),
    y: finiteNumber(source.y, fallback.y, 0, 1, 'placement.y', errors),
    scale: finiteNumber(source.scale, fallback.scale, 0.05, 5, 'placement.scale', errors),
    anchor: interactiveStageAnchors.includes(anchor as InteractiveStageAnchor) ? anchor as InteractiveStageAnchor : fallback.anchor,
    layer
  };
  return errors.length ? { ok: false, errors } : { ok: true, errors, value };
}

export function validateInteractiveStageObjectInput(input: unknown, now = new Date()): InteractiveStageValidationResult<InteractiveStageObject> {
  if (!isRecord(input)) return { ok: false, errors: ['Stage object must be an object.'] };
  const errors: string[] = [];
  const id = input.id === undefined ? globalThis.crypto.randomUUID() : String(input.id);
  if (!identifierPattern.test(id)) errors.push('id must be 1-128 letters, numbers, dots, underscores, colons, or hyphens.');
  const kind = input.kind === undefined ? 'text' : String(input.kind);
  if (!interactiveStageObjectKinds.includes(kind as InteractiveStageObjectKind)) errors.push(`kind must be one of: ${interactiveStageObjectKinds.join(', ')}.`);
  const state = input.state === undefined ? 'idle' : String(input.state);
  if (!statePattern.test(state)) errors.push('state must be a short identifier.');
  const placement = validateInteractiveStagePlacement(input.placement);
  errors.push(...placement.errors);

  let owner: InteractiveStageOwner | undefined;
  if (input.owner !== undefined) {
    if (!isRecord(input.owner)) errors.push('owner must be an object.');
    else {
      const platform = String(input.owner.platform || '');
      const userId = String(input.owner.userId || '').trim();
      if (!['twitch', 'kick', 'studio'].includes(platform)) errors.push('owner.platform must be twitch, kick, or studio.');
      if (!userId || userId.length > 128) errors.push('owner.userId must be 1-128 characters.');
      const displayName = input.owner.displayName === undefined ? undefined : String(input.owner.displayName).trim().slice(0, 80);
      if (['twitch', 'kick', 'studio'].includes(platform) && userId) owner = { platform: platform as InteractiveStageOwner['platform'], userId, ...(displayName ? { displayName } : {}) };
    }
  }

  const properties: Record<string, InteractiveStageProperty> = {};
  if (input.properties !== undefined && !isRecord(input.properties)) errors.push('properties must be an object.');
  else if (isRecord(input.properties)) {
    const entries = Object.entries(input.properties);
    if (entries.length > 32) errors.push('properties cannot contain more than 32 entries.');
    for (const [key, value] of entries) {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key)) errors.push(`properties.${key} has an invalid key.`);
      else if (!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) errors.push(`properties.${key} must be a finite string, number, or boolean.`);
      else if (typeof value === 'string' && value.length > (key === 'actorMotionClips' ? 6_000 : 500)) errors.push(`properties.${key} cannot exceed ${key === 'actorMotionClips' ? '6,000' : '500'} characters.`);
      else properties[key] = value as InteractiveStageProperty;
    }
  }

  const createdAt = timestamp(input.createdAt, 'createdAt', now.toISOString(), errors);
  let expiresAt: string | undefined;
  if (input.expiresAt !== undefined && input.lifetimeMs !== undefined) errors.push('Use expiresAt or lifetimeMs, not both.');
  if (input.lifetimeMs !== undefined) {
    const lifetimeMs = finiteNumber(input.lifetimeMs, 10_000, 250, 24 * 60 * 60 * 1000, 'lifetimeMs', errors);
    expiresAt = new Date(now.getTime() + lifetimeMs).toISOString();
  } else if (input.expiresAt !== undefined) expiresAt = timestamp(input.expiresAt, 'expiresAt', now.toISOString(), errors);
  if (expiresAt && Date.parse(expiresAt) <= now.getTime()) errors.push('expiresAt must be in the future.');

  const scenePlacements: Record<string, InteractiveStagePlacement> = {};
  if (input.scenePlacements !== undefined && !isRecord(input.scenePlacements)) errors.push('scenePlacements must be an object.');
  else if (isRecord(input.scenePlacements)) {
    const entries = Object.entries(input.scenePlacements);
    if (entries.length > 32) errors.push('scenePlacements cannot contain more than 32 scenes.');
    for (const [scene, value] of entries) {
      if (!scene.trim() || scene.length > 120) { errors.push('scenePlacements contains an invalid scene name.'); continue; }
      const validated = validateInteractiveStagePlacement(value, placement.value || { x: 0.5, y: 0.5, scale: 1, anchor: 'center', layer: 0 });
      errors.push(...validated.errors.map((error) => `${scene}: ${error}`));
      if (validated.value) scenePlacements[scene] = validated.value;
    }
  }

  for (const key of ['sourceEventId', 'dedupeKey', 'assetId'] as const) {
    const value = input[key];
    if (value !== undefined && (typeof value !== 'string' || !value.trim() || value.length > 160)) errors.push(`${key} must be 1-160 characters.`);
  }
  if (errors.length || !placement.value) return { ok: false, errors };
  return {
    ok: true,
    errors,
    value: {
      id,
      kind: kind as InteractiveStageObjectKind,
      ...(owner ? { owner } : {}),
      ...(typeof input.sourceEventId === 'string' ? { sourceEventId: input.sourceEventId.trim() } : {}),
      ...(typeof input.dedupeKey === 'string' ? { dedupeKey: input.dedupeKey.trim() } : {}),
      ...(typeof input.assetId === 'string' ? { assetId: input.assetId.trim() } : {}),
      state,
      placement: placement.value,
      ...(Object.keys(scenePlacements).length ? { scenePlacements } : {}),
      properties,
      createdAt,
      updatedAt: now.toISOString(),
      ...(expiresAt ? { expiresAt } : {})
    }
  };
}
