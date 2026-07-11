import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const directory = new URL('./', import.meta.url);

async function source(name) {
  return readFile(new URL(name, directory), 'utf8');
}

test('staging shell exposes passwordless sign-in and protected dashboard regions', async () => {
  const html = await source('index.html');

  assert.match(html, /id="sign-in-form"/);
  assert.match(html, /type="email"/);
  assert.match(html, /id="dashboard"[^>]*hidden/);
  assert.match(html, /id="sign-out"/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /service[_-]?role/i);
});

test('dashboard queries and labels publication targets separately from internal due dates', async () => {
  const app = await source('app.mjs');
  const browser = await source('browser.mjs');
  assert.match(app, /target_publish_at/);
  assert.match(browser, /formatTargetPublishAt\(assignment\.target_publish_at\)/);
  assert.match(browser, /Publication target/);
  assert.doesNotMatch(browser, /Due date/);
});

test('browser bootstrap uses runtime staging config and the tested controller', async () => {
  const browser = await source('browser.mjs');

  assert.match(browser, /window\.R2R_STAGING_CONFIG/);
  assert.match(browser, /createAuthController/);
  assert.match(browser, /onAuthStateChange/);
  assert.doesNotMatch(browser, /service[_-]?role/i);
});
