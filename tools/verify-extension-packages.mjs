import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const officialEbsUrl = 'https://signal.tempestmainframe.com';
const packages = [
  {
    id: 'mainframe',
    directory: 'apps/twitch-extension',
    archivePrefix: 'tempest-mainframe',
    expectedVersion: '0.2.0',
    required: ['alerts.json', 'config.html', 'config.js', 'interactions.json', 'panel.html', 'runtime-config.json', 'styles.css', 'video_component.html', 'viewer.js'],
    forbidden: ['mobile.html', 'video_overlay.html', 'mock-catalog.json']
  },
  {
    id: 'streaming',
    directory: 'apps/twitch-bits-extension',
    archivePrefix: 'tempest-streaming',
    expectedVersion: '0.1.0',
    required: ['config.html', 'config.js', 'mobile.html', 'panel.html', 'runtime-config.json', 'styles.css', 'video_component.html', 'video_overlay.html', 'viewer.js'],
    forbidden: ['mock-catalog.json']
  }
];

const records = [];
for (const definition of packages) {
  const appDirectory = path.join(workspace, definition.directory);
  const packageJson = JSON.parse(await readFile(path.join(appDirectory, 'package.json'), 'utf8'));
  if (packageJson.version !== definition.expectedVersion) {
    throw new Error(`${definition.directory}/package.json is ${packageJson.version}; expected ${definition.expectedVersion}.`);
  }

  const distDirectory = path.join(appDirectory, 'dist');
  const distNames = (await readdir(distDirectory)).sort();
  for (const required of definition.required) {
    if (!distNames.includes(required) || !(await stat(path.join(distDirectory, required))).isFile()) {
      throw new Error(`${definition.id} dist is missing ${required}.`);
    }
  }
  for (const forbidden of definition.forbidden) {
    if (distNames.includes(forbidden)) throw new Error(`${definition.id} production dist contains forbidden asset ${forbidden}.`);
  }
  const unexpected = distNames.filter((name) => /(?:\.map$|^\.env|\.pem$|\.p(?:12|fx)$|\.key$)/i.test(name));
  if (unexpected.length) throw new Error(`${definition.id} production dist contains forbidden files: ${unexpected.join(', ')}.`);

  const runtimeConfig = JSON.parse(await readFile(path.join(distDirectory, 'runtime-config.json'), 'utf8'));
  if (runtimeConfig.ebsBaseUrl !== officialEbsUrl || runtimeConfig.mockMode !== false) {
    throw new Error(`${definition.id} runtime-config.json must use ${officialEbsUrl} with mockMode false.`);
  }

  for (const name of distNames.filter((entry) => /\.(?:html|js|css|json)$/i.test(entry))) {
    const contents = await readFile(path.join(distDirectory, name), 'utf8');
    if (/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?/i.test(contents)) {
      throw new Error(`${definition.id}/${name} contains a local development URL.`);
    }
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(contents)) {
      throw new Error(`${definition.id}/${name} contains private key material.`);
    }
  }

  const archiveName = `${definition.archivePrefix}-${definition.expectedVersion}.zip`;
  const archivePath = path.join(appDirectory, 'release-assets', archiveName);
  const archiveBytes = await readFile(archivePath);
  const archiveNames = execFileSync('tar.exe', ['-tf', archivePath], { encoding: 'utf8' })
    .split(/\r?\n/).map((name) => name.replace(/^\.\//, '').replace(/\/$/, '')).filter(Boolean);
  for (const required of definition.required) {
    if (!archiveNames.includes(required)) throw new Error(`${archiveName} is missing ${required}.`);
  }
  const forbiddenArchiveEntries = archiveNames.filter((name) => (
    definition.forbidden.includes(name)
    || /(?:\.map$|^\.env|\.pem$|\.p(?:12|fx)$|\.key$)/i.test(name)
  ));
  if (forbiddenArchiveEntries.length) throw new Error(`${archiveName} contains forbidden files: ${forbiddenArchiveEntries.join(', ')}.`);

  records.push({
    id: definition.id,
    version: definition.expectedVersion,
    archive: path.relative(workspace, archivePath).replaceAll(path.sep, '/'),
    size: archiveBytes.length,
    sha256: createHash('sha256').update(archiveBytes).digest('hex'),
    files: archiveNames.length,
    ebsBaseUrl: officialEbsUrl
  });
}

const manifestPath = path.join(workspace, 'release-assets', 'extension-package-manifest.json');
await mkdir(path.dirname(manifestPath), { recursive: true });
await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), packages: records }, null, 2)}\n`);
console.log(`TEMPEST_EXTENSION_PACKAGES_VERIFIED ${records.map((record) => `${record.id}@${record.version}:${record.files}files:${record.sha256}`).join(' ')}`);
