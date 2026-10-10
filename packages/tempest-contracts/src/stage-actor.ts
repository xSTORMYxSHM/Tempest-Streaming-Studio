export const STAGE_ACTOR_PACK_SCHEMA_VERSION = 1 as const;
export const STAGE_ACTOR_RIG_SCHEMA_VERSION = 2 as const;
export const STAGE_ACTOR_ATLAS_SCHEMA_VERSION = 3 as const;
export const stageActorPackSchemaVersions = [STAGE_ACTOR_PACK_SCHEMA_VERSION, STAGE_ACTOR_RIG_SCHEMA_VERSION, STAGE_ACTOR_ATLAS_SCHEMA_VERSION] as const;
export type StageActorPackSchemaVersion = typeof stageActorPackSchemaVersions[number];

export const stageActorCoreStates = [
  'idle', 'walk', 'jump', 'sit', 'sleep', 'celebrate', 'emote', 'attack', 'damaged', 'defeated'
] as const;

export type StageActorCoreState = typeof stageActorCoreStates[number];

export interface StageActorPoint {
  x: number;
  y: number;
}

export interface StageActorCollider extends StageActorPoint {
  width: number;
  height: number;
}

export interface StageActorAnimation {
  asset: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  row?: number;
  startFrame?: number;
  fps: number;
  loop: boolean;
  returnsToIdle: boolean;
}

export interface StageActorSpriteAtlas {
  asset: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  layout: 'rows';
}

export interface StageActorColorOption {
  id: string;
  name: string;
  color: string;
}

export interface StageActorColorSlot {
  label: string;
  defaultOptionId: string;
  options: StageActorColorOption[];
}

export interface StageActorAppearance {
  colorSlots: {
    primary: StageActorColorSlot;
    secondary: StageActorColorSlot;
  };
  masks: Record<string, { primary: string; secondary: string }>;
}

export interface StageActorRigBone {
  id: string;
  parent?: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  length: number;
}

export interface StageActorRigLayer {
  id: string;
  bone: string;
  asset: string;
  order: number;
  pivot: StageActorPoint;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  flipX?: boolean;
  templatePart?: string;
  tintSlot?: 'primary' | 'secondary';
  source?: { x: number; y: number; width: number; height: number };
  states?: string[];
  deform?: {
    axis: 'x' | 'y';
    segments: number;
    amount: number;
    speed: number;
    phase: number;
    anchor: 'start' | 'end';
  };
}

export interface StageActorRigTemplate {
  id: string;
  version: string;
  textureAsset: string;
  guideAsset?: string;
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  boundsPolicy: 'source-rect';
}

export interface StageActorRigAttachment {
  id: string;
  bone: string;
  x: number;
  y: number;
  rotation: number;
}

export interface StageActorRigKeyframe {
  timeMs: number;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
  interpolation: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'step';
}

export interface StageActorRigTrack {
  target: string;
  keyframes: StageActorRigKeyframe[];
}

export interface StageActorRigClip {
  durationMs: number;
  loop: boolean;
  returnsToIdle: boolean;
  tracks: StageActorRigTrack[];
}

export interface StageActorRig {
  canvas: { width: number; height: number };
  template?: StageActorRigTemplate;
  bones: StageActorRigBone[];
  layers: StageActorRigLayer[];
  attachments: StageActorRigAttachment[];
  clips: Record<string, StageActorRigClip>;
}

export interface StageActorPackManifest {
  schemaVersion: StageActorPackSchemaVersion;
  id: string;
  name: string;
  version: string;
  creator?: string;
  license?: string;
  description?: string;
  thumbnail?: string;
  preferredRenderer: 'sprite' | 'rig';
  defaultScale: number;
  pivot: StageActorPoint;
  nameplate: StageActorPoint;
  collider: StageActorCollider;
  atlas?: StageActorSpriteAtlas;
  animations: Record<string, StageActorAnimation>;
  appearance?: StageActorAppearance;
  rig?: StageActorRig;
  createdAt: string;
  updatedAt: string;
}

export interface StageActorPackValidationResult {
  ok: boolean;
  errors: string[];
  value?: StageActorPackManifest;
}

