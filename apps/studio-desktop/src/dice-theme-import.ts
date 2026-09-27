import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface ImportedDiceTheme {
  id: string;
  name: string;
  diceAvailable: string[];
  fileCount: number;
  totalBytes: number;
}

const maximumFiles = 96;
const maximumFileBytes = 64 * 1024 * 1024;
const maximumThemeBytes = 150 * 1024 * 1024;
const allowedExtensions = new Set(['.json', '.png', '.jpg', '.jpeg', '.webp']);
const supportedDice = new Set(['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']);
const reservedThemeIds = new Set(['default', 'smooth', 'gemstone', 'gemstonemarble', 'rock', 'rust', 'wooden', 'diceofrolling', 'bluegreenmetal']);

interface ThemeFile {
  relativePath: string;
  sourcePath: string;
  size: number;
}

function themeId(value: unknown): string {
  const id = String(value || '').trim();
  if (!/^[a-z][a-z0-9_-]{0,63}$/i.test(id)) throw new Error('The Dice Box theme systemName must use letters, numbers, underscores, or hyphens.');
  if (reservedThemeIds.has(id.toLowerCase())) throw new Error(`${id} is reserved by a built-in Dice Box theme.`);
  return id;
}

function assetReference(value: unknown, label: string, availableFiles: Set<string>): void {
  const reference = String(value || '').trim().replace(/\\/g, '/');
  if (!reference || reference.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${label} must point to an asset inside the selected theme folder.`);
  }
  if (!allowedExtensions.has(path.extname(reference).toLowerCase()) || !availableFiles.has(reference.toLowerCase())) {
    throw new Error(`${label} references a missing or unsupported theme asset: ${reference}.`);
  }
}

async function collectThemeFiles(root: string, directory = root, depth = 0): Promise<ThemeFile[]> {
  if (depth > 5) throw new Error('The Dice Box theme contains too many nested folders.');
  const files: ThemeFile[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Dice Box themes cannot contain symbolic links.');
    const sourcePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectThemeFiles(root, sourcePath, depth + 1));
    else if (entry.isFile()) {
      const extension = path.extname(entry.name).toLowerCase();
      if (!allowedExtensions.has(extension)) throw new Error(`${entry.name} is not a supported Dice Box theme asset.`);
      const details = await stat(sourcePath);
      if (details.size > maximumFileBytes) throw new Error(`${entry.name} exceeds the 64 MB theme-file limit.`);
      files.push({ relativePath: path.relative(root, sourcePath), sourcePath, size: details.size });
    }
    if (files.length > maximumFiles) throw new Error(`Dice Box themes can contain at most ${maximumFiles} files.`);
  }
  return files;
}

export async function importDiceBoxTheme(sourceDirectory: string, destinationRoot: string): Promise<ImportedDiceTheme> {
  const sourceDetails = await stat(sourceDirectory);
  if (!sourceDetails.isDirectory()) throw new Error('Choose a Dice Box theme folder containing theme.config.json.');
  const manifestPath = path.join(sourceDirectory, 'theme.config.json');
  const manifestDetails = await stat(manifestPath).catch(() => undefined);
  if (!manifestDetails?.isFile()) throw new Error('The selected folder does not contain theme.config.json.');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  const id = themeId(manifest.systemName);
  const name = String(manifest.name || id).trim().slice(0, 80) || id;
  if (manifest.extends) throw new Error('Imported Dice Box themes must be self-contained and cannot extend another theme.');
  if (!Array.isArray(manifest.diceAvailable)) throw new Error('The Dice Box theme does not declare diceAvailable.');
  const diceAvailable = [...new Set(manifest.diceAvailable.filter((die): die is string => typeof die === 'string' && supportedDice.has(die)))];
  if (!diceAvailable.length) throw new Error('The theme must include at least one standard die: d4, d6, d8, d10, d12, d20, or d100.');
  const files = await collectThemeFiles(sourceDirectory);
  const availableFiles = new Set(files.map((file) => file.relativePath.replace(/\\/g, '/').toLowerCase()));
  assetReference(manifest.meshFile, 'meshFile', availableFiles);
  const material = manifest.material && typeof manifest.material === 'object' && !Array.isArray(manifest.material) ? manifest.material as Record<string, unknown> : undefined;
  for (const [key, value] of Object.entries(material || {})) {
    if (!key.toLowerCase().endsWith('texture')) continue;
    if (typeof value === 'string') assetReference(value, `material.${key}`, availableFiles);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [variant, file] of Object.entries(value as Record<string, unknown>)) assetReference(file, `material.${key}.${variant}`, availableFiles);
    } else throw new Error(`material.${key} must point to a theme texture.`);
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > maximumThemeBytes) throw new Error('The Dice Box theme exceeds the 150 MB total limit.');
  await mkdir(destinationRoot, { recursive: true });
  const destination = path.resolve(destinationRoot, id);
  const root = path.resolve(destinationRoot);
  if (!destination.startsWith(`${root}${path.sep}`)) throw new Error('The Dice Box theme destination is invalid.');
  if (await stat(destination).then(() => true).catch(() => false)) throw new Error(`A Dice Box theme named ${id} is already installed.`);
  const staging = path.resolve(destinationRoot, `.import-${id}-${randomUUID()}`);
  if (!staging.startsWith(`${root}${path.sep}`)) throw new Error('The Dice Box theme staging path is invalid.');
  await mkdir(staging, { recursive: true });
  try {
    for (const file of files) {
      const target = path.resolve(staging, file.relativePath);
      if (!target.startsWith(`${staging}${path.sep}`)) throw new Error('The Dice Box theme contains an unsafe asset path.');
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, await readFile(file.sourcePath), { mode: 0o600 });
    }
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  return { id, name, diceAvailable, fileCount: files.length, totalBytes };
}
