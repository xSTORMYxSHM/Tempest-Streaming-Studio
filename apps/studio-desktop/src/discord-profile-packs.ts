import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type DiscordProfileImageKind = 'idle' | 'speaking' | 'mute' | 'deafen';

interface PackedDiscordProfileAsset {
  id: string;
  fileName: string;
  extension: string;
  mediaType: string;
  size: number;
  sha256: string;
  data: string;
}

export interface TempestDiscordProfilePackDocument {
  schemaVersion: 1;
  type: 'tempest.discord-profile';
  createdWithVersion: string;
  exportedAt: string;
  profile: {
    userId: string;
    displayName: string;
    accent?: string;
  };
  media: Partial<Record<DiscordProfileImageKind, string>>;
  assets: PackedDiscordProfileAsset[];
}

export interface ImportedTempestDiscordProfile {
  createdWithVersion: string;
  profile: {
    userId: string;
    displayName: string;
    accent?: string;
    idleUri?: string;
    speakingUri?: string;
    muteUri?: string;
    deafenUri?: string;
  };
  assetCount: number;
  totalAssetBytes: number;
}

const imageKinds: DiscordProfileImageKind[] = ['idle', 'speaking', 'mute', 'deafen'];
const supportedImages = new Map([
  ['.png', 'image/png'], ['.gif', 'image/gif'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.avif', 'image/avif']
]);
const maximumAssetBytes = 64 * 1024 * 1024;
const maximumPackAssetBytes = 128 * 1024 * 1024;

function safeText(value: unknown, fallback: string, maximum: number): string {
  const result = String(value || '').trim().slice(0, maximum);
  if (/[\u0000-\u001f\u007f]/.test(result)) throw new Error('Discord profile text contains unsupported control characters.');
  return result || fallback;
}

function discordUserId(value: unknown): string {
  const result = String(value || '').trim();
  if (!/^[0-9]{5,32}$/.test(result)) throw new Error('A shared Discord profile needs a valid numeric Discord User ID.');
  return result;
}

function accentColor(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const result = String(value).toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(result)) throw new Error('Discord profile accent must be a six-digit hex color.');
  return result;
}

