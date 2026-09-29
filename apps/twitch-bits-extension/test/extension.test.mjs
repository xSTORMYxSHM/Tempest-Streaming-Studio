import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFile(path.join(appDirectory, 'dist', name), 'utf8');

test('ships every Twitch Extension surface and configuration view', async () => {
  const files = await Promise.all(['video_overlay.html', 'video_component.html', 'panel.html', 'mobile.html', 'config.html'].map(read));
  assert.match(files[0], /data-surface="overlay"/);
  assert.match(files[1], /data-surface="component"/);
  assert.match(files[2], /data-surface="panel"/);
  assert.match(files[3], /data-surface="mobile"/);
  for (const html of files) {
    assert.match(html, /twitch-ext\.min\.js/);
    assert.doesNotMatch(html, /http-equiv="Content-Security-Policy"/i);
  }
});

test('uses Twitch Bits APIs and submits signed receipts only through the EBS', async () => {
  const script = await read('viewer.js');
  assert.match(script, /features\?\.isBitsEnabled/);
  assert.match(script, /bits\.getProducts\(\)/);
  assert.match(script, /twitchProductsLoadedAt/);
  assert.match(script, /If-None-Match/);
  assert.match(script, /serverResponse\.status === 304/);
  assert.match(script, /productRefreshPromise/);
  assert.match(script, /fetchWithTimeout/);
  assert.match(script, /controller\.abort\(\)/);
  assert.match(script, /state\.auth\?\.token !== authToken/);
  assert.match(script, /bits\.useBits\(product\.sku\)/);
  assert.match(script, /\/v1\/extension\/bits\/reservations/);
  assert.match(script, /reservationToken/);
  assert.match(script, /onTransactionComplete/);
  assert.match(script, /initiator === 'current_user'/);
  assert.match(script, /transactionReceipt/);
  assert.match(script, /\/v1\/extension\/bits\/transactions/);
  assert.doesNotMatch(script, /(?:client|shared)[_ -]?secret\s*[:=]/i);
});

test('uses the live legal page and Twitch-compliant Bits wording', async () => {
  const html = (await Promise.all(['video_overlay.html', 'video_component.html', 'panel.html', 'mobile.html', 'config.html'].map(read))).join('\n');
  assert.match(html, /https:\/\/tempestmainframe\.com\/legal#privacy/);
  assert.match(html, /https:\/\/tempestmainframe\.com\/legal#terms/);
  assert.doesNotMatch(html, /\b(?:buy|purchase|donate|cheer|spend|cost)\b/i);
});

test('generates a public runtime configuration without credentials', async () => {
  const runtime = JSON.parse(await read('runtime-config.json'));
  assert.equal(runtime.schemaVersion, 1);
  assert.equal(runtime.ebsBaseUrl, 'https://signal.tempestmainframe.com');
  assert.equal(runtime.mockMode, false);
  assert.equal(Object.keys(runtime).some((key) => /secret|token/i.test(key)), false);
});
