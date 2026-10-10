import { copyFile, mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { TempestAssetManifest } from '@tempest/contracts';
import { sha256File } from './file-checksum';

const audioExtensions = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);
const visualExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.mp4', '.webm']);
const maximumAudioBytes = 100 * 1024 * 1024;
const maximumVisualBytes = 200 * 1024 * 1024;

export interface ManagedMediaImport {
  manifest: TempestAssetManifest;
  path: string;
  size: number;
  reused: boolean;
}

export interface ManagedMediaImportOptions {
  originalName?: string;
  tags?: string[];
}

function mediaRole(extension: string, size: number): 'audio' | 'visual' {
  const role = audioExtensions.has(extension) ? 'audio' : visualExtensions.has(extension) ? 'visual' : undefined;
  if (!role) throw new Error('Media Library imports support MP3, WAV, OGG, M4A, AAC, FLAC, PNG, JPG, GIF, WebP, AVIF, MP4, or WebM files.');
  const maximumBytes = role === 'audio' ? maximumAudioBytes : maximumVisualBytes;
  if (size > maximumBytes) throw new Error(`${role === 'audio' ? 'Audio' : 'Visual'} library files must be ${maximumBytes / 1024 / 1024} MB or smaller.`);
  return role;
}

function mediaManifest(input: { destinationPath: string; checksumValue: string; extension: string; size: number; role: 'audio' | 'visual'; originalName: string; tags?: string[] }): TempestAssetManifest {
  const originalName = path.basename(input.originalName).slice(0, 180);
  const name = path.basename(originalName, input.extension).trim().slice(0, 120) || `${input.role} asset`;
  const tags = [...new Set([input.role, input.extension.slice(1), 'managed', ...(input.tags || []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean)])].slice(0, 20);
  const uri = pathToFileURL(input.destinationPath).href;
  return {
    schemaVersion: 1,
    id: `com.tempestmainframe.asset.sha256-${input.checksumValue.slice(0, 24)}-${input.extension.slice(1)}`,
    type: `tempest.media.${input.role}`,
    name,
    version: '1.0.0',
    producer: 'tempest-mainframe-studio',
    uri,
    checksum: `sha256:${input.checksumValue}`,
    tags,
    ...(input.role === 'visual' ? { preview: uri } : {}),
    metadata: { managed: true, size: input.size, extension: input.extension, originalName }
  };
}

async function existingManagedFile(destinationPath: string, size: number, checksumValue: string): Promise<boolean> {
  try {
    const destinationDetails = await stat(destinationPath);
    return destinationDetails.isFile() && destinationDetails.size === size && await sha256File(destinationPath) === checksumValue;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return false;
  }
}

function managedPath(uri: string, libraryDirectory: string): string {
  const url = new URL(uri);
  if (url.protocol !== 'file:') throw new Error('Only Studio-managed file assets can be removed.');
  const root = path.resolve(libraryDirectory);
  const candidate = path.resolve(fileURLToPath(url));
  if (path.dirname(candidate).toLowerCase() !== root.toLowerCase()) throw new Error('The asset is outside the Studio Media Library.');
  return candidate;
}

export async function importManagedMediaAsset(sourcePath: string, libraryDirectory: string, options: ManagedMediaImportOptions = {}): Promise<ManagedMediaImport> {
  const normalizedSource = path.resolve(sourcePath);
  const details = await stat(normalizedSource);
  if (!details.isFile()) throw new Error('The selected media asset is not a file.');
  const extension = path.extname(normalizedSource).toLowerCase();
  const role = mediaRole(extension, details.size);

  const checksumValue = await sha256File(normalizedSource);
  const destinationDirectory = path.resolve(libraryDirectory);
  await mkdir(destinationDirectory, { recursive: true });
  const destinationPath = path.join(destinationDirectory, `${checksumValue}${extension}`);
  const reused = await existingManagedFile(destinationPath, details.size, checksumValue);
  if (!reused) {
    const temporaryPath = path.join(destinationDirectory, `.${checksumValue}.${randomUUID()}.tmp`);
    try {
      await copyFile(normalizedSource, temporaryPath);
      await unlink(destinationPath).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
      await rename(temporaryPath, destinationPath);
    } finally {
      await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    }
  }

  const manifest = mediaManifest({ destinationPath, checksumValue, extension, size: details.size, role, originalName: options.originalName || path.basename(normalizedSource), tags: options.tags });
  return { manifest, path: destinationPath, size: details.size, reused };
}

export async function importManagedMediaBuffer(bytes: Buffer, extensionInput: string, libraryDirectory: string, options: ManagedMediaImportOptions = {}): Promise<ManagedMediaImport> {
  const extension = extensionInput.startsWith('.') ? extensionInput.toLowerCase() : `.${extensionInput.toLowerCase()}`;
  const role = mediaRole(extension, bytes.length);
  const checksumValue = createHash('sha256').update(bytes).digest('hex');
  const destinationDirectory = path.resolve(libraryDirectory);
  await mkdir(destinationDirectory, { recursive: true });
  const destinationPath = path.join(destinationDirectory, `${checksumValue}${extension}`);
  const reused = await existingManagedFile(destinationPath, bytes.length, checksumValue);
  if (!reused) {
    const temporaryPath = path.join(destinationDirectory, `.${checksumValue}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, bytes, { mode: 0o600 });
      await unlink(destinationPath).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
      await rename(temporaryPath, destinationPath);
    } finally {
      await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  const manifest = mediaManifest({ destinationPath, checksumValue, extension, size: bytes.length, role, originalName: options.originalName || `${role}-${checksumValue.slice(0, 8)}${extension}`, tags: options.tags });
  return { manifest, path: destinationPath, size: bytes.length, reused };
}

export async function removeManagedMediaAsset(uri: string, libraryDirectory: string): Promise<boolean> {
  const target = managedPath(uri, libraryDirectory);
  try {
    await unlink(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