const packIdPattern = /^[a-z0-9][a-z0-9-]{1,63}$/;
const statePattern = /^[a-z][a-z0-9.-]{0,47}$/;
const assetPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.(?:png|webp)$/i;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const colorPattern = /^#[0-9A-Fa-f]{6}$/;
const optionIdPattern = /^[a-z0-9][a-z0-9-]{0,47}$/;
const rigIdPattern = /^[a-z][a-z0-9-]{0,47}$/;
const rigInterpolations = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'step'] as const;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function number(value: unknown, fallback: number, minimum: number, maximum: number, label: string, errors: string[], integer = false): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum || (integer && !Number.isInteger(parsed))) {
    errors.push(`${label} must be ${integer ? 'an integer ' : ''}between ${minimum} and ${maximum}.`);
    return fallback;
  }
  return parsed;
}

function shortText(value: unknown, fallback: string, maximum: number, label: string, errors: string[], required = false): string {
  const parsed = value === undefined ? fallback : String(value).trim();
  if ((required && !parsed) || parsed.length > maximum) errors.push(`${label} must contain ${required ? `1-${maximum}` : `at most ${maximum}`} characters.`);
  return parsed.slice(0, maximum);
}

function point(value: unknown, fallback: StageActorPoint, label: string, errors: string[]): StageActorPoint {
  if (value !== undefined && !record(value)) errors.push(`${label} must be an object.`);
  const source = record(value) ? value : {};
  return {
    x: number(source.x, fallback.x, 0, 1, `${label}.x`, errors),
    y: number(source.y, fallback.y, 0, 1, `${label}.y`, errors)
  };
}

function timestamp(value: unknown, fallback: string, label: string, errors: string[]): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    errors.push(`${label} must be an ISO timestamp.`);
    return fallback;
  }
  return new Date(value).toISOString();
}

function colorSlot(value: unknown, label: string, errors: string[]): StageActorColorSlot | undefined {
  if (!record(value)) { errors.push(`${label} must be an object.`); return undefined; }
  const slotLabel = shortText(value.label, '', 40, `${label}.label`, errors, true);
  const defaultOptionId = String(value.defaultOptionId || '').trim();
  const rawOptions = Array.isArray(value.options) ? value.options : [];
  if (rawOptions.length < 1 || rawOptions.length > 24) errors.push(`${label}.options must contain 1-24 colors.`);
  const seen = new Set<string>();
  const options: StageActorColorOption[] = [];
  for (const [index, raw] of rawOptions.entries()) {
    if (!record(raw)) { errors.push(`${label}.options.${index} must be an object.`); continue; }
    const id = String(raw.id || '').trim();
    const name = shortText(raw.name, '', 40, `${label}.options.${index}.name`, errors, true);
    const color = String(raw.color || '').trim().toUpperCase();
    if (!optionIdPattern.test(id) || seen.has(id)) errors.push(`${label}.options.${index}.id is invalid or duplicated.`);
    if (!colorPattern.test(color)) errors.push(`${label}.options.${index}.color must be a six-digit hex color.`);
    seen.add(id);
    options.push({ id, name, color });
  }
  if (!seen.has(defaultOptionId)) errors.push(`${label}.defaultOptionId must reference one of its options.`);
  return { label: slotLabel, defaultOptionId, options };
}

function rigTransformNumber(value: unknown, fallback: number, label: string, errors: string[]): number {
  return number(value, fallback, -4096, 4096, label, errors);
}

