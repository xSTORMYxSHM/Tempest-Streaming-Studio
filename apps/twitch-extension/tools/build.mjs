import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.join(appDirectory, 'src');
const outputDirectory = path.join(appDirectory, 'dist');

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(sourceDirectory, outputDirectory, { recursive: true });
const configuredEbsUrl = String(process.env.TEMPEST_EXTENSION_EBS_URL || '').trim().replace(/\/$/, '');
if (configuredEbsUrl) {
  const url = new URL(configuredEbsUrl);
  const localDevelopment = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localDevelopment) throw new Error('TEMPEST_EXTENSION_EBS_URL must use HTTPS, except for localhost development.');
  if (url.username || url.password || url.search || url.hash) throw new Error('TEMPEST_EXTENSION_EBS_URL must be a clean service origin without credentials, query, or fragment.');
}
await writeFile(path.join(outputDirectory, 'runtime-config.json'), `${JSON.stringify({
  schemaVersion: 1,
  ebsBaseUrl: configuredEbsUrl,
  mockMode: !configuredEbsUrl
}, null, 2)}\n`, 'utf8');
console.log(`Built Twitch Extension assets in ${outputDirectory}`);
