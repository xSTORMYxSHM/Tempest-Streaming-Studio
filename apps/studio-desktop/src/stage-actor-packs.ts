import { createHash, randomBytes } from 'node:crypto';
import { copyFile, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { STAGE_ACTOR_ATLAS_SCHEMA_VERSION, STAGE_ACTOR_PACK_SCHEMA_VERSION, StageActorPackManifest, validateStageActorPackManifest } from '@tempest/contracts';

export interface StageActorStripInspection {
  fileName: string;
  width: number;
  height: number;
  size: number;
}

export interface StageActorPackBuildInput {
  name: string;
  creator?: string;
  license?: string;
  description?: string;
  version?: string;
  frameWidth: number;
  frameHeight: number;
  defaultScale?: number;
  animations: Array<{
    state: string;
    sourcePath: string;
    frames: number;
    fps: number;
    loop?: boolean;
    returnsToIdle?: boolean;
  }>;
}

export interface StageActorAtlasPackBuildInput {
  name: string;
  creator?: string;
  license?: string;
  description?: string;
  version?: string;
  sourcePath: string;
  frameWidth?: number;
  frameHeight?: number;
  defaultScale?: number;
  animations: Array<{
    state: string;
    row: number;
    startFrame?: number;
    frames: number;
    fps: number;
    loop?: boolean;
    returnsToIdle?: boolean;
  }>;
}

export interface StageActorTemplatePackBuildInput {
  name: string;
  creator?: string;
  license?: string;
  description?: string;
  version?: string;
  defaultScale?: number;
  templateId: string;
  texturePath: string;
  templateDirectory: string;
}

interface StreamingAvatarsAnimationData {
  animationName?: unknown;
  customName?: unknown;
  frameData?: unknown;
  framesPerSecond?: unknown;
  animationLoops?: unknown;
  returnsToIdle?: unknown;
}

interface StreamingAvatarsAvatarData {
  name?: unknown;
  width?: unknown;
  height?: unknown;
  animationData?: Record<string, StreamingAvatarsAnimationData>;
}

export interface StreamingAvatarsLibraryImportResult {
  sourceDirectory: string;
  metadataPath: string;
  discovered: number;
  imported: Array<{ manifest: StageActorPackManifest; directory: string; sourceFile: string }>;
  skipped: Array<{ name: string; reason: string }>;
}

interface PackedStageActorAsset {
  fileName: string;
  size: number;
  sha256: string;
  data: string;
}

export interface TempestStageActorPackDocument {
  schemaVersion: 1;
  type: 'tempest.stage-actor-pack';
  createdWithVersion: string;
  exportedAt: string;
  manifest: StageActorPackManifest;
  assets: PackedStageActorAsset[];
}

const maximumStripBytes = 25 * 1024 * 1024;
const maximumPortablePackBytes = 250 * 1024 * 1024;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const legacyStormWispAssets = [
  ...['idle', 'walk', 'jump', 'attack', 'celebrate', 'sit', 'sleep', 'emote', 'damaged', 'defeated'].flatMap((state) => [`${state}.png`, `${state}-jacket-mask.png`, `${state}-wisp-mask.png`]),
  'rig-v2-atlas.png', 'rig-v2-torso.png', 'rig-v2-hood.png', 'rig-v2-plume.png', 'humanoid-wisp-v1-texture.png', 'humanoid-wisp-v1-guide.png'
];

function manifestAssets(manifest: StageActorPackManifest): Set<string> {
  return new Set([
    ...(manifest.atlas ? [manifest.atlas.asset] : []),
    ...Object.values(manifest.animations).map((animation) => animation.asset),
    ...(manifest.thumbnail ? [manifest.thumbnail] : []),
    ...Object.values(manifest.appearance?.masks || {}).flatMap((masks) => [masks.primary, masks.secondary]),
    ...(manifest.rig?.layers || []).map((layer) => layer.asset),
    ...(manifest.rig?.template?.guideAsset ? [manifest.rig.template.guideAsset] : [])
  ]);
}

export async function installBundledStageActorPacks(sourceDirectory: string, bridgeDataDirectory: string, bundleVersion = '1'): Promise<{ installed: string[]; skipped: boolean }> {
  const markerName = `.bundled-stage-actors-v${String(bundleVersion).replace(/[^A-Za-z0-9._-]/g, '') || '1'}`;
  const targetRoot = path.join(bridgeDataDirectory, 'stage-actors');
  await mkdir(targetRoot, { recursive: true });
  if ((await stat(path.join(targetRoot, markerName)).catch(() => null))?.isFile()) return { installed: [], skipped: true };
  const entries = await readdir(sourceDirectory, { withFileTypes: true }).catch(() => []);
  if (!entries.some((entry) => entry.isDirectory() && /^[a-z0-9][a-z0-9-]{1,63}$/.test(entry.name))) return { installed: [], skipped: false };
  const installed: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(entry.name)) continue;
    const source = path.join(sourceDirectory, entry.name);
    const validation = validateStageActorPackManifest(JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8')) as unknown);
    if (!validation.ok || !validation.value) throw new Error(`Bundled Stage Actor ${entry.name} is invalid: ${validation.errors.join(' ')}`);
    if (validation.value.id !== entry.name) throw new Error(`Bundled Stage Actor directory ${entry.name} does not match its manifest ID.`);
    const assets = manifestAssets(validation.value);
    for (const asset of assets) if (!(await stat(path.join(source, asset)).catch(() => null))?.isFile()) throw new Error(`Bundled Stage Actor ${entry.name} is missing ${asset}.`);
    const destination = path.join(targetRoot, entry.name);
    const destinationExists = (await stat(destination).catch(() => null))?.isDirectory() === true;
    await cp(source, destination, { recursive: true, force: true, errorOnExist: !destinationExists });
    if (entry.name === 'storm-wisp' && validation.value.schemaVersion === STAGE_ACTOR_ATLAS_SCHEMA_VERSION) {
      for (const legacyAsset of legacyStormWispAssets) await rm(path.join(destination, legacyAsset), { force: true });
    }
    installed.push(entry.name);
  }
  await writeFile(path.join(targetRoot, markerName), `${JSON.stringify({ schemaVersion: 1, bundleVersion, installed }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return { installed, skipped: false };
}

export function pngDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(pngSignature) || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Stage Actor animation strips must be valid PNG images.');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height || width > 16_384 || height > 4_096) throw new Error('The PNG dimensions are outside the supported Stage Actor range.');
  return { width, height };
}

export async function inspectStageActorStrip(filePath: string): Promise<StageActorStripInspection> {
  const normalized = path.normalize(filePath);
  if (path.extname(normalized).toLowerCase() !== '.png') throw new Error('Stage Actor v1 accepts transparent PNG animation strips.');
  const details = await stat(normalized);
  if (!details.isFile() || details.size < 33 || details.size > maximumStripBytes) throw new Error('Animation strips must be PNG files smaller than 25 MB.');
  const bytes = await readFile(normalized);
  const dimensions = pngDimensions(bytes);
  return { fileName: path.basename(normalized), ...dimensions, size: bytes.length };
}

function slug(value: string): string {
  const result = value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return result.length >= 2 ? result : 'stage-actor';
}

const streamingAvatarsRows = ['idle', 'walk', 'sit', 'stand', 'jump', 'custom1', 'custom2'] as const;

function streamingAvatarsStateName(key: string, animation: StreamingAvatarsAnimationData, used: Set<string>): string {
  const requested = key.startsWith('custom') ? String(animation.customName || animation.animationName || key) : key;
  let state = requested.toLowerCase().normalize('NFKD').replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  if (!/^[a-z]/.test(state)) state = `custom-${state || key}`.slice(0, 48);
  if (!/^[a-z][a-z0-9.-]{0,47}$/.test(state) || used.has(state)) state = key;
  let uniqueState = state;
  let suffix = 2;
  while (used.has(uniqueState)) uniqueState = `${state.slice(0, 44)}-${suffix++}`;
  return uniqueState;
}

async function resolveStreamingAvatarsLibrary(selectedDirectory: string): Promise<{ sourceDirectory: string; metadataPath: string }> {
  const normalized = path.normalize(String(selectedDirectory || ''));
  if (!(await stat(normalized).catch(() => null))?.isDirectory()) throw new Error('Choose a Streaming Avatars data or avatars folder.');
  const directMetadata = path.join(normalized, 'streamavatars_json.txt');
  const directAvatars = path.join(normalized, 'avatars');
  if ((await stat(directMetadata).catch(() => null))?.isFile() && (await stat(directAvatars).catch(() => null))?.isDirectory()) {
    return { sourceDirectory: directAvatars, metadataPath: directMetadata };
  }
  const parentMetadata = path.join(path.dirname(normalized), 'streamavatars_json.txt');
  if (path.basename(normalized).toLowerCase() === 'avatars' && (await stat(parentMetadata).catch(() => null))?.isFile()) {
    return { sourceDirectory: normalized, metadataPath: parentMetadata };
  }
  throw new Error('The selected folder does not contain avatars plus streamavatars_json.txt metadata. Choose the Streaming Avatars data folder or its avatars folder.');
}

export async function importStreamingAvatarsLibrary(selectedDirectory: string, userDataDirectory: string): Promise<StreamingAvatarsLibraryImportResult> {
  const resolved = await resolveStreamingAvatarsLibrary(selectedDirectory);
  const metadataDetails = await stat(resolved.metadataPath);
  if (metadataDetails.size < 2 || metadataDetails.size > 64 * 1024 * 1024) throw new Error('Streaming Avatars metadata must be smaller than 64 MB.');
  let parsed: unknown;
  try {
    parsed = JSON.parse((await readFile(resolved.metadataPath, 'utf8')).replace(/^\uFEFF/, '')) as unknown;
  } catch {
    throw new Error('streamavatars_json.txt is not valid JSON metadata.');
  }
  const root = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  const avatarData = (root.avatarData && typeof root.avatarData === 'object' ? root.avatarData : root) as Record<string, StreamingAvatarsAvatarData>;
  const records = Object.entries(avatarData);
  if (!records.length || records.length > 1000) throw new Error('Streaming Avatars metadata must contain between 1 and 1000 avatar records.');
  const pngFiles = (await readdir(resolved.sourceDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.png');
  const filesByStem = new Map(pngFiles.map((entry) => [path.basename(entry.name, path.extname(entry.name)).toLowerCase(), entry.name]));
  const imported: StreamingAvatarsLibraryImportResult['imported'] = [];
  const skipped: StreamingAvatarsLibraryImportResult['skipped'] = [];
  for (const [recordName, metadata] of records) {
    const fileName = filesByStem.get(recordName.toLowerCase());
    if (!fileName) {
      skipped.push({ name: recordName, reason: 'No matching PNG file.' });
      continue;
    }
    try {
      const sourcePath = path.join(resolved.sourceDirectory, fileName);
      const inspection = await inspectStageActorStrip(sourcePath);
      const frameWidth = Number(metadata.width);
      const frameHeight = Number(metadata.height);
      if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight) || frameWidth < 8 || frameHeight < 8) throw new Error('Metadata has an invalid cell size.');
      if (inspection.width % frameWidth || inspection.height % frameHeight) throw new Error(`PNG dimensions do not divide into ${frameWidth}×${frameHeight} cells.`);
      const columns = inspection.width / frameWidth;
      const rows = inspection.height / frameHeight;
      if (rows < 1 || rows > streamingAvatarsRows.length) throw new Error(`Expected 1-${streamingAvatarsRows.length} animation rows; found ${rows}.`);
      const usedStates = new Set<string>();
      const animations: StageActorAtlasPackBuildInput['animations'] = [];
      for (let row = 0; row < rows; row += 1) {
        const sourceKey = streamingAvatarsRows[row];
        const animation = metadata.animationData?.[sourceKey];
        const frames = Array.isArray(animation?.frameData) ? animation.frameData.length : 0;
        if (!animation || frames < 1) continue;
        if (frames > columns) throw new Error(`${sourceKey} declares ${frames} frames in a ${columns}-column sheet.`);
        const state = streamingAvatarsStateName(sourceKey, animation, usedStates);
        usedStates.add(state);
        const loop = ['idle', 'walk', 'sit', 'stand', 'sleep'].includes(state);
        animations.push({
          state, row, frames,
          fps: Math.max(1, Math.min(60, Number(animation.framesPerSecond) || 8)),
          loop,
          returnsToIdle: !loop
        });
      }
      if (!animations.some((animation) => animation.state === 'idle')) throw new Error('No usable idle animation was declared.');
      const built = await buildStageActorAtlasPack({
        name: String(metadata.name || recordName).trim() || recordName,
        creator: 'Imported from Streaming Avatars',
        license: 'Original asset rights apply',
        description: `Imported locally from ${fileName} using Streaming Avatars metadata.`,
        version: '1.0.0', sourcePath, frameWidth, frameHeight, defaultScale: 1, animations
      }, userDataDirectory);
      imported.push({ ...built, sourceFile: fileName });
    } catch (error) {
      skipped.push({ name: recordName, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { ...resolved, discovered: records.length, imported, skipped };
}

export async function buildStageActorPack(input: StageActorPackBuildInput, userDataDirectory: string): Promise<{ manifest: StageActorPackManifest; directory: string }> {
  if (!input || typeof input !== 'object') throw new Error('Stage Actor pack settings are required.');
  const name = String(input.name || '').trim().slice(0, 80);
  if (!name) throw new Error('A Stage Actor pack name is required.');
  const frameWidth = Number(input.frameWidth);
  const frameHeight = Number(input.frameHeight);
  if (!Number.isInteger(frameWidth) || frameWidth < 8 || frameWidth > 2048 || !Number.isInteger(frameHeight) || frameHeight < 8 || frameHeight > 2048) {
    throw new Error('Frame width and height must be whole numbers between 8 and 2048.');
  }
  if (!Array.isArray(input.animations) || !input.animations.length || input.animations.length > 32) throw new Error('Add between 1 and 32 animation strips.');
  const id = `${slug(name)}-${randomBytes(3).toString('hex')}`;
  const root = path.join(userDataDirectory, 'bridge', 'stage-actors');
  const finalDirectory = path.join(root, id);
  const temporaryDirectory = path.join(root, `.${id}.importing`);
  await mkdir(root, { recursive: true });
  await rm(temporaryDirectory, { recursive: true, force: true });
  await mkdir(temporaryDirectory, { recursive: true });
  try {
    const animations: StageActorPackManifest['animations'] = {};
    const seen = new Set<string>();
    for (const source of input.animations) {
      const state = String(source.state || '').trim().toLowerCase();
      if (!/^[a-z][a-z0-9.-]{0,47}$/.test(state) || seen.has(state)) throw new Error(`Animation state ${state || '(blank)'} is invalid or duplicated.`);
      seen.add(state);
      const inspection = await inspectStageActorStrip(source.sourcePath);
      const frames = Number(source.frames);
      if (!Number.isInteger(frames) || frames < 1 || frames > 120) throw new Error(`${state} must contain 1-120 frames.`);
      if (inspection.width !== frameWidth * frames || inspection.height !== frameHeight) {
        throw new Error(`${inspection.fileName} is ${inspection.width}×${inspection.height}; ${state} needs exactly ${frameWidth * frames}×${frameHeight} for ${frames} ${frameWidth}×${frameHeight} frames.`);
      }
      const bytes = await readFile(source.sourcePath);
      const asset = `${state}.png`;
      await writeFile(path.join(temporaryDirectory, asset), bytes, { mode: 0o600, flag: 'wx' });
      animations[state] = {
        asset,
        frameWidth,
        frameHeight,
        frames,
        fps: Number(source.fps),
        loop: source.loop === undefined ? ['idle', 'walk', 'sleep'].includes(state) : source.loop === true,
        returnsToIdle: source.returnsToIdle === undefined ? !['idle', 'walk', 'sleep'].includes(state) : source.returnsToIdle === true
      };
    }
    const now = new Date().toISOString();
    const candidate = {
      schemaVersion: STAGE_ACTOR_PACK_SCHEMA_VERSION,
      id,
      name,
      version: String(input.version || '1.0.0').trim(),
      creator: String(input.creator || '').trim(),
      license: String(input.license || '').trim(),
      description: String(input.description || '').trim(),
      defaultScale: Number(input.defaultScale ?? 1),
      pivot: { x: 0.5, y: 1 },
      nameplate: { x: 0.5, y: 0 },
      collider: { x: 0.5, y: 0.55, width: 0.7, height: 0.85 },
      animations,
      createdAt: now,
      updatedAt: now
    };
    const validation = validateStageActorPackManifest(candidate);
    if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
    await writeFile(path.join(temporaryDirectory, 'manifest.json'), `${JSON.stringify(validation.value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporaryDirectory, finalDirectory);
    return { manifest: validation.value, directory: finalDirectory };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function buildStageActorAtlasPack(input: StageActorAtlasPackBuildInput, userDataDirectory: string): Promise<{ manifest: StageActorPackManifest; directory: string }> {
  if (!input || typeof input !== 'object') throw new Error('Stage Actor atlas settings are required.');
  const name = String(input.name || '').trim().slice(0, 80);
  if (!name) throw new Error('A Stage Actor pack name is required.');
  const inspection = await inspectStageActorStrip(input.sourcePath);
  const frameWidth = Number(input.frameWidth ?? 128);
  const frameHeight = Number(input.frameHeight ?? 128);
  if (!Number.isInteger(frameWidth) || frameWidth < 8 || frameWidth > 2048 || !Number.isInteger(frameHeight) || frameHeight < 8 || frameHeight > 2048) throw new Error('Atlas frame width and height must be whole numbers between 8 and 2048.');
  if (inspection.width % frameWidth !== 0 || inspection.height % frameHeight !== 0) throw new Error(`${inspection.fileName} must divide exactly into ${frameWidth}×${frameHeight} cells.`);
  const columns = inspection.width / frameWidth;
  const rows = inspection.height / frameHeight;
  if (columns < 1 || columns > 120 || rows < 1 || rows > 32) throw new Error('The atlas must contain 1-120 columns and 1-32 rows.');
  if (!Array.isArray(input.animations) || !input.animations.length || input.animations.length > 32) throw new Error('Map between 1 and 32 animation rows.');
  const id = `${slug(name)}-${randomBytes(3).toString('hex')}`;
  const root = path.join(userDataDirectory, 'bridge', 'stage-actors');
  const finalDirectory = path.join(root, id);
  const temporaryDirectory = path.join(root, `.${id}.importing`);
  await mkdir(root, { recursive: true });
  await rm(temporaryDirectory, { recursive: true, force: true });
  await mkdir(temporaryDirectory, { recursive: true });
  try {
    const asset = 'avatar.png';
    const animations: StageActorPackManifest['animations'] = {};
    const states = new Set<string>();
    const usedRows = new Set<number>();
    for (const source of input.animations) {
      const state = String(source.state || '').trim().toLowerCase();
      const row = Number(source.row);
      const frames = Number(source.frames);
      const startFrame = Number(source.startFrame || 0);
      if (!/^[a-z][a-z0-9.-]{0,47}$/.test(state) || states.has(state)) throw new Error(`Animation state ${state || '(blank)'} is invalid or duplicated.`);
      if (!Number.isInteger(row) || row < 0 || row >= rows || usedRows.has(row)) throw new Error(`${state} must use a unique row between 0 and ${rows - 1}.`);
      if (!Number.isInteger(startFrame) || startFrame < 0 || !Number.isInteger(frames) || frames < 1 || startFrame + frames > columns) throw new Error(`${state} must select valid frames inside the ${columns}-column atlas.`);
      states.add(state); usedRows.add(row);
      animations[state] = {
        asset, frameWidth, frameHeight, frames, row, ...(startFrame ? { startFrame } : {}), fps: Number(source.fps),
        loop: source.loop === undefined ? ['idle', 'walk', 'sit', 'sleep'].includes(state) : source.loop === true,
        returnsToIdle: source.returnsToIdle === undefined ? !['idle', 'walk', 'sit', 'sleep'].includes(state) : source.returnsToIdle === true
      };
    }
    if (!animations.idle) throw new Error('The atlas must map an idle row.');
    await copyFile(path.normalize(input.sourcePath), path.join(temporaryDirectory, asset));
    const now = new Date().toISOString();
    const validation = validateStageActorPackManifest({
      schemaVersion: STAGE_ACTOR_ATLAS_SCHEMA_VERSION, id, name,
      version: String(input.version || '1.0.0').trim(), creator: String(input.creator || '').trim(), license: String(input.license || '').trim(),
      description: String(input.description || 'A row-based Tempest Stage Actor atlas.').trim(), preferredRenderer: 'sprite', defaultScale: Number(input.defaultScale ?? 1),
      pivot: { x: 0.5, y: 1 }, nameplate: { x: 0.5, y: 0 }, collider: { x: 0.5, y: 0.55, width: 0.7, height: 0.85 },
      atlas: { asset, frameWidth, frameHeight, columns, rows, layout: 'rows' }, animations, createdAt: now, updatedAt: now
    });
    if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
    await writeFile(path.join(temporaryDirectory, 'manifest.json'), `${JSON.stringify(validation.value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporaryDirectory, finalDirectory);
    return { manifest: validation.value, directory: finalDirectory };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function buildStageActorTemplatePack(input: StageActorTemplatePackBuildInput, userDataDirectory: string): Promise<{ manifest: StageActorPackManifest; directory: string }> {
  if (!input || typeof input !== 'object') throw new Error('Stage Actor template settings are required.');
  const name = String(input.name || '').trim().slice(0, 80);
  if (!name) throw new Error('A Stage Actor pack name is required.');
  const templateDirectory = path.normalize(String(input.templateDirectory || ''));
  const baseValidation = validateStageActorPackManifest(JSON.parse(await readFile(path.join(templateDirectory, 'manifest.json'), 'utf8')) as unknown);
  if (!baseValidation.ok || !baseValidation.value?.rig?.template) throw new Error(`The selected Stage Actor template is invalid: ${baseValidation.errors.join(' ')}`);
  const base = baseValidation.value;
  const template = base.rig!.template!;
  if (template.id !== String(input.templateId || '')) throw new Error('The requested Stage Actor template is not available.');
  const inspection = await inspectStageActorStrip(input.texturePath);
  if (inspection.width !== template.width || inspection.height !== template.height) {
    throw new Error(`${inspection.fileName} is ${inspection.width}×${inspection.height}; ${template.id} requires exactly ${template.width}×${template.height}.`);
  }

  const id = `${slug(name)}-${randomBytes(3).toString('hex')}`;
  const root = path.join(userDataDirectory, 'bridge', 'stage-actors');
  const finalDirectory = path.join(root, id);
  const temporaryDirectory = path.join(root, `.${id}.importing`);
  await mkdir(root, { recursive: true });
  await rm(temporaryDirectory, { recursive: true, force: true });
  await mkdir(temporaryDirectory, { recursive: true });
  try {
    const now = new Date().toISOString();
    const candidate: StageActorPackManifest = {
      ...structuredClone(base), id, name,
      version: String(input.version || '1.0.0').trim(),
      creator: String(input.creator || '').trim(),
      license: String(input.license || '').trim(),
      description: String(input.description || `Created with the ${template.id} bounded 2D template.`).trim(),
      preferredRenderer: 'rig',
      defaultScale: Number(input.defaultScale ?? base.defaultScale),
      createdAt: now, updatedAt: now
    };
    const validation = validateStageActorPackManifest(candidate);
    if (!validation.ok || !validation.value?.rig?.template) throw new Error(validation.errors.join(' '));
    const textureAsset = validation.value.rig.template.textureAsset;
    for (const asset of manifestAssets(validation.value)) {
      if (asset === textureAsset) await copyFile(path.normalize(input.texturePath), path.join(temporaryDirectory, asset));
      else await copyFile(path.join(templateDirectory, asset), path.join(temporaryDirectory, asset));
    }
    await writeFile(path.join(temporaryDirectory, 'manifest.json'), `${JSON.stringify(validation.value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporaryDirectory, finalDirectory);
    return { manifest: validation.value, directory: finalDirectory };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function updateStageActorPack(input: { packId: string; name?: unknown; creator?: unknown; license?: unknown; description?: unknown; version?: unknown; defaultScale?: unknown; thumbnail?: unknown }, userDataDirectory: string): Promise<StageActorPackManifest> {
  const directory = actorDirectory(userDataDirectory, String(input.packId || ''));
  const filePath = path.join(directory, 'manifest.json');
  const current = JSON.parse(await readFile(filePath, 'utf8')) as StageActorPackManifest;
  const candidate = {
    ...current,
    ...(input.name === undefined ? {} : { name: String(input.name).trim() }),
    ...(input.creator === undefined ? {} : { creator: String(input.creator).trim() }),
    ...(input.license === undefined ? {} : { license: String(input.license).trim() }),
    ...(input.description === undefined ? {} : { description: String(input.description).trim() }),
    ...(input.version === undefined ? {} : { version: String(input.version).trim() }),
    ...(input.defaultScale === undefined ? {} : { defaultScale: Number(input.defaultScale) }),
    ...(input.thumbnail === undefined ? {} : { thumbnail: String(input.thumbnail).trim() }),
    updatedAt: new Date().toISOString()
  };
  const validation = validateStageActorPackManifest(candidate);
  if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
  const temporary = `${filePath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(validation.value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, filePath);
  return validation.value;
}

function actorDirectory(userDataDirectory: string, id: string): string {
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)) throw new Error('The Stage Actor pack ID is invalid.');
  return path.join(userDataDirectory, 'bridge', 'stage-actors', id);
}

export async function buildPortableStageActorPack(input: { packId: string; createdWithVersion: string }, userDataDirectory: string): Promise<TempestStageActorPackDocument> {
  const directory = actorDirectory(userDataDirectory, String(input.packId || ''));
  const validation = validateStageActorPackManifest(JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')) as unknown);
  if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
  const manifest = validation.value;
  if (manifest.id !== input.packId) throw new Error('The Stage Actor folder does not match its manifest ID.');
  const fileNames = manifestAssets(manifest);
  const assets: PackedStageActorAsset[] = [];
  let totalBytes = 0;
  for (const fileName of fileNames) {
    const filePath = path.join(directory, fileName);
    const details = await stat(filePath);
    if (!details.isFile() || details.size < 33 || details.size > maximumStripBytes) throw new Error(`${fileName} is missing or outside the 25 MB asset limit.`);
    const bytes = await readFile(filePath);
    totalBytes += bytes.length;
    if (totalBytes > maximumPortablePackBytes) throw new Error('Stage Actor pack assets exceed the 250 MB portable-pack limit.');
    assets.push({ fileName, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), data: bytes.toString('base64') });
  }
  return { schemaVersion: 1, type: 'tempest.stage-actor-pack', createdWithVersion: String(input.createdWithVersion || 'unknown').slice(0, 30), exportedAt: new Date().toISOString(), manifest, assets };
}

function validatePortableAsset(value: unknown, index: number): { asset: PackedStageActorAsset; bytes: Buffer } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Stage Actor asset ${index + 1} is invalid.`);
  const source = value as Record<string, unknown>;
  const fileName = String(source.fileName || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.png$/i.test(fileName)) throw new Error(`Stage Actor asset ${index + 1} must be a local PNG filename.`);
  if (typeof source.data !== 'string') throw new Error(`Stage Actor asset ${index + 1} has no media data.`);
  const sha256 = String(source.sha256 || '').toLowerCase();
  const bytes = Buffer.from(source.data, 'base64');
  if (!/^[a-f0-9]{64}$/.test(sha256) || bytes.length !== Number(source.size) || bytes.length < 33 || bytes.length > maximumStripBytes) throw new Error(`Stage Actor asset ${index + 1} has invalid metadata.`);
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error(`Stage Actor asset ${index + 1} failed its integrity check.`);
  pngDimensions(bytes);
  return { asset: { fileName, size: bytes.length, sha256, data: source.data }, bytes };
}

export async function importPortableStageActorPack(value: unknown, userDataDirectory: string): Promise<{ manifest: StageActorPackManifest; directory: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Stage Actor pack document must be an object.');
  const document = value as Partial<TempestStageActorPackDocument>;
  if (document.schemaVersion !== 1 || document.type !== 'tempest.stage-actor-pack') throw new Error('This is not a supported Tempest Stage Actor Pack.');
  const validation = validateStageActorPackManifest(document.manifest);
  if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
  if (!Array.isArray(document.assets) || document.assets.length < 1 || document.assets.length > 192) throw new Error('Stage Actor packs must contain 1-192 assets.');
  const validatedAssets = document.assets.map(validatePortableAsset);
  if (validatedAssets.reduce((sum, entry) => sum + entry.bytes.length, 0) > maximumPortablePackBytes) throw new Error('Stage Actor pack assets exceed the 250 MB portable-pack limit.');
  const byName = new Map<string, { asset: PackedStageActorAsset; bytes: Buffer }>();
  for (const entry of validatedAssets) {
    if (byName.has(entry.asset.fileName)) throw new Error(`Stage Actor asset ${entry.asset.fileName} is duplicated.`);
    byName.set(entry.asset.fileName, entry);
  }
  const expected = manifestAssets(validation.value);
  for (const fileName of expected) if (!byName.has(fileName)) throw new Error(`Stage Actor pack is missing ${fileName}.`);
  for (const fileName of byName.keys()) if (!expected.has(fileName)) throw new Error(`Stage Actor pack contains an unreferenced asset: ${fileName}.`);
  if (validation.value.atlas) {
    const atlas = validation.value.atlas;
    const dimensions = pngDimensions(byName.get(atlas.asset)!.bytes);
    if (dimensions.width !== atlas.frameWidth * atlas.columns || dimensions.height !== atlas.frameHeight * atlas.rows) throw new Error(`${atlas.asset} does not match the grid geometry declared by the manifest.`);
  } else for (const [state, animation] of Object.entries(validation.value.animations)) {
    const dimensions = pngDimensions(byName.get(animation.asset)!.bytes);
    if (dimensions.width !== animation.frameWidth * animation.frames || dimensions.height !== animation.frameHeight) throw new Error(`${animation.asset} does not match the ${state} frame geometry declared by the manifest.`);
  }
  const id = `${slug(validation.value.name)}-${randomBytes(3).toString('hex')}`;
  const root = path.join(userDataDirectory, 'bridge', 'stage-actors');
  const finalDirectory = path.join(root, id);
  const temporaryDirectory = path.join(root, `.${id}.importing`);
  await mkdir(root, { recursive: true });
  await rm(temporaryDirectory, { recursive: true, force: true });
  await mkdir(temporaryDirectory, { recursive: true });
  try {
    for (const { asset, bytes } of validatedAssets) await writeFile(path.join(temporaryDirectory, asset.fileName), bytes, { mode: 0o600, flag: 'wx' });
    const now = new Date().toISOString();
    const importedValidation = validateStageActorPackManifest({ ...validation.value, id, createdAt: now, updatedAt: now });
    if (!importedValidation.ok || !importedValidation.value) throw new Error(importedValidation.errors.join(' '));
    await writeFile(path.join(temporaryDirectory, 'manifest.json'), `${JSON.stringify(importedValidation.value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporaryDirectory, finalDirectory);
    return { manifest: importedValidation.value, directory: finalDirectory };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}