function validateStageActorRig(value: unknown, errors: string[]): StageActorRig | undefined {
  if (!record(value)) { errors.push('rig must be an object for schemaVersion 2.'); return undefined; }
  const canvasSource = record(value.canvas) ? value.canvas : {};
  if (!record(value.canvas)) errors.push('rig.canvas must be an object.');
  const canvas = {
    width: number(canvasSource.width, 512, 16, 4096, 'rig.canvas.width', errors, true),
    height: number(canvasSource.height, 512, 16, 4096, 'rig.canvas.height', errors, true)
  };

  let template: StageActorRigTemplate | undefined;
  if (value.template !== undefined) {
    if (!record(value.template)) errors.push('rig.template must be an object.');
    else {
      const id = String(value.template.id || '').trim();
      const version = String(value.template.version || '').trim();
      const textureAsset = String(value.template.textureAsset || '').trim();
      const guideAsset = value.template.guideAsset === undefined ? '' : String(value.template.guideAsset).trim();
      if (!rigIdPattern.test(id)) errors.push('rig.template.id is invalid.');
      if (!versionPattern.test(version)) errors.push('rig.template.version must be semantic version text.');
      if (!assetPattern.test(textureAsset)) errors.push('rig.template.textureAsset must be a local PNG or WebP filename without folders.');
      if (guideAsset && !assetPattern.test(guideAsset)) errors.push('rig.template.guideAsset must be a local PNG or WebP filename without folders.');
      const width = number(value.template.width, 2048, 16, 4096, 'rig.template.width', errors, true);
      const height = number(value.template.height, 2048, 16, 4096, 'rig.template.height', errors, true);
      const cellWidth = number(value.template.cellWidth, 512, 8, 2048, 'rig.template.cellWidth', errors, true);
      const cellHeight = number(value.template.cellHeight, 512, 8, 2048, 'rig.template.cellHeight', errors, true);
      if (width % cellWidth !== 0 || height % cellHeight !== 0) errors.push('rig.template cells must divide the template dimensions exactly.');
      if (value.template.boundsPolicy !== 'source-rect') errors.push('rig.template.boundsPolicy must be source-rect.');
      template = { id, version, textureAsset, ...(guideAsset ? { guideAsset } : {}), width, height, cellWidth, cellHeight, boundsPolicy: 'source-rect' };
    }
  }

  const rawBones = Array.isArray(value.bones) ? value.bones : [];
  if (rawBones.length < 1 || rawBones.length > 64) errors.push('rig.bones must contain 1-64 bones.');
  const bones: StageActorRigBone[] = [];
  const boneIds = new Set<string>();
  for (const [index, raw] of rawBones.entries()) {
    if (!record(raw)) { errors.push(`rig.bones.${index} must be an object.`); continue; }
    const id = String(raw.id || '').trim();
    const parent = raw.parent === undefined ? '' : String(raw.parent).trim();
    if (!rigIdPattern.test(id) || boneIds.has(id)) errors.push(`rig.bones.${index}.id is invalid or duplicated.`);
    boneIds.add(id);
    bones.push({
      id,
      ...(parent ? { parent } : {}),
      x: rigTransformNumber(raw.x, 0, `rig.bones.${index}.x`, errors),
      y: rigTransformNumber(raw.y, 0, `rig.bones.${index}.y`, errors),
      rotation: number(raw.rotation, 0, -360, 360, `rig.bones.${index}.rotation`, errors),
      scaleX: number(raw.scaleX, 1, 0.05, 20, `rig.bones.${index}.scaleX`, errors),
      scaleY: number(raw.scaleY, 1, 0.05, 20, `rig.bones.${index}.scaleY`, errors),
      length: number(raw.length, 0, 0, 4096, `rig.bones.${index}.length`, errors)
    });
  }
  if (bones.filter((bone) => !bone.parent).length !== 1) errors.push('rig.bones must contain exactly one root bone.');
  const parents = new Map(bones.map((bone) => [bone.id, bone.parent]));
  for (const bone of bones) {
    if (bone.parent && (!boneIds.has(bone.parent) || bone.parent === bone.id)) errors.push(`rig bone ${bone.id} has an invalid parent.`);
    const visited = new Set<string>([bone.id]);
    let parent = bone.parent;
    while (parent) {
      if (visited.has(parent)) { errors.push(`rig bone ${bone.id} has a cyclic parent chain.`); break; }
      visited.add(parent);
      parent = parents.get(parent);
    }
  }

  const rawLayers = Array.isArray(value.layers) ? value.layers : [];
  if (rawLayers.length < 1 || rawLayers.length > 64) errors.push('rig.layers must contain 1-64 drawable layers.');
  const layers: StageActorRigLayer[] = [];
  const layerIds = new Set<string>();
  for (const [index, raw] of rawLayers.entries()) {
    if (!record(raw)) { errors.push(`rig.layers.${index} must be an object.`); continue; }
    const id = String(raw.id || '').trim();
    const bone = String(raw.bone || '').trim();
    const asset = String(raw.asset || '').trim();
    if (!rigIdPattern.test(id) || layerIds.has(id)) errors.push(`rig.layers.${index}.id is invalid or duplicated.`);
    if (!boneIds.has(bone)) errors.push(`rig.layers.${index}.bone must reference a rig bone.`);
    if (!assetPattern.test(asset)) errors.push(`rig.layers.${index}.asset must be a local PNG or WebP filename without folders.`);
    const tintSlot = raw.tintSlot === undefined ? undefined : String(raw.tintSlot);
    if (tintSlot !== undefined && tintSlot !== 'primary' && tintSlot !== 'secondary') errors.push(`rig.layers.${index}.tintSlot must be primary or secondary.`);
    if (raw.flipX !== undefined && typeof raw.flipX !== 'boolean') errors.push(`rig.layers.${index}.flipX must be a boolean.`);
    const templatePart = raw.templatePart === undefined ? '' : String(raw.templatePart).trim();
    if (templatePart && !rigIdPattern.test(templatePart)) errors.push(`rig.layers.${index}.templatePart is invalid.`);
    const rawStates = raw.states === undefined ? undefined : Array.isArray(raw.states) ? raw.states : [];
    if (raw.states !== undefined && !Array.isArray(raw.states)) errors.push(`rig.layers.${index}.states must be an array.`);
    if (rawStates && (rawStates.length < 1 || rawStates.length > 48)) errors.push(`rig.layers.${index}.states must contain 1-48 state names.`);
    const states = rawStates?.map((state) => String(state).trim()) || [];
    if (states.some((state) => !statePattern.test(state)) || new Set(states).size !== states.length) errors.push(`rig.layers.${index}.states contains an invalid or duplicated state name.`);
    let deform: StageActorRigLayer['deform'];
    if (raw.deform !== undefined) {
      if (!record(raw.deform)) errors.push(`rig.layers.${index}.deform must be an object.`);
      else {
        const axis = String(raw.deform.axis || 'y');
        if (axis !== 'x' && axis !== 'y') errors.push(`rig.layers.${index}.deform.axis must be x or y.`);
        const anchor = String(raw.deform.anchor || 'start');
        if (anchor !== 'start' && anchor !== 'end') errors.push(`rig.layers.${index}.deform.anchor must be start or end.`);
        deform = {
          axis: axis === 'x' ? 'x' : 'y',
          segments: number(raw.deform.segments, 8, 2, 24, `rig.layers.${index}.deform.segments`, errors, true),
          amount: number(raw.deform.amount, 0, 0, 64, `rig.layers.${index}.deform.amount`, errors),
          speed: number(raw.deform.speed, 1, 0, 12, `rig.layers.${index}.deform.speed`, errors),
          phase: number(raw.deform.phase, 0, -12.57, 12.57, `rig.layers.${index}.deform.phase`, errors),
          anchor: anchor === 'end' ? 'end' : 'start'
        };
      }
    }
    layerIds.add(id);
    layers.push({
      id, bone, asset,
      order: number(raw.order, index, -100, 100, `rig.layers.${index}.order`, errors, true),
      pivot: point(raw.pivot, { x: 0.5, y: 0.5 }, `rig.layers.${index}.pivot`, errors),
      x: rigTransformNumber(raw.x, 0, `rig.layers.${index}.x`, errors),
      y: rigTransformNumber(raw.y, 0, `rig.layers.${index}.y`, errors),
      rotation: number(raw.rotation, 0, -360, 360, `rig.layers.${index}.rotation`, errors),
      scaleX: number(raw.scaleX, 1, 0.01, 20, `rig.layers.${index}.scaleX`, errors),
      scaleY: number(raw.scaleY, 1, 0.01, 20, `rig.layers.${index}.scaleY`, errors),
      opacity: number(raw.opacity, 1, 0, 1, `rig.layers.${index}.opacity`, errors),
      ...(raw.flipX === true ? { flipX: true } : {}),
      ...(templatePart ? { templatePart } : {}),
      ...(tintSlot === 'primary' || tintSlot === 'secondary' ? { tintSlot } : {}),
      ...(states.length ? { states } : {}),
      ...(deform ? { deform } : {}),
      ...(record(raw.source) ? { source: {
        x: number(raw.source.x, 0, 0, 8192, `rig.layers.${index}.source.x`, errors, true),
        y: number(raw.source.y, 0, 0, 8192, `rig.layers.${index}.source.y`, errors, true),
        width: number(raw.source.width, 1, 1, 8192, `rig.layers.${index}.source.width`, errors, true),
        height: number(raw.source.height, 1, 1, 8192, `rig.layers.${index}.source.height`, errors, true)
      } } : {})
    });
    if (raw.source !== undefined && !record(raw.source)) errors.push(`rig.layers.${index}.source must be an object.`);
  }

  if (template) {
    const templateParts = new Set<string>();
    for (const [index, layer] of layers.entries()) {
      if (layer.asset !== template.textureAsset) errors.push(`rig.layers.${index}.asset must use the template texture.`);
      if (!layer.templatePart || templateParts.has(layer.templatePart)) errors.push(`rig.layers.${index}.templatePart is required and must be unique for a template rig.`);
      if (layer.templatePart) templateParts.add(layer.templatePart);
      if (!layer.source) { errors.push(`rig.layers.${index}.source is required for a template rig.`); continue; }
      if (layer.source.x % template.cellWidth !== 0 || layer.source.y % template.cellHeight !== 0 || layer.source.width !== template.cellWidth || layer.source.height !== template.cellHeight) {
        errors.push(`rig.layers.${index}.source must occupy one aligned template cell.`);
      }
      if (layer.source.x + layer.source.width > template.width || layer.source.y + layer.source.height > template.height) errors.push(`rig.layers.${index}.source exceeds the template texture bounds.`);
    }
  }

  const rawAttachments = value.attachments === undefined ? [] : Array.isArray(value.attachments) ? value.attachments : [];
  if (value.attachments !== undefined && !Array.isArray(value.attachments)) errors.push('rig.attachments must be an array.');
  if (rawAttachments.length > 32) errors.push('rig.attachments cannot contain more than 32 entries.');
  const attachments: StageActorRigAttachment[] = [];
  const attachmentIds = new Set<string>();
  for (const [index, raw] of rawAttachments.entries()) {
    if (!record(raw)) { errors.push(`rig.attachments.${index} must be an object.`); continue; }
    const id = String(raw.id || '').trim();
    const bone = String(raw.bone || '').trim();
    if (!rigIdPattern.test(id) || attachmentIds.has(id)) errors.push(`rig.attachments.${index}.id is invalid or duplicated.`);
    if (!boneIds.has(bone)) errors.push(`rig.attachments.${index}.bone must reference a rig bone.`);
    attachmentIds.add(id);
    attachments.push({
      id, bone,
      x: rigTransformNumber(raw.x, 0, `rig.attachments.${index}.x`, errors),
      y: rigTransformNumber(raw.y, 0, `rig.attachments.${index}.y`, errors),
      rotation: number(raw.rotation, 0, -360, 360, `rig.attachments.${index}.rotation`, errors)
    });
  }

  const clips: Record<string, StageActorRigClip> = {};
  if (!record(value.clips)) errors.push('rig.clips must be an object.');
  else {
    const clipEntries = Object.entries(value.clips);
    if (clipEntries.length < 1 || clipEntries.length > 48) errors.push('rig.clips must contain 1-48 clips.');
    for (const [state, raw] of clipEntries) {
      if (!statePattern.test(state)) { errors.push(`rig.clips.${state} has an invalid state name.`); continue; }
      if (!record(raw)) { errors.push(`rig.clips.${state} must be an object.`); continue; }
      const durationMs = number(raw.durationMs, 1000, 16, 60_000, `rig.clips.${state}.durationMs`, errors, true);
      const rawTracks = Array.isArray(raw.tracks) ? raw.tracks : [];
      if (rawTracks.length < 1 || rawTracks.length > 128) errors.push(`rig.clips.${state}.tracks must contain 1-128 tracks.`);
      const tracks: StageActorRigTrack[] = [];
      const trackTargets = new Set<string>();
      for (const [trackIndex, rawTrack] of rawTracks.entries()) {
        if (!record(rawTrack)) { errors.push(`rig.clips.${state}.tracks.${trackIndex} must be an object.`); continue; }
        const target = String(rawTrack.target || '').trim();
        if ((!boneIds.has(target) && !layerIds.has(target)) || trackTargets.has(target)) errors.push(`rig.clips.${state}.tracks.${trackIndex}.target is invalid or duplicated.`);
        trackTargets.add(target);
        const rawKeyframes = Array.isArray(rawTrack.keyframes) ? rawTrack.keyframes : [];
        if (rawKeyframes.length < 1 || rawKeyframes.length > 240) errors.push(`rig.clips.${state}.tracks.${trackIndex}.keyframes must contain 1-240 entries.`);
        const keyframes: StageActorRigKeyframe[] = [];
        let previousTime = -1;
        for (const [keyframeIndex, rawKeyframe] of rawKeyframes.entries()) {
          if (!record(rawKeyframe)) { errors.push(`rig.clips.${state}.tracks.${trackIndex}.keyframes.${keyframeIndex} must be an object.`); continue; }
          const timeMs = number(rawKeyframe.timeMs, 0, 0, durationMs, `rig.clips.${state}.tracks.${trackIndex}.keyframes.${keyframeIndex}.timeMs`, errors, true);
          if (timeMs <= previousTime) errors.push(`rig.clips.${state}.tracks.${trackIndex}.keyframes must be strictly time ordered.`);
          previousTime = timeMs;
          const interpolation = rigInterpolations.includes(rawKeyframe.interpolation as typeof rigInterpolations[number]) ? rawKeyframe.interpolation as StageActorRigKeyframe['interpolation'] : 'linear';
          if (rawKeyframe.interpolation !== undefined && interpolation !== rawKeyframe.interpolation) errors.push(`rig.clips.${state}.tracks.${trackIndex}.keyframes.${keyframeIndex}.interpolation is invalid.`);
          keyframes.push({
            timeMs,
            ...(rawKeyframe.x === undefined ? {} : { x: rigTransformNumber(rawKeyframe.x, 0, `rig keyframe x`, errors) }),
            ...(rawKeyframe.y === undefined ? {} : { y: rigTransformNumber(rawKeyframe.y, 0, `rig keyframe y`, errors) }),
            ...(rawKeyframe.rotation === undefined ? {} : { rotation: number(rawKeyframe.rotation, 0, -720, 720, 'rig keyframe rotation', errors) }),
            ...(rawKeyframe.scaleX === undefined ? {} : { scaleX: number(rawKeyframe.scaleX, 1, 0.05, 20, 'rig keyframe scaleX', errors) }),
            ...(rawKeyframe.scaleY === undefined ? {} : { scaleY: number(rawKeyframe.scaleY, 1, 0.05, 20, 'rig keyframe scaleY', errors) }),
            ...(rawKeyframe.opacity === undefined ? {} : { opacity: number(rawKeyframe.opacity, 1, 0, 1, 'rig keyframe opacity', errors) }),
            interpolation
          });
        }
        tracks.push({ target, keyframes });
      }
      clips[state] = { durationMs, loop: raw.loop === true, returnsToIdle: raw.returnsToIdle !== false, tracks };
    }
  }
  if (!clips.idle) errors.push('rig.clips.idle is required.');
  return { canvas, ...(template ? { template } : {}), bones, layers, attachments, clips };
}

