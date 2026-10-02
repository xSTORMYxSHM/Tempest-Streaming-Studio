import { copyFile, mkdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
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

function managedPath(uri: string, libraryDirectory: string): string {
  const url = new URL(uri);
  if (url.protocol !== 'file:') throw new Error('Only Studio-managed file assets can be removed.');
  const root = path.resolve(libraryDirectory);
  const candidate = path.resolve(fileURLToPath(url));
  if (path.dirname(candidate).toLowerCase() !== root.toLowerCase()) throw new Error('The asset is outside the Studio Media Library.');
  return candidate;
}

export async function importManagedMediaAsset(sourcePath: string, libraryDirectory: string): Promise<ManagedMediaImport> {
  const normalizedSource = path.resolve(sourcePath);
  const details = await stat(normalizedSource);
  if (!details.isFile()) throw new Error('The selected media asset is not a file.');
  const extension = path.extname(normalizedSource).toLowerCase();
  const role = audioExtensions.has(extension) ? 'audio' : visualExtensions.has(extension) ? 'visual' : undefined;
  if (!role) throw new Error('Media Library imports support MP3, WAV, OGG, M4A, AAC, FLAC, PNG, JPG, GIF, WebP, AVIF, MP4, or WebM files.');
  const maximumBytes = role === 'audio' ? maximumAudioBytes : maximumVisualBytes;
  if (details.size > maximumBytes) throw new Error(`${role === 'audio' ? 'Audio' : 'Visual'} library files must be ${maximumBytes / 1024 / 1024} MB or smaller.`);

  const checksumValue = await sha256File(normalizedSource);
  const checksum = `sha256:${checksumValue}`;
  const destinationDirectory = path.resolve(libraryDirectory);
  await mkdir(destinationDirectory, { recursive: true });
  const destinationPath = path.join(destinationDirectory, `${checksumValue}${extension}`);
  let reused = false;
  try {
    const destinationDetails = await stat(destinationPath);
    reused = destinationDetails.isFile() && destinationDetails.size === details.size && await sha256File(destinationPath) === checksumValue;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
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

  const name = path.basename(normalizedSource, extension).trim().slice(0, 120) || `${role} asset`;
  const manifest: TempestAssetManifest = {
    schemaVersion: 1,
    id: `com.tempestmainframe.asset.sha256-${checksumValue.slice(0, 24)}-${extension.slice(1)}`,
    type: `tempest.media.${role}`,
    name,
    version: '1.0.0',
    producer: 'tempest-mainframe-studio',
    uri: pathToFileURL(destinationPath).href,
    checksum,
    tags: [role, extension.slice(1), 'managed'],
    ...(role === 'visual' ? { preview: pathToFileURL(destinationPath).href } : {}),
    metadata: { managed: true, size: details.size, extension, originalName: path.basename(normalizedSource) }
  };
  return { manifest, path: destinationPath, size: details.size, reused };
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
