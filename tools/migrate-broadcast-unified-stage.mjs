import { copyFile, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const collectionPath = args.find((value) => !value.startsWith('--'));

if (!collectionPath) {
  throw new Error('Pass the absolute Tempest Broadcast scene-collection JSON path.');
}

const legacyVisualNames = new Set([
  'Tempest HUD // Chat Terminal',
  'Twitch Alerts',
  'Interaction Alerts',
  'Twitch Experiences',
  'Discord Reactive',
  'Emote Wall',
  'Dice',
  'Poll'
]);
const legacyGroupNames = new Set(['Alerts Main']);

const document = JSON.parse(await readFile(collectionPath, 'utf8'));
const sources = Array.isArray(document.sources) ? document.sources : [];
const unifiedSource = sources.find((source) =>
  source?.id === 'browser_source' &&
  typeof source?.settings?.url === 'string' &&
  source.settings.url.includes('/unified-stage')
);

if (!unifiedSource) {
  throw new Error('The scene collection has no Unified Stage browser source. Add it before migrating legacy sources.');
}

const changes = [];
const changedSources = new Set();

function setSetting(source, key, value) {
  source.settings ||= {};
  if (source.settings[key] === value) return;
  source.settings[key] = value;
  changes.push(`${source.name}: ${key}=${value}`);
  changedSources.add(source.name);
}

setSetting(unifiedSource, 'shutdown', true);
setSetting(unifiedSource, 'restart_when_active', true);

for (const source of sources) {
  if (source?.id !== 'browser_source') continue;
  if (legacyVisualNames.has(source.name) || source.name === 'Interaction Audio') {
    setSetting(source, 'shutdown', true);
    setSetting(source, 'restart_when_active', true);
  }
}

for (const scene of sources) {
  const items = Array.isArray(scene?.settings?.items) ? scene.settings.items : [];
  const hasActiveUnifiedStage = items.some((item) => item?.name === unifiedSource.name && item.visible !== false);
  if (!hasActiveUnifiedStage) continue;
  const retained = items.filter((item) => {
    if (!legacyVisualNames.has(item?.name) && !legacyGroupNames.has(item?.name)) return true;
    changes.push(`${scene.name}: detach ${item.name}`);
    return false;
  });
  if (retained.length !== items.length) scene.settings.items = retained;
}

const groups = Array.isArray(document.groups) ? document.groups : [];
const referencedGroupNames = new Set(
  sources.flatMap((source) => Array.isArray(source?.settings?.items)
    ? source.settings.items.map((item) => item?.name).filter(Boolean)
    : [])
);
document.groups = groups.filter((group) => {
  if (!legacyGroupNames.has(group?.name) || referencedGroupNames.has(group.name)) return true;
  changes.push(`remove unreferenced legacy group: ${group.name}`);
  return false;
});

const referencedNames = new Set(
  [...sources, ...document.groups].flatMap((source) => Array.isArray(source?.settings?.items)
    ? source.settings.items.map((item) => item?.name).filter(Boolean)
    : [])
);
document.sources = sources.filter((source) => {
  if (source?.id !== 'browser_source' || !legacyVisualNames.has(source.name) || referencedNames.has(source.name)) return true;
  changes.push(`remove unreferenced legacy source: ${source.name}`);
  return false;
});

const report = {
  collection: document.name || path.basename(collectionPath),
  unifiedSource: unifiedSource.name,
  unifiedUrl: unifiedSource.settings.url,
  legacySourcesProtected: [...legacyVisualNames].filter((name) => changedSources.has(name)),
  changeCount: changes.length,
  changes
};

if (!apply) {
  console.log(JSON.stringify({ mode: 'dry-run', ...report }, null, 2));
  process.exit(0);
}

const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const backupPath = `${collectionPath}.pre-unified-${stamp}.bak`;
const temporaryPath = `${collectionPath}.unified-stage.tmp`;
await copyFile(collectionPath, backupPath);
await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
await rename(temporaryPath, collectionPath);
console.log(JSON.stringify({ mode: 'applied', backupPath, ...report }, null, 2));
