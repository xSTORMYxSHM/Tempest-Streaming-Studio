import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionDirectory = path.join(workspace, 'apps', 'twitch-extension');
const extensionOutput = path.join(extensionDirectory, 'dist');
const officialEbsOrigin = 'https://signal.tempestmainframe.com';
const archiveArgument = process.argv.indexOf('--archive');
const archivePath = archiveArgument >= 0 ? path.resolve(process.argv[archiveArgument + 1] || '') : '';

const requiredFiles = [
  'alerts.json',
  'assets/storm-horizon-sh.png',
  'assets/tempest-mark.svg',
  'config.html',
  'config.js',
  'interactions.json',
  'panel.html',
  'runtime-config.json',
  'styles.css',
  'video_component.html',
  'viewer.js'
];

const walk = async (directory, prefix = '') => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name), relativePath));
    else files.push(relativePath);
  }
  return files;
};

for (const relativePath of requiredFiles) {
  const file = path.join(extensionOutput, ...relativePath.split('/'));
  if (!(await stat(file)).isFile()) throw new Error(`Hosted Extension file ${relativePath} is missing.`);
}

const files = await walk(extensionOutput);
const forbiddenFiles = files.filter((file) => (
  /(^|\/)(?:\.env|node_modules)(?:\/|$)/i.test(file)
  || /\.(?:pfx|p12|pem|key|crt|cer|db|sqlite\d?|map|ts)$/i.test(file)
));
if (forbiddenFiles.length) throw new Error(`Hosted Extension contains forbidden files: ${forbiddenFiles.join(', ')}`);

const runtime = JSON.parse(await readFile(path.join(extensionOutput, 'runtime-config.json'), 'utf8'));
if (runtime.schemaVersion !== 1 || runtime.ebsBaseUrl !== officialEbsOrigin || runtime.mockMode !== false) {
  throw new Error(`Hosted Extension runtime-config.json must target ${officialEbsOrigin} with mock mode disabled.`);
}
if (Object.keys(runtime).some((key) => /secret|token|password|credential/i.test(key))) {
  throw new Error('Hosted Extension runtime-config.json contains a credential-shaped field.');
}

const browserCode = await Promise.all(['viewer.js', 'config.js'].map((file) => readFile(path.join(extensionOutput, file), 'utf8')));
if (/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])/i.test(browserCode.join('\n'))) {
  throw new Error('Hosted Extension browser code contains a localhost endpoint.');
}
const publicText = await Promise.all(files.filter((file) => /\.(?:html|js|css|json|svg)$/i.test(file)).map((file) => readFile(path.join(extensionOutput, ...file.split('/')), 'utf8')));
if (/Tempest Mainframe \(Free\)|\bfree Extension\b/i.test(publicText.join('\n'))) {
  throw new Error('Hosted Extension contains retired edition branding.');
}

const dockerfiles = await Promise.all([
  readFile(path.join(workspace, 'Dockerfile'), 'utf8'),
  readFile(path.join(workspace, 'services', 'twitch-ebs', 'Dockerfile'), 'utf8')
]);
for (const dockerfile of dockerfiles) {
  if (!/FROM node:24-alpine AS runtime/.test(dockerfile)
    || !/deploy --prod \/prod\/ebs/.test(dockerfile)
    || !/USER node/.test(dockerfile)
    || !/\/health/.test(dockerfile)
    || !/CMD \["node", "dist\/cli\.js"\]/.test(dockerfile)) {
    throw new Error('The Railway Dockerfile must use the production EBS runtime, non-root user, and healthcheck.');
  }
}

if (!(await stat(path.join(workspace, 'services', 'twitch-ebs', 'dist', 'cli.js'))).isFile()) {
  throw new Error('The hosted EBS build output is missing. Run pnpm ebs:build first.');
}

const extensionPackage = JSON.parse(await readFile(path.join(extensionDirectory, 'package.json'), 'utf8'));
const studioPackage = JSON.parse(await readFile(path.join(workspace, 'package.json'), 'utf8'));
const ebsPackage = JSON.parse(await readFile(path.join(workspace, 'services', 'twitch-ebs', 'package.json'), 'utf8'));
if (JSON.stringify(ebsPackage.files) !== JSON.stringify(['dist'])) {
  throw new Error('The production EBS package must publish only its compiled dist directory.');
}
const result = {
  schemaVersion: 1,
  product: 'Tempest Streaming Extension',
  extensionVersion: extensionPackage.version,
  studioSourceVersion: studioPackage.version,
  ebsOrigin: officialEbsOrigin,
  mockMode: false,
  files: files.sort()
};

if (archivePath) {
  const archive = await readFile(archivePath);
  result.archive = {
    name: path.basename(archivePath),
    size: archive.length,
    sha256: createHash('sha256').update(archive).digest('hex')
  };
  result.generatedAt = new Date().toISOString();
  const manifestPath = path.join(path.dirname(archivePath), 'hosted-release-manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

console.log(`TEMPEST_HOSTED_RELEASE_VERIFIED extension=${result.extensionVersion} studio=${result.studioSourceVersion} files=${result.files.length}${result.archive ? ` archive=${result.archive.name} sha256=${result.archive.sha256}` : ''}`);
