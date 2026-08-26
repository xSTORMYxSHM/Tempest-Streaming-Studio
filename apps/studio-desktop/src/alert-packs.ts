import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TempestTwitchAlertVariant } from '@tempest/contracts';
import { validateTwitchAlertDesign } from '@tempest/bridge';

export type TempestAlertPackKind = 'twitch' | 'interaction';

interface PackedAsset {
  id: string;
  fileName: string;
  extension: string;
  mediaType: string;
  size: number;
  sha256: string;
  data: string;
}

interface PackedMediaReferences {
  audio?: string;
  visual?: string;
  variants?: Record<string, { audio?: string; visual?: string }>;
}

export interface TempestAlertPackDocument {
  schemaVersion: 1;
  type: 'tempest.alert-pack';
  name: string;
  description: string;
  kind: TempestAlertPackKind;
  createdWithVersion: string;
  exportedAt: string;
  alert: Record<string, unknown>;
  media: PackedMediaReferences;
  assets: PackedAsset[];
}

export interface ImportedTempestAlertPack {
  name: string;
  description: string;
  kind: TempestAlertPackKind;
  createdWithVersion: string;
  alert: Record<string, unknown>;
  assetCount: number;
  totalAssetBytes: number;
  containsCustomCode: boolean;
}

const maximumAssetBytes = 64 * 1024 * 1024;
const maximumPackAssetBytes = 150 * 1024 * 1024;
const supportedMedia = new Map([
  ['.mp3', 'audio/mpeg'], ['.wav', 'audio/wav'], ['.ogg', 'audio/ogg'], ['.m4a', 'audio/mp4'], ['.aac', 'audio/aac'], ['.flac', 'audio/flac'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.gif', 'image/gif'], ['.webp', 'image/webp'], ['.avif', 'image/avif'], ['.mp4', 'video/mp4'], ['.webm', 'video/webm']
]);

const copy = <T>(value: T): T => structuredClone(value);

function safeName(value: unknown, fallback: string, maximum = 100): string {
  const name = String(value || '').trim().slice(0, maximum);
  return name || fallback;
}

function hasCustomCode(design: unknown): boolean {
  if (!design || typeof design !== 'object') return false;
  const source = design as Record<string, unknown>;
  return ['customHtml', 'customCss', 'customJavaScript'].some((key) => typeof source[key] === 'string' && source[key]!.trim().length > 0);
}

function sanitizeAlert(kind: TempestAlertPackKind, input: unknown): { alert: Record<string, unknown>; uris: { audio?: string; visual?: string; variants: Array<{ id: string; audio?: string; visual?: string }> } } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('An Alert Pack needs a complete alert definition.');
  const source = copy(input as Record<string, unknown>);
  const audio = typeof source.audioUri === 'string' ? source.audioUri : undefined;
  const visual = typeof source.visualUri === 'string' ? source.visualUri : undefined;
  delete source.audioUri;
  delete source.visualUri;
  delete source.updatedAt;
  delete source.custom;
  delete source.selectedVariantId;
  delete source.selectedVariantName;
  if (kind === 'interaction') {
    delete source.broadcastAudioSource;
    delete source.broadcastVisualSource;
    delete source.legacyReceiver;
  }
  source.design = validateTwitchAlertDesign(source.design);
  const variantUris: Array<{ id: string; audio?: string; visual?: string }> = [];
  if (kind === 'twitch') {
    const variants = Array.isArray(source.alertVariants) ? source.alertVariants : [];
    source.alertVariants = variants.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Alert variant ${index + 1} is invalid.`);
      const variant = copy(entry as Record<string, unknown>);
      const id = safeName(variant.id, '', 80);
      if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(id)) throw new Error(`Alert variant ${index + 1} has an invalid identifier.`);
      variantUris.push({ id, audio: typeof variant.audioUri === 'string' ? variant.audioUri : undefined, visual: typeof variant.visualUri === 'string' ? variant.visualUri : undefined });
      delete variant.audioUri;
      delete variant.visualUri;
      variant.design = validateTwitchAlertDesign(variant.design);
      return variant;
    });
  } else delete source.alertVariants;
  return { alert: source, uris: { audio, visual, variants: variantUris } };
}

async function readPackedAsset(uri: string): Promise<{ asset: PackedAsset; bytes: Buffer }> {
  let filePath: string;
  try {
    const url = new URL(uri);
    if (url.protocol !== 'file:') throw new Error('Only local file assets can be included.');
    filePath = fileURLToPath(url);
  } catch (error) {
    throw new Error(`Alert media could not be packed: ${(error as Error).message}`);
  }
  const details = await stat(filePath);
  if (!details.isFile()) throw new Error(`Alert media is not a file: ${path.basename(filePath)}`);
  if (details.size > maximumAssetBytes) throw new Error(`${path.basename(filePath)} exceeds the 64 MB per-file Alert Pack limit.`);
  const extension = path.extname(filePath).toLowerCase();
  const mediaType = supportedMedia.get(extension);
  if (!mediaType) throw new Error(`${path.basename(filePath)} is not a supported alert media format.`);
  const bytes = await readFile(filePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return {
    bytes,
    asset: { id: sha256, fileName: path.basename(filePath).slice(0, 180), extension, mediaType, size: bytes.length, sha256, data: bytes.toString('base64') }
  };
}

export async function buildTempestAlertPack(input: { name?: unknown; description?: unknown; kind?: unknown; alert?: unknown; createdWithVersion?: unknown }): Promise<TempestAlertPackDocument> {
  const kind = input.kind === 'interaction' ? 'interaction' : input.kind === 'twitch' ? 'twitch' : undefined;
  if (!kind) throw new Error('Alert Pack kind must be Twitch or Interaction.');
  const sanitized = sanitizeAlert(kind, input.alert);
  const assets = new Map<string, PackedAsset>();
  let totalBytes = 0;
  const add = async (uri: string | undefined): Promise<string | undefined> => {
    if (!uri) return undefined;
    const packed = await readPackedAsset(uri);
    if (!assets.has(packed.asset.id)) {
      totalBytes += packed.bytes.length;
      if (totalBytes > maximumPackAssetBytes) throw new Error('Alert Pack media exceeds the 150 MB total limit.');
      assets.set(packed.asset.id, packed.asset);
    }
    return packed.asset.id;
  };
  const media: PackedMediaReferences = { audio: await add(sanitized.uris.audio), visual: await add(sanitized.uris.visual) };
  for (const variant of sanitized.uris.variants) {
    const refs = { audio: await add(variant.audio), visual: await add(variant.visual) };
    if (refs.audio || refs.visual) (media.variants ||= {})[variant.id] = refs;
  }
  return {
    schemaVersion: 1,
    type: 'tempest.alert-pack',
    name: safeName(input.name, safeName(sanitized.alert.name, 'Tempest Alert')),
    description: safeName(input.description, `${kind === 'twitch' ? 'Twitch' : 'Interaction'} Alert exported from Tempest Streaming Studio.`, 300),
    kind,
    createdWithVersion: safeName(input.createdWithVersion, 'unknown', 30),
    exportedAt: new Date().toISOString(),
    alert: sanitized.alert,
    media,
    assets: [...assets.values()]
  };
}

function validatePackedAsset(value: unknown, index: number): { asset: PackedAsset; bytes: Buffer } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Packed asset ${index + 1} is invalid.`);
  const source = value as Record<string, unknown>;
  const sha256 = String(source.sha256 || '').toLowerCase();
  const id = String(source.id || '').toLowerCase();
  const extension = String(source.extension || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256) || id !== sha256) throw new Error(`Packed asset ${index + 1} has an invalid content identifier.`);
  if (!supportedMedia.has(extension) || supportedMedia.get(extension) !== source.mediaType) throw new Error(`Packed asset ${index + 1} uses an unsupported media type.`);
  if (typeof source.data !== 'string') throw new Error(`Packed asset ${index + 1} has no media data.`);
  const bytes = Buffer.from(source.data, 'base64');
  if (bytes.length > maximumAssetBytes || bytes.length !== Number(source.size)) throw new Error(`Packed asset ${index + 1} has an invalid size.`);
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error(`Packed asset ${index + 1} failed its integrity check.`);
  return { asset: { id, fileName: safeName(source.fileName, `${id}${extension}`, 180), extension, mediaType: String(source.mediaType), size: bytes.length, sha256, data: source.data }, bytes };
}

