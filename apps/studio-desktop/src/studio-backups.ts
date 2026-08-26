import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

interface BackupAsset {
  id: string;
  extension: string;
  size: number;
  sha256: string;
  data: string;
}

export interface TempestStudioBackupDocument {
  schemaVersion: 1;
  type: 'tempest.studio-backup';
  productVersion: string;
  exportedAt: string;
  documents: Record<string, unknown>;
  rendererSettings: Record<string, unknown>;
  assets: BackupAsset[];
  exclusions: string[];
}

const safeDocuments = new Map([
  ['registry', ['bridge', 'registry.json']],
  ['chatbot', ['bridge', 'chatbot.json']],
  ['twitchAlerts', ['bridge', 'twitch-visual-alerts.json']],
  ['twitchIntegration', ['bridge', 'twitch-integration.json']],
  ['interactionAlerts', ['bridge', 'sound-alerts.json']],
  ['chatOverlay', ['bridge', 'chat-overlay.json']],
  ['panelDesign', ['twitch-panel-design.json']]
]);
const mediaExtensions = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.mp4', '.webm']);
const maximumAssetBytes = 96 * 1024 * 1024;
const maximumTotalBytes = 500 * 1024 * 1024;
const assetPrefix = 'tempest-backup-asset:';
const exclusions = ['Twitch OAuth tokens', 'chatbot OAuth tokens', 'Twitch Extension secret', 'GIPHY API key', 'registered asset file paths', 'application launch paths', 'playback history'];
const copy = <T>(value: T): T => structuredClone(value);

async function readJsonIfAvailable(filePath: string): Promise<unknown | undefined> {
  try { return JSON.parse(await readFile(filePath, 'utf8')) as unknown; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error(`Could not back up ${path.basename(filePath)}: ${(error as Error).message}`);
  }
}

function sanitizeRegistry(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const registry = copy(value as Record<string, unknown>);
  registry.applications = Array.isArray(registry.applications) ? registry.applications.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const application = copy(entry as Record<string, unknown>);
    delete application.launch;
    return application;
  }) : [];
  registry.assets = [];
  return registry;
}

