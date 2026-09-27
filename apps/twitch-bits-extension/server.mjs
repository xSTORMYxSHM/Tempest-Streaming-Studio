import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.join(appDirectory, 'dist');
const pfxPath = process.env.TEMPEST_EXTENSION_PFX || path.resolve(appDirectory, '..', '..', '.tempest-extension', 'localhost.pfx');
const passphrase = process.env.TEMPEST_EXTENSION_PFX_PASSWORD || 'tempest-local-dev';
const httpPreview = process.env.TEMPEST_EXTENSION_HTTP_PREVIEW === '1';
const port = Number(process.env.TEMPEST_BITS_EXTENSION_PORT) || (httpPreview ? 8082 : 8083);
const mimeTypes = new Map([['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml']]);

const requestHandler = async (request, response) => {
  try {
    const requestUrl = new URL(request.url || '/', `${httpPreview ? 'http' : 'https'}://localhost:${port}`);
    const requestedPath = requestUrl.pathname === '/' ? '/video_overlay.html' : requestUrl.pathname;
    const filePath = path.resolve(rootDirectory, `.${decodeURIComponent(requestedPath).replaceAll('\\', '/')}`);
    const relativePath = path.relative(rootDirectory, filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath) || !(await stat(filePath)).isFile()) throw new Error('Asset not found.');
    response.writeHead(200, {
      'Content-Type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' https://extension-files.twitch.tv; connect-src 'self' https:; img-src 'self' data:; style-src 'self'; frame-ancestors https://supervisor.ext-twitch.tv https://extension-files.twitch.tv https://*.twitch.tv https://*.twitch.tech https://localhost.twitch.tv:* https://localhost.twitch.tech:* http://localhost.rig.twitch.tv:*",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    });
    response.end(await readFile(filePath));
  } catch (error) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(`${error instanceof Error ? error.message : 'Not found'}\n`);
  }
};

let server;
if (httpPreview) server = createHttpServer(requestHandler);
else {
  try { server = createHttpsServer({ pfx: await readFile(pfxPath), passphrase }, requestHandler); }
  catch {
    console.error(`Local HTTPS certificate not found at ${pfxPath}`);
    process.exit(1);
  }
}
server.listen(port, '127.0.0.1', () => {
  const base = `${httpPreview ? 'http' : 'https'}://localhost:${port}`;
  console.log(`Tempest Bits Extension preview: ${base}/video_overlay.html`);
  console.log(`Component: ${base}/video_component.html`);
  console.log(`Panel: ${base}/panel.html`);
  console.log(`Mobile: ${base}/mobile.html`);
  console.log(`Configuration: ${base}/config.html`);
});
