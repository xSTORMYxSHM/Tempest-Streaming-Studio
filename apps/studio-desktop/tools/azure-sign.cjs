const { execFile } = require('node:child_process');
const { access, mkdtemp, readdir, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const endpoint = 'https://wus2.codesigning.azure.net/';
const certificateProfileName = 'TempestSoftwarePublic';
const codeSigningAccountName = 'Tempest';
const expectedPublisher = 'CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US';
const timestampServer = 'http://timestamp.acs.microsoft.com';
const maxAttempts = 4;
let signingQueue = Promise.resolve();

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function newestDirectory(parentPath, namePrefix) {
  const entries = await readdir(parentPath, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(namePrefix))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  if (candidates.length === 0) throw new Error(`No ${namePrefix} installation found beneath ${parentPath}`);
  return path.join(parentPath, candidates[0]);
}

async function findSigningTools() {
  const trustedSigningRoot = path.join(process.env.LOCALAPPDATA, 'TrustedSigning');
  const sdkRoot = await newestDirectory(
    path.join(trustedSigningRoot, 'Microsoft.Windows.SDK.BuildTools'),
    'Microsoft.Windows.SDK.BuildTools.'
  );
  const clientRoot = await newestDirectory(
    path.join(trustedSigningRoot, 'Microsoft.Trusted.Signing.Client'),
    'Microsoft.Trusted.Signing.Client.'
  );
  const sdkVersionDirectories = (await readdir(path.join(sdkRoot, 'bin'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  if (sdkVersionDirectories.length === 0) {
    throw new Error(`No Windows SDK version directory found beneath ${path.join(sdkRoot, 'bin')}`);
  }

  const signtoolPath = path.join(sdkRoot, 'bin', sdkVersionDirectories[0], 'x64', 'signtool.exe');
  const dlibPath = path.join(clientRoot, 'bin', 'x64', 'Azure.CodeSigning.Dlib.dll');
  await Promise.all([access(signtoolPath), access(dlibPath)]);
  return { signtoolPath, dlibPath };
}

async function alreadySignedByTempest(filePath) {
  const command = [
    '$signature = Get-AuthenticodeSignature -LiteralPath $env:TEMPEST_AZURE_SIGN_FILE',
    '$result = $signature.Status -eq "Valid" -and $null -ne $signature.TimeStamperCertificate -and $signature.SignerCertificate.Subject -eq $env:TEMPEST_AZURE_SIGN_PUBLISHER',
    'if ($result) { exit 0 } else { exit 1 }'
  ].join('; ');
  try {
    await execFileAsync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      env: {
        ...process.env,
        TEMPEST_AZURE_SIGN_FILE: filePath,
        TEMPEST_AZURE_SIGN_PUBLISHER: expectedPublisher
      },
      windowsHide: true
    });
    return true;
  } catch {
    return false;
  }
}

async function signFile(filePath) {
  if (await alreadySignedByTempest(filePath)) {
    process.stdout.write(`Azure signature already valid and timestamped: ${filePath}\n`);
    return;
  }

  const { signtoolPath, dlibPath } = await findSigningTools();
  const metadataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-studio-sign-'));
  const metadataPath = path.join(metadataDirectory, 'metadata.json');
  await writeFile(
    metadataPath,
    `${JSON.stringify({ Endpoint: endpoint, CodeSigningAccountName: codeSigningAccountName, CertificateProfileName: certificateProfileName }, null, 2)}\n`,
    'utf8'
  );

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await execFileAsync(
          signtoolPath,
          ['sign', '/v', '/debug', '/fd', 'SHA256', '/tr', timestampServer, '/td', 'SHA256', '/dlib', dlibPath, '/dmdf', metadataPath, filePath],
          { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, windowsHide: true }
        );
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        if (!(await alreadySignedByTempest(filePath))) {
          throw new Error(`SignTool completed but the expected timestamped signature was not found on ${filePath}`);
        }
        return;
      } catch (error) {
        if (attempt === maxAttempts) throw error;
        process.stderr.write(`Azure signing attempt ${attempt} failed for ${filePath}; retrying.\n`);
        await delay(2500 * attempt);
      }
    }
  } finally {
    await rm(metadataDirectory, { recursive: true, force: true });
  }
}

async function collectSigningTargets(directory) {
  const targets = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const itemPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      targets.push(...await collectSigningTargets(itemPath));
    } else if (/\.(?:exe|dll|pyd)$/i.test(entry.name)) {
      targets.push(itemPath);
    }
  }
  return targets;
}

async function afterSign(context) {
  if (context.electronPlatformName !== 'win32') return;
  const targets = (await collectSigningTargets(context.appOutDir)).sort((left, right) => left.localeCompare(right));
  for (const target of targets) await signFile(target);
}

async function sign(configuration) {
  const task = signingQueue.then(() => signFile(configuration.path));
  signingQueue = task.catch(() => undefined);
  return task;
}

module.exports = { afterSign, sign };
