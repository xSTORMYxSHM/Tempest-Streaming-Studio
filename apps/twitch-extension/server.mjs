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
const port = Number(process.env.TEMPEST_EXTENSION_PORT) || (httpPreview ? 8081 : 8080);
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml']
]);

const requestHandler = async (request, response) => {
  try {
    const requestUrl = new URL(request.url || '/', `${httpPreview ? 'http' : 'https'}://localhost:${port}`);
    const requestedPath = requestUrl.pathname === '/' ? '/video_component.html' : requestUrl.pathname;
    const decodedPath = decodeURIComponent(requestedPath).replaceAll('\\', '/');
    const filePath = path.resolve(rootDirectory, `.${decodedPath}`);
    const relativePath = path.relative(rootDirectory, filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) throw new Error('Path is outside the Extension asset root.');
    const details = await stat(filePath);
    if (!details.isFile()) throw new Error('Asset is not a file.');
    const content = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' https://extension-files.twitch.tv; connect-src 'self' https:; img-src 'self' data:; style-src 'self'; frame-ancestors https://supervisor.ext-twitch.tv https://extension-files.twitch.tv https://*.twitch.tv https://*.twitch.tech https://localhost.twitch.tv:* https://localhost.twitch.tech:* http://localhost.rig.twitch.tv:*",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    });
    response.end(content);
  } catch (error) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end((error instanceof Error ? error.message : 'Not found') + '\n');
  }
};

let server;
if (httpPreview) {
  server = createHttpServer(requestHandler);
} else {
  let pfx;
  try {
    pfx = await readFile(pfxPath);
  } catch {
    console.error(`Local HTTPS certificate not found at ${pfxPath}`);
    console.error('Run: powershell -ExecutionPolicy Bypass -File tools/create-extension-certificate.ps1');
    process.exit(1);
  }
  server = createHttpsServer({ pfx, passphrase }, requestHandler);
}

server.listen(port, '127.0.0.1', () => {
  const baseUrl = `${httpPreview ? 'http' : 'https'}://localhost:${port}`;
  console.log(`Tempest Twitch Extension ${httpPreview ? 'visual preview' : 'local test'} server: ${baseUrl}/`);
  console.log(`Viewer component: ${baseUrl}/video_component.html`);
  console.log(`Panel viewer: ${baseUrl}/panel.html`);
  console.log(`Configuration: ${baseUrl}/config.html`);
});