async function packImage(uri: string): Promise<{ asset: PackedDiscordProfileAsset; bytes: Buffer }> {
  let filePath: string;
  try {
    const url = new URL(uri);
    if (url.protocol !== 'file:') throw new Error('Only local files can be shared.');
    filePath = fileURLToPath(url);
  } catch (error) {
    throw new Error(`Discord profile image could not be packed: ${(error as Error).message}`);
  }
  const details = await stat(filePath);
  if (!details.isFile()) throw new Error(`${path.basename(filePath)} is not a file.`);
  if (details.size > maximumAssetBytes) throw new Error(`${path.basename(filePath)} exceeds the 64 MB per-image profile limit.`);
  const extension = path.extname(filePath).toLowerCase();
  const mediaType = supportedImages.get(extension);
  if (!mediaType) throw new Error(`${path.basename(filePath)} is not a supported Discord profile image.`);
  const bytes = await readFile(filePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return {
    bytes,
    asset: { id: sha256, fileName: path.basename(filePath).slice(0, 180), extension, mediaType, size: bytes.length, sha256, data: bytes.toString('base64') }
  };
}

export async function buildTempestDiscordProfilePack(input: { profile?: unknown; createdWithVersion?: unknown }): Promise<TempestDiscordProfilePackDocument> {
  if (!input.profile || typeof input.profile !== 'object' || Array.isArray(input.profile)) throw new Error('A complete Discord guest profile is required.');
  const source = input.profile as Record<string, unknown>;
  const userId = discordUserId(source.userId);
  const assets = new Map<string, PackedDiscordProfileAsset>();
  const media: Partial<Record<DiscordProfileImageKind, string>> = {};
  let totalAssetBytes = 0;
  for (const kind of imageKinds) {
    const uri = source[`${kind}Uri`];
    if (uri === undefined || uri === null || uri === '') continue;
    if (typeof uri !== 'string') throw new Error(`${kind}Uri must be a local image URI.`);
    const packed = await packImage(uri);
    if (!assets.has(packed.asset.id)) {
      totalAssetBytes += packed.bytes.length;
      if (totalAssetBytes > maximumPackAssetBytes) throw new Error('Discord profile images exceed the 128 MB total limit.');
      assets.set(packed.asset.id, packed.asset);
    }
    media[kind] = packed.asset.id;
  }
  return {
    schemaVersion: 1,
    type: 'tempest.discord-profile',
    createdWithVersion: safeText(input.createdWithVersion, 'unknown', 30),
    exportedAt: new Date().toISOString(),
    profile: {
      userId,
      displayName: safeText(source.displayName, `Discord Guest ${userId.slice(-4)}`, 100),
      ...(accentColor(source.accent) ? { accent: accentColor(source.accent) } : {})
    },
    media,
    assets: [...assets.values()]
  };
}

function validatePackedAsset(value: unknown, index: number): { asset: PackedDiscordProfileAsset; bytes: Buffer } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Packed image ${index + 1} is invalid.`);
  const source = value as Record<string, unknown>;
  const sha256 = String(source.sha256 || '').toLowerCase();
  const id = String(source.id || '').toLowerCase();
  const extension = String(source.extension || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256) || id !== sha256) throw new Error(`Packed image ${index + 1} has an invalid content identifier.`);
  if (!supportedImages.has(extension) || supportedImages.get(extension) !== source.mediaType) throw new Error(`Packed image ${index + 1} uses an unsupported media type.`);
  if (typeof source.data !== 'string') throw new Error(`Packed image ${index + 1} has no image data.`);
  const bytes = Buffer.from(source.data, 'base64');
  if (bytes.length > maximumAssetBytes || bytes.length !== Number(source.size)) throw new Error(`Packed image ${index + 1} has an invalid size.`);
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error(`Packed image ${index + 1} failed its integrity check.`);
  return { asset: { id, fileName: safeText(source.fileName, `${id}${extension}`, 180), extension, mediaType: String(source.mediaType), size: bytes.length, sha256, data: source.data }, bytes };
}

export async function importTempestDiscordProfilePack(value: unknown, destinationDirectory: string): Promise<ImportedTempestDiscordProfile> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Discord profile document must be an object.');
  const document = value as Partial<TempestDiscordProfilePackDocument>;
  if (document.schemaVersion !== 1 || document.type !== 'tempest.discord-profile') throw new Error('This is not a supported Tempest Discord Guest Profile.');
  if (!document.profile || typeof document.profile !== 'object') throw new Error('The shared Discord profile has no identity.');
  if (!Array.isArray(document.assets) || document.assets.length > 4) throw new Error('A Discord profile can contain at most four images.');
  const validatedAssets = document.assets.map(validatePackedAsset);
  const totalAssetBytes = validatedAssets.reduce((sum, entry) => sum + entry.bytes.length, 0);
  if (totalAssetBytes > maximumPackAssetBytes) throw new Error('Discord profile images exceed the 128 MB total limit.');
  const assetUris = new Map<string, string>();
  await mkdir(destinationDirectory, { recursive: true });
  for (const { asset, bytes } of validatedAssets) {
    const filePath = path.join(destinationDirectory, `${asset.sha256}${asset.extension}`);
    await writeFile(filePath, bytes, { mode: 0o600 });
    assetUris.set(asset.id, pathToFileURL(filePath).href);
  }
  const media = document.media && typeof document.media === 'object' ? document.media : {};
  const resolve = (kind: DiscordProfileImageKind): string | undefined => {
    const id = media[kind];
    if (id === undefined) return undefined;
    if (typeof id !== 'string' || !assetUris.has(id)) throw new Error(`${kind} image references a missing packed asset.`);
    return assetUris.get(id);
  };
  const userId = discordUserId(document.profile.userId);
  return {
    createdWithVersion: safeText(document.createdWithVersion, 'unknown', 30),
    profile: {
      userId,
      displayName: safeText(document.profile.displayName, `Discord Guest ${userId.slice(-4)}`, 100),
      ...(accentColor(document.profile.accent) ? { accent: accentColor(document.profile.accent) } : {}),
      ...(resolve('idle') ? { idleUri: resolve('idle') } : {}),
      ...(resolve('speaking') ? { speakingUri: resolve('speaking') } : {}),
      ...(resolve('mute') ? { muteUri: resolve('mute') } : {}),
      ...(resolve('deafen') ? { deafenUri: resolve('deafen') } : {})
    },
    assetCount: validatedAssets.length,
    totalAssetBytes
  };
}