export async function buildTempestStudioBackup(input: { userDataDirectory: string; productVersion: string; rendererSettings?: unknown }): Promise<TempestStudioBackupDocument> {
  const documents: Record<string, unknown> = {};
  for (const [key, segments] of safeDocuments) {
    const value = await readJsonIfAvailable(path.join(input.userDataDirectory, ...segments));
    if (value !== undefined) documents[key] = key === 'registry' ? sanitizeRegistry(value) : value;
  }
  const assets = new Map<string, BackupAsset>();
  let totalBytes = 0;
  const packUri = async (uri: string): Promise<string> => {
    const url = new URL(uri);
    if (url.protocol !== 'file:') return uri;
    const filePath = fileURLToPath(url);
    const extension = path.extname(filePath).toLowerCase();
    if (!mediaExtensions.has(extension)) throw new Error(`${path.basename(filePath)} uses an unsupported backup media format.`);
    const details = await stat(filePath);
    if (!details.isFile() || details.size > maximumAssetBytes) throw new Error(`${path.basename(filePath)} exceeds the 96 MB backup limit for one media file.`);
    const bytes = await readFile(filePath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (!assets.has(sha256)) {
      totalBytes += bytes.length;
      if (totalBytes > maximumTotalBytes) throw new Error('Studio backup media exceeds the 500 MB total limit.');
      assets.set(sha256, { id: sha256, extension, size: bytes.length, sha256, data: bytes.toString('base64') });
    }
    return `${assetPrefix}${sha256}`;
  };
  for (const documentKey of ['interactionAlerts', 'twitchAlerts']) {
    const document = documents[documentKey];
    if (!document || typeof document !== 'object' || Array.isArray(document)) continue;
    const alerts = Array.isArray((document as Record<string, unknown>).alerts) ? (document as Record<string, unknown>).alerts as Array<Record<string, unknown>> : [];
    for (const alert of alerts) {
      if (typeof alert.audioUri === 'string') alert.audioUri = await packUri(alert.audioUri);
      if (typeof alert.visualUri === 'string') alert.visualUri = await packUri(alert.visualUri);
      if (Array.isArray(alert.alertVariants)) for (const variant of alert.alertVariants as Array<Record<string, unknown>>) {
        if (typeof variant.audioUri === 'string') variant.audioUri = await packUri(variant.audioUri);
        if (typeof variant.visualUri === 'string') variant.visualUri = await packUri(variant.visualUri);
      }
    }
  }
  return {
    schemaVersion: 1,
    type: 'tempest.studio-backup',
    productVersion: String(input.productVersion || 'unknown').slice(0, 30),
    exportedAt: new Date().toISOString(),
    documents,
    rendererSettings: input.rendererSettings && typeof input.rendererSettings === 'object' && !Array.isArray(input.rendererSettings) ? copy(input.rendererSettings as Record<string, unknown>) : {},
    assets: [...assets.values()],
    exclusions
  };
}

function validateAsset(value: unknown, index: number): { asset: BackupAsset; bytes: Buffer } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Backup media ${index + 1} is invalid.`);
  const source = value as Record<string, unknown>;
  const sha256 = String(source.sha256 || '').toLowerCase();
  const extension = String(source.extension || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256) || source.id !== sha256 || !mediaExtensions.has(extension)) throw new Error(`Backup media ${index + 1} has invalid metadata.`);
  if (typeof source.data !== 'string') throw new Error(`Backup media ${index + 1} has no data.`);
  const bytes = Buffer.from(source.data, 'base64');
  if (bytes.length !== Number(source.size) || bytes.length > maximumAssetBytes) throw new Error(`Backup media ${index + 1} has an invalid size.`);
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error(`Backup media ${index + 1} failed its integrity check.`);
  return { asset: { id: sha256, extension, size: bytes.length, sha256, data: source.data }, bytes };
}

export async function restoreTempestStudioBackup(value: unknown, userDataDirectory: string, beforeCommit?: () => Promise<void>): Promise<{ documentCount: number; assetCount: number; rendererSettings: Record<string, unknown>; snapshotDirectory: string; productVersion: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Studio backup must be an object.');
  const backup = value as Partial<TempestStudioBackupDocument>;
  if (backup.schemaVersion !== 1 || backup.type !== 'tempest.studio-backup') throw new Error('This is not a supported Tempest Studio backup.');
  if (!backup.documents || typeof backup.documents !== 'object' || Array.isArray(backup.documents)) throw new Error('Studio backup has no configuration documents.');
  for (const key of Object.keys(backup.documents)) if (!safeDocuments.has(key)) throw new Error(`Studio backup contains an unsupported document: ${key}.`);
  if (!Array.isArray(backup.assets) || backup.assets.length > 300) throw new Error('Studio backup contains too many media files.');
  const validatedAssets = backup.assets.map(validateAsset);
  if (validatedAssets.reduce((sum, entry) => sum + entry.bytes.length, 0) > maximumTotalBytes) throw new Error('Studio backup media exceeds the 500 MB total limit.');
  const restoredDocuments = copy(backup.documents as Record<string, unknown>);
  const assetIds = new Set(validatedAssets.map((entry) => entry.asset.id));
  const replaceReferences = (node: unknown): unknown => {
    if (typeof node === 'string' && node.startsWith(assetPrefix)) {
      const id = node.slice(assetPrefix.length);
      if (!assetIds.has(id)) throw new Error('Studio backup references missing media.');
      const asset = validatedAssets.find((entry) => entry.asset.id === id)!.asset;
      return pathToFileURL(path.join(userDataDirectory, 'bridge', 'visual-alerts', 'restored', `${id}${asset.extension}`)).href;
    }
    if (Array.isArray(node)) return node.map(replaceReferences);
    if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([key, entry]) => [key, replaceReferences(entry)]));
    return node;
  };
  for (const [key, document] of Object.entries(restoredDocuments)) restoredDocuments[key] = replaceReferences(document);
  await beforeCommit?.();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotDirectory = path.join(userDataDirectory, 'restore-snapshots', stamp);
  await mkdir(snapshotDirectory, { recursive: true });
  for (const [key, segments] of safeDocuments) {
    const sourcePath = path.join(userDataDirectory, ...segments);
    await copyFile(sourcePath, path.join(snapshotDirectory, `${key}.json`)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
  }
  const mediaDirectory = path.join(userDataDirectory, 'bridge', 'visual-alerts', 'restored');
  await mkdir(mediaDirectory, { recursive: true });
  for (const { asset, bytes } of validatedAssets) await writeFile(path.join(mediaDirectory, `${asset.id}${asset.extension}`), bytes, { mode: 0o600 });
  for (const [key, document] of Object.entries(restoredDocuments)) {
    const segments = safeDocuments.get(key)!;
    const targetPath = path.join(userDataDirectory, ...segments);
    await mkdir(path.dirname(targetPath), { recursive: true });
    const temporaryPath = `${targetPath}.restore.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, targetPath);
  }
  return { documentCount: Object.keys(restoredDocuments).length, assetCount: validatedAssets.length, rendererSettings: backup.rendererSettings && typeof backup.rendererSettings === 'object' && !Array.isArray(backup.rendererSettings) ? copy(backup.rendererSettings as Record<string, unknown>) : {}, snapshotDirectory, productVersion: String(backup.productVersion || 'unknown') };
}
