import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const CURRENT_STUDIO_DATA_VERSION = 4;

export interface StudioDataMigrationStatus {
  schemaVersion: 1;
  dataVersion: number;
  productVersion: string;
  updatedAt: string;
  appliedMigrations: string[];
  snapshotDirectory?: string;
  migrated: boolean;
}

interface StoredMigrationState {
  schemaVersion: 1;
  dataVersion: number;
  productVersion: string;
  updatedAt: string;
  appliedMigrations: string[];
}

const migrationStateName = 'studio-data-version.json';
const snapshotFiles = [
  ['registry', 'bridge', 'registry.json'],
  ['chatbot', 'bridge', 'chatbot.json'],
  ['twitch-alerts', 'bridge', 'twitch-visual-alerts.json'],
  ['twitch-integration', 'bridge', 'twitch-integration.json'],
  ['interaction-alerts', 'bridge', 'sound-alerts.json'],
  ['chat-overlay', 'bridge', 'chat-overlay.json'],
  ['emote-wall', 'bridge', 'emote-wall.json'],
  ['twitch-experiences', 'bridge', 'twitch-experiences.json'],
  ['panel-design', 'twitch-panel-design.json']
] as const;

async function fileExists(filePath: string): Promise<boolean> {
  return Boolean(await stat(filePath).catch(() => null));
}

async function readStoredState(filePath: string): Promise<StoredMigrationState | null> {
  try {
    const value = JSON.parse(await readFile(filePath, 'utf8')) as Partial<StoredMigrationState>;
    if (value.schemaVersion !== 1 || !Number.isInteger(value.dataVersion) || Number(value.dataVersion) < 0 || !Array.isArray(value.appliedMigrations)) {
      throw new Error('Studio data-version metadata is invalid.');
    }
    return {
      schemaVersion: 1,
      dataVersion: Number(value.dataVersion),
      productVersion: String(value.productVersion || 'unknown'),
      updatedAt: String(value.updatedAt || ''),
      appliedMigrations: value.appliedMigrations.map(String)
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.migration.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporaryPath, filePath);
}

async function createMigrationSnapshot(userDataDirectory: string): Promise<string | undefined> {
  const available = [] as Array<{ label: string; sourcePath: string }>;
  for (const [label, ...segments] of snapshotFiles) {
    const sourcePath = path.join(userDataDirectory, ...segments);
    if (await fileExists(sourcePath)) available.push({ label, sourcePath });
  }
  if (!available.length) return undefined;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotDirectory = path.join(userDataDirectory, 'migration-snapshots', stamp);
  await mkdir(snapshotDirectory, { recursive: true });
  for (const item of available) await copyFile(item.sourcePath, path.join(snapshotDirectory, `${item.label}.json`));
  return snapshotDirectory;
}

async function migrateTwitchAlertCatalog(userDataDirectory: string, migration: 'alert-variants' | 'runtime-fields'): Promise<boolean> {
  const filePath = path.join(userDataDirectory, 'bridge', 'twitch-visual-alerts.json');
  let document: unknown;
  try { document = JSON.parse(await readFile(filePath, 'utf8')) as unknown; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw new Error(`Could not migrate Twitch Alert settings: ${(error as Error).message}`);
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Could not migrate Twitch Alert settings because the catalog is invalid.');
  const alerts = (document as Record<string, unknown>).alerts;
  if (!Array.isArray(alerts)) throw new Error('Could not migrate Twitch Alert settings because its alerts list is invalid.');
  let changed = false;
  for (const entry of alerts) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const alert = entry as Record<string, unknown>;
    if (migration === 'alert-variants' && !Array.isArray(alert.alertVariants)) {
      alert.alertVariants = [];
      changed = true;
    }
    if (migration === 'runtime-fields') {
      for (const key of ['selectedVariantId', 'selectedVariantName']) {
        if (key in alert) {
          delete alert[key];
          changed = true;
        }
      }
    }
  }
  if (changed) await writeJsonAtomic(filePath, document);
  return changed;
}

export async function runStudioDataMigrations(input: { userDataDirectory: string; productVersion: string }): Promise<StudioDataMigrationStatus> {
  const statePath = path.join(input.userDataDirectory, migrationStateName);
  const stored = await readStoredState(statePath);
  const startingVersion = stored?.dataVersion || 0;
  if (startingVersion > CURRENT_STUDIO_DATA_VERSION) {
    throw new Error(`This Studio data was created by a newer release (data version ${startingVersion}). Install a current Tempest Streaming Studio build instead of downgrading.`);
  }
  if (startingVersion === CURRENT_STUDIO_DATA_VERSION) {
    return { ...stored!, migrated: false };
  }

  const snapshotDirectory = await createMigrationSnapshot(input.userDataDirectory);
  const appliedMigrations = [...(stored?.appliedMigrations || [])];
  if (startingVersion < 1) appliedMigrations.push('1: establish versioned Studio data');
  if (startingVersion < 2) {
    await migrateTwitchAlertCatalog(input.userDataDirectory, 'alert-variants');
    appliedMigrations.push('2: initialize Twitch Alert variant collections');
  }
  if (startingVersion < 3) {
    await migrateTwitchAlertCatalog(input.userDataDirectory, 'runtime-fields');
    appliedMigrations.push('3: remove transient alert playback selections');
  }
  if (startingVersion < 4) appliedMigrations.push('4: register Twitch Experiences settings');
  const updatedAt = new Date().toISOString();
  const next: StoredMigrationState = {
    schemaVersion: 1,
    dataVersion: CURRENT_STUDIO_DATA_VERSION,
    productVersion: String(input.productVersion || 'unknown').slice(0, 30),
    updatedAt,
    appliedMigrations
  };
  await writeJsonAtomic(statePath, next);
  return { ...next, ...(snapshotDirectory ? { snapshotDirectory } : {}), migrated: true };
}
