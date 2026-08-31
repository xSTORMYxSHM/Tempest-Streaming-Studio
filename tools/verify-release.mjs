import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedVersion = '1.0.0';
const packageFiles = [
  'package.json', 'apps/studio-desktop/package.json', 'apps/twitch-extension/package.json',
  'services/tempest-bridge/package.json', 'services/twitch-ebs/package.json',
  'services/warudo-adapter/package.json', 'packages/tempest-contracts/package.json'
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
const zipName = `Tempest-Streaming-Studio-${expectedVersion}-x64.zip`;
for (const name of [setupName, zipName]) if (!names.includes(name)) throw new Error(`${name} is missing from release/.`);

const unpackedResources = path.join(releaseDirectory, 'win-unpacked', 'resources');
for (const relativePath of ['app.asar', 'twitch-extension/panel.html', 'tools/create-extension-certificate.ps1']) {
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
for (const name of [setupName, zipName]) {
  const filePath = path.join(releaseDirectory, name);
  const bytes = await readFile(filePath);
  artifacts.push({ name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}

const readAuthenticodeSignature = (filePath) => {
  if (process.platform !== 'win32') return { status: 'Unavailable', subject: '', thumbprint: '' };
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$securityModule = Join-Path $env:SystemRoot "System32\\WindowsPowerShell\\v1.0\\Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1"',
    'Import-Module $securityModule',
    '$signature = Get-AuthenticodeSignature -LiteralPath $env:TEMPEST_SIGNATURE_TARGET',
    '$result = [pscustomobject]@{ status = [string]$signature.Status; subject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { "" }; thumbprint = if ($signature.SignerCertificate) { $signature.SignerCertificate.Thumbprint } else { "" } }',
    '$result | ConvertTo-Json -Compress'
  ].join('; ');
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return JSON.parse(execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    env: { ...process.env, TEMPEST_SIGNATURE_TARGET: filePath }
  }));
};

const signatures = {
  installer: readAuthenticodeSignature(path.join(releaseDirectory, setupName)),
  executable: readAuthenticodeSignature(path.join(releaseDirectory, 'win-unpacked', 'Tempest Streaming Studio.exe'))
};
const signed = signatures.installer.status === 'Valid' && signatures.executable.status === 'Valid';

await writeFile(path.join(releaseDirectory, 'SHA256SUMS.txt'), `${artifacts.map((entry) => `${entry.sha256}  ${entry.name}`).join('\n')}\n`);
await writeFile(path.join(releaseDirectory, 'release-manifest.json'), `${JSON.stringify({ schemaVersion: 1, product: 'Tempest Streaming Studio', version: expectedVersion, platform: 'win32', arch: 'x64', generatedAt: new Date().toISOString(), signed, signatures, artifacts }, null, 2)}\n`);
console.log(`TEMPEST_RELEASE_VERIFIED ${expectedVersion} signed=${signed} ${artifacts.map((entry) => `${entry.name}:${entry.size}`).join(' ')}`);