export async function importTempestAlertPack(value: unknown, destinationDirectory: string): Promise<ImportedTempestAlertPack> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Alert Pack document must be an object.');
  const document = value as Partial<TempestAlertPackDocument>;
  if (document.schemaVersion !== 1 || document.type !== 'tempest.alert-pack') throw new Error('This is not a supported Tempest Alert Pack.');
  if (document.kind !== 'twitch' && document.kind !== 'interaction') throw new Error('Alert Pack kind must be Twitch or Interaction.');
  if (!Array.isArray(document.assets) || document.assets.length > 84) throw new Error('Alert Pack assets must contain at most 84 files.');
  const validatedAssets = document.assets.map(validatePackedAsset);
  const totalAssetBytes = validatedAssets.reduce((sum, entry) => sum + entry.bytes.length, 0);
  if (totalAssetBytes > maximumPackAssetBytes) throw new Error('Alert Pack media exceeds the 150 MB total limit.');
  const assetUris = new Map<string, string>();
  await mkdir(destinationDirectory, { recursive: true });
  for (const { asset, bytes } of validatedAssets) {
    const filePath = path.join(destinationDirectory, `${asset.sha256}${asset.extension}`);
    await writeFile(filePath, bytes, { mode: 0o600 });
    assetUris.set(asset.id, pathToFileURL(filePath).href);
  }
  if (!document.alert || typeof document.alert !== 'object' || Array.isArray(document.alert)) throw new Error('Alert Pack has no alert definition.');
  const alert = copy(document.alert as Record<string, unknown>);
  const resolve = (id: unknown, field: string): string | undefined => {
    if (id === undefined) return undefined;
    if (typeof id !== 'string' || !assetUris.has(id)) throw new Error(`${field} references a missing packed asset.`);
    return assetUris.get(id);
  };
  const media = document.media && typeof document.media === 'object' ? document.media : {};
  const baseAudio = resolve(media.audio, 'media.audio');
  const baseVisual = resolve(media.visual, 'media.visual');
  if (baseAudio) alert.audioUri = baseAudio;
  if (baseVisual) alert.visualUri = baseVisual;
  alert.design = validateTwitchAlertDesign(alert.design);
  if (document.kind === 'twitch') {
    const variants = Array.isArray(alert.alertVariants) ? alert.alertVariants as Array<Record<string, unknown>> : [];
    alert.alertVariants = variants.map((variant, index) => {
      const id = safeName(variant.id, '', 80);
      if (!id) throw new Error(`Alert variant ${index + 1} has no identifier.`);
      const refs = media.variants?.[id];
      const audioUri = resolve(refs?.audio, `media.variants.${id}.audio`);
      const visualUri = resolve(refs?.visual, `media.variants.${id}.visual`);
      return { ...variant, ...(audioUri ? { audioUri } : {}), ...(visualUri ? { visualUri } : {}), design: validateTwitchAlertDesign(variant.design) } as TempestTwitchAlertVariant;
    });
  } else delete alert.alertVariants;
  const containsCustomCode = hasCustomCode(alert.design) || (Array.isArray(alert.alertVariants) && alert.alertVariants.some((variant) => hasCustomCode((variant as Record<string, unknown>).design)));
  return {
    name: safeName(document.name, safeName(alert.name, 'Tempest Alert')),
    description: safeName(document.description, 'Imported Tempest Alert Pack.', 300),
    kind: document.kind,
    createdWithVersion: safeName(document.createdWithVersion, 'unknown', 30),
    alert,
    assetCount: validatedAssets.length,
    totalAssetBytes,
    containsCustomCode
  };
}