export function validateStageActorPackManifest(input: unknown, now = new Date()): StageActorPackValidationResult {
  if (!record(input)) return { ok: false, errors: ['Stage Actor pack manifest must be an object.'] };
  const errors: string[] = [];
  const schemaVersion = Number(input.schemaVersion) as StageActorPackSchemaVersion;
  if (!stageActorPackSchemaVersions.includes(schemaVersion)) errors.push(`schemaVersion must be one of: ${stageActorPackSchemaVersions.join(', ')}.`);
  const id = String(input.id || '').trim();
  if (!packIdPattern.test(id)) errors.push('id must be 2-64 lowercase letters, numbers, or hyphens.');
  const name = shortText(input.name, '', 80, 'name', errors, true);
  const version = shortText(input.version, '1.0.0', 40, 'version', errors, true);
  if (!versionPattern.test(version)) errors.push('version must use semantic versioning, such as 1.0.0.');
  const creator = shortText(input.creator, '', 80, 'creator', errors);
  const license = shortText(input.license, '', 120, 'license', errors);
  const description = shortText(input.description, '', 500, 'description', errors);
  const thumbnail = input.thumbnail === undefined ? '' : String(input.thumbnail).trim();
  if (thumbnail && !assetPattern.test(thumbnail)) errors.push('thumbnail must be a local PNG or WebP filename without folders.');
  const preferredRenderer = input.preferredRenderer === undefined ? 'sprite' : String(input.preferredRenderer);
  if (preferredRenderer !== 'sprite' && preferredRenderer !== 'rig') errors.push('preferredRenderer must be sprite or rig.');
  const defaultScale = number(input.defaultScale, 1, 0.1, 5, 'defaultScale', errors);
  const pivot = point(input.pivot, { x: 0.5, y: 1 }, 'pivot', errors);
  const nameplate = point(input.nameplate, { x: 0.5, y: 0 }, 'nameplate', errors);
  if (input.collider !== undefined && !record(input.collider)) errors.push('collider must be an object.');
  const colliderSource = record(input.collider) ? input.collider : {};
  const collider: StageActorCollider = {
    ...point(colliderSource, { x: 0.5, y: 0.55 }, 'collider', errors),
    width: number(colliderSource.width, 0.7, 0.05, 1, 'collider.width', errors),
    height: number(colliderSource.height, 0.85, 0.05, 1, 'collider.height', errors)
  };
  let atlas: StageActorSpriteAtlas | undefined;
  if (input.atlas !== undefined) {
    if (!record(input.atlas)) errors.push('atlas must be an object.');
    else {
      const asset = String(input.atlas.asset || '').trim();
      if (!assetPattern.test(asset)) errors.push('atlas.asset must be a local PNG or WebP filename without folders.');
      if (input.atlas.layout !== 'rows') errors.push('atlas.layout must be rows.');
      atlas = {
        asset,
        frameWidth: number(input.atlas.frameWidth, 128, 8, 2048, 'atlas.frameWidth', errors, true),
        frameHeight: number(input.atlas.frameHeight, 128, 8, 2048, 'atlas.frameHeight', errors, true),
        columns: number(input.atlas.columns, 10, 1, 120, 'atlas.columns', errors, true),
        rows: number(input.atlas.rows, 6, 1, 32, 'atlas.rows', errors, true),
        layout: 'rows'
      };
    }
  }
  if (schemaVersion === STAGE_ACTOR_ATLAS_SCHEMA_VERSION && !atlas) errors.push('atlas is required for schemaVersion 3.');
  if (schemaVersion !== STAGE_ACTOR_ATLAS_SCHEMA_VERSION && atlas) errors.push('atlas requires schemaVersion 3.');
  const animations: Record<string, StageActorAnimation> = {};
  if (!record(input.animations)) errors.push('animations must be an object.');
  else {
    const entries = Object.entries(input.animations);
    if (!entries.length || entries.length > 32) errors.push('animations must contain 1-32 named states.');
    for (const [state, raw] of entries) {
      if (!statePattern.test(state)) { errors.push(`Animation state ${state} is invalid.`); continue; }
      if (!record(raw)) { errors.push(`animations.${state} must be an object.`); continue; }
      const asset = String(raw.asset || '').trim();
      if (!assetPattern.test(asset)) errors.push(`animations.${state}.asset must be a local PNG or WebP filename without folders.`);
      animations[state] = {
        asset,
        frameWidth: number(raw.frameWidth, 128, 8, 2048, `animations.${state}.frameWidth`, errors, true),
        frameHeight: number(raw.frameHeight, 128, 8, 2048, `animations.${state}.frameHeight`, errors, true),
        frames: number(raw.frames, 1, 1, 120, `animations.${state}.frames`, errors, true),
        ...(raw.row === undefined ? {} : { row: number(raw.row, 0, 0, 31, `animations.${state}.row`, errors, true) }),
        ...(raw.startFrame === undefined ? {} : { startFrame: number(raw.startFrame, 0, 0, 119, `animations.${state}.startFrame`, errors, true) }),
        fps: number(raw.fps, state === 'idle' ? 4 : 10, 1, 60, `animations.${state}.fps`, errors),
        loop: raw.loop === undefined ? ['idle', 'walk', 'sleep'].includes(state) : raw.loop === true,
        returnsToIdle: raw.returnsToIdle === undefined ? !['idle', 'walk', 'sleep'].includes(state) : raw.returnsToIdle === true
      };
    }
  }
  if (!animations.idle) errors.push('animations.idle is required.');
  if (atlas) {
    const usedRows = new Set<number>();
    for (const [state, animation] of Object.entries(animations)) {
      if (animation.asset !== atlas.asset) errors.push(`animations.${state}.asset must match atlas.asset.`);
      if (animation.frameWidth !== atlas.frameWidth || animation.frameHeight !== atlas.frameHeight) errors.push(`animations.${state} frame size must match the atlas frame size.`);
      if (animation.row === undefined) errors.push(`animations.${state}.row is required for an atlas pack.`);
      else {
        if (animation.row >= atlas.rows) errors.push(`animations.${state}.row must be inside the atlas.`);
        if (usedRows.has(animation.row)) errors.push(`animations.${state}.row is already assigned to another state.`);
        usedRows.add(animation.row);
      }
      const startFrame = animation.startFrame || 0;
      if (startFrame + animation.frames > atlas.columns) errors.push(`animations.${state} frames extend past the atlas width.`);
    }
  }
  let appearance: StageActorAppearance | undefined;
  if (input.appearance !== undefined) {
    if (!record(input.appearance)) errors.push('appearance must be an object.');
    else {
      const slots = record(input.appearance.colorSlots) ? input.appearance.colorSlots : {};
      if (!record(input.appearance.colorSlots)) errors.push('appearance.colorSlots must be an object.');
      const primary = colorSlot(slots.primary, 'appearance.colorSlots.primary', errors);
      const secondary = colorSlot(slots.secondary, 'appearance.colorSlots.secondary', errors);
      const masks: StageActorAppearance['masks'] = {};
      if (!record(input.appearance.masks)) errors.push('appearance.masks must be an object.');
      else for (const state of Object.keys(animations)) {
        const raw = input.appearance.masks[state];
        if (!record(raw)) { errors.push(`appearance.masks.${state} must be an object.`); continue; }
        const primaryMask = String(raw.primary || '').trim();
        const secondaryMask = String(raw.secondary || '').trim();
        if (!assetPattern.test(primaryMask)) errors.push(`appearance.masks.${state}.primary must be a local PNG or WebP filename without folders.`);
        if (!assetPattern.test(secondaryMask)) errors.push(`appearance.masks.${state}.secondary must be a local PNG or WebP filename without folders.`);
        masks[state] = { primary: primaryMask, secondary: secondaryMask };
      }
      if (primary && secondary) appearance = { colorSlots: { primary, secondary }, masks };
    }
  }
  const rig = schemaVersion === STAGE_ACTOR_RIG_SCHEMA_VERSION ? validateStageActorRig(input.rig, errors) : undefined;
  if (schemaVersion === STAGE_ACTOR_PACK_SCHEMA_VERSION && input.rig !== undefined) errors.push('rig requires schemaVersion 2.');
  if (schemaVersion === STAGE_ACTOR_ATLAS_SCHEMA_VERSION && input.rig !== undefined) errors.push('Atlas packs cannot contain a rig.');
  const createdAt = timestamp(input.createdAt, now.toISOString(), 'createdAt', errors);
  const updatedAt = timestamp(input.updatedAt, now.toISOString(), 'updatedAt', errors);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors,
    value: {
      schemaVersion,
      id,
      name,
      version,
      ...(creator ? { creator } : {}),
      ...(license ? { license } : {}),
      ...(description ? { description } : {}),
      ...(thumbnail ? { thumbnail } : {}),
      preferredRenderer: preferredRenderer === 'rig' ? 'rig' : 'sprite',
      defaultScale,
      pivot,
      nameplate,
      collider,
      ...(atlas ? { atlas } : {}),
      animations,
      ...(appearance ? { appearance } : {}),
      ...(rig ? { rig } : {}),
      createdAt,
      updatedAt
    }
  };
}
