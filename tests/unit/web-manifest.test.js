// The page links its web app manifest, so Phosphor added to a home screen or the Dock opens in its own window,
// and the icons the manifest and the page name are files the site serves.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const served = (path) => existsSync(new URL(`public${path}`, root));

test('index.html links the manifest and the touch icon, and they exist', () => {
  const html = readFileSync(new URL('index.html', root), 'utf8');
  for (const rel of ['manifest', 'apple-touch-icon']) {
    const href = html.match(new RegExp(`<link rel="${rel}" href="([^"]+)">`))?.[1];
    assert.ok(href, `no <link rel="${rel}">`);
    assert.ok(served(href), `${href} isn't in public/`);
  }
});

test('the manifest opens standalone at the root, with icons that exist', () => {
  const manifest = JSON.parse(readFileSync(new URL('public/site.webmanifest', root), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.id, '/');
  for (const size of ['192x192', '512x512']) {
    const icon = manifest.icons.find((i) => i.sizes === size);
    assert.ok(icon, `no ${size} icon`);
    assert.ok(served(icon.src), `${icon.src} isn't in public/`);
  }
});
