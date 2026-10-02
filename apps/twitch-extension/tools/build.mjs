import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.join(appDirectory, 'src');
const outputDirectory = path.join(appDirectory, 'dist');
const officialEbsUrl = 'https://signal.tempestmainframe.com';

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(sourceDirectory, outputDirectory, { recursive: true });
// Twitch validates every configured Asset Hosting surface as a literal ZIP
// entry. The responsive viewer supports component, fullscreen, and mobile
// surfaces, so keep those entry paths as byte-identical aliases.
for (const alias of ['mobile.html', 'video_overlay.html', 'video_fullscreen.html']) {
  await cp(path.join(sourceDirectory, 'video_component.html'), path.join(outputDirectory, alias));
}
const mockMode = process.env.TEMPEST_EXTENSION_MOCK_MODE === '1';
const configuredEbsUrl = String(mockMode ? '' : process.env.TEMPEST_EXTENSION_EBS_URL || officialEbsUrl).trim().replace(/\/$/, '');
if (configuredEbsUrl) {
  const url = new URL(configuredEbsUrl);
  const localDevelopment = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localDevelopment) throw new Error('TEMPEST_EXTENSION_EBS_URL must use HTTPS, except for localhost development.');
  if (url.username || url.password || url.search || url.hash) throw new Error('TEMPEST_EXTENSION_EBS_URL must be a clean service origin without credentials, query, or fragment.');
}
await writeFile(path.join(outputDirectory, 'runtime-config.json'), `${JSON.stringify({
  schemaVersion: 1,
  ebsBaseUrl: configuredEbsUrl,
  mockMode
}, null, 2)}\n`, 'utf8');
console.log(`Built Twitch Extension assets in ${outputDirectory}`);
