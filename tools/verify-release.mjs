import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedVersion = JSON.parse(await readFile(path.join(workspace, 'package.json'), 'utf8')).version;
const expectedPublisher = 'CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US';
const packageFiles = [
  'package.json', 'apps/studio-desktop/package.json', 'apps/twitch-extension/package.json',
  'services/tempest-bridge/package.json', 'services/twitch-ebs/package.json',
  'services/warudo-adapter/package.json', 'services/vtube-studio-adapter/package.json',
  'packages/tempest-contracts/package.json'
];

for (const relativePath of packageFiles) {
  const value = JSON.parse(await readFile(path.join(workspace, relativePath), 'utf8'));
  if (value.version !== expectedVersion) throw new Error(`${relativePath} is ${value.version}; expected ${expectedVersion}.`);
}

for (const relativePath of ['LICENSE', 'TRADEMARKS.md', 'CHANGELOG.md', 'docs/INSTALLATION.md', 'docs/PRIVACY.md', 'docs/THIRD_PARTY_NOTICES.md']) {
  if (!(await stat(path.join(workspace, relativePath))).isFile()) throw new Error(`${relativePath} is missing.`);
}

const releaseDirectory = path.join(workspace, 'release');
const names = await readdir(releaseDirectory);
const setupName = `Tempest-Streaming-Studio-Setup-${expectedVersion}-x64.exe`;
const blockmapName = `${setupName}.blockmap`;
const updateMetadataName = 'latest.yml';
const zipName = `Tempest-Streaming-Studio-${expectedVersion}-x64.zip`;
for (const name of [setupName, blockmapName, updateMetadataName, zipName]) if (!names.includes(name)) throw new Error(`${name} is missing from release/.`);

const updateMetadata = await readFile(path.join(releaseDirectory, updateMetadataName), 'utf8');
if (!new RegExp(`^version: ['\"]?${expectedVersion.replaceAll('.', '\\.')}['\"]?$`, 'm').test(updateMetadata)) throw new Error(`${updateMetadataName} does not advertise ${expectedVersion}.`);
if (!updateMetadata.includes(setupName) || !/^sha512:\s*\S+/m.test(updateMetadata) || !/^\s*size:\s*\d+/m.test(updateMetadata)) throw new Error(`${updateMetadataName} is missing signed installer update metadata.`);

const unpackedResources = path.join(releaseDirectory, 'win-unpacked', 'resources');
for (const relativePath of ['app.asar', 'twitch-extension/panel.html', 'tools/create-extension-certificate.ps1', 'avatar-controllers/warudo/TempestPerformanceNode.cs']) {
  if (!(await stat(path.join(unpackedResources, relativePath))).isFile()) throw new Error(`Packaged resource ${relativePath} is missing.`);
}
const forbidden = [];
const walk = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const itemPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(itemPath);
    else if (/\.(?:pfx|p12|pem|key|env)$/i.test(entry.name) || /^\.env/i.test(entry.name)) forbidden.push(path.relative(releaseDirectory, itemPath));
  }
};
await walk(path.join(releaseDirectory, 'win-unpacked'));
if (forbidden.length) throw new Error(`Release contains forbidden secret/certificate files: ${forbidden.join(', ')}`);

const artifacts = [];
for (const name of [setupName, blockmapName, updateMetadataName, zipName]) {
  const filePath = path.join(releaseDirectory, name);
  const bytes = await readFile(filePath);
  artifacts.push({ name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}

const readAuthenticodeSignature = (filePath) => {
  if (process.platform !== 'win32') return { status: 'Unavailable', subject: '', thumbprint: '', timestamped: false };
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$securityModule = Join-Path $env:SystemRoot "System32\\WindowsPowerShell\\v1.0\\Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1"',
    'Import-Module $securityModule',
    '$signature = Get-AuthenticodeSignature -LiteralPath $env:TEMPEST_SIGNATURE_TARGET',
    '$result = [pscustomobject]@{ status = [string]$signature.Status; subject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { "" }; thumbprint = if ($signature.SignerCertificate) { $signature.SignerCertificate.Thumbprint } else { "" }; timestamped = $null -ne $signature.TimeStamperCertificate }',
    '$result | ConvertTo-Json -Compress'
  ].join('; ');
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return JSON.parse(execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    env: { ...process.env, TEMPEST_SIGNATURE_TARGET: filePath }
  }));
};

const collectCodeFiles = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const itemPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectCodeFiles(itemPath));
    else if (/\.(?:exe|dll|pyd)$/i.test(entry.name)) files.push(itemPath);
  }
  return files;
};

const signatureRecord = (filePath, baseDirectory) => ({
  path: path.relative(baseDirectory, filePath).replaceAll(path.sep, '/'),
  ...readAuthenticodeSignature(filePath)
});

const unpackedDirectory = path.join(releaseDirectory, 'win-unpacked');
const unpackedSignatures = [];
for (const filePath of (await collectCodeFiles(unpackedDirectory)).sort()) {
  unpackedSignatures.push(signatureRecord(filePath, unpackedDirectory));
}

const zipVerificationDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-studio-verify-'));
let zipSignatures;
try {
  execFileSync('tar.exe', ['-xf', path.join(releaseDirectory, zipName), '-C', zipVerificationDirectory], { stdio: 'pipe' });
  zipSignatures = [];
  for (const filePath of (await collectCodeFiles(zipVerificationDirectory)).sort()) {
    zipSignatures.push(signatureRecord(filePath, zipVerificationDirectory));
  }
} finally {
  await rm(zipVerificationDirectory, { recursive: true, force: true });
}

const signatures = {
  installer: readAuthenticodeSignature(path.join(releaseDirectory, setupName)),
  unpackedPayload: unpackedSignatures,
  zipPayload: zipSignatures
};
const allSignatures = [signatures.installer, ...signatures.unpackedPayload, ...signatures.zipPayload];
const signed = allSignatures.length > 1 && allSignatures.every((signature) =>
  signature.status === 'Valid' && signature.timestamped && signature.subject === expectedPublisher
);

await writeFile(path.join(releaseDirectory, 'SHA256SUMS.txt'), `${artifacts.map((entry) => `${entry.sha256}  ${entry.name}`).join('\n')}\n`);
await writeFile(path.join(releaseDirectory, 'release-manifest.json'), `${JSON.stringify({ schemaVersion: 1, product: 'Tempest Streaming Studio', version: expectedVersion, platform: 'win32', arch: 'x64', generatedAt: new Date().toISOString(), signed, signatures, artifacts }, null, 2)}\n`);
if (!signed) throw new Error('Every installer and portable payload executable must have a valid, timestamped Tempest publisher signature.');
console.log(`TEMPEST_RELEASE_VERIFIED ${expectedVersion} signed=${signed} ${artifacts.map((entry) => `${entry.name}:${entry.size}`).join(' ')}`);
