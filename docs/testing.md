# Testing Phosphor

Every change comes with a test. The tests run on every pull request and before every deploy: if one
fails, the site isn't deployed.

```bash
npm test               # everything: lint, unit, browser, end-to-end
npm run test:unit      # pure logic, in Node (a second or two)
npm run test:browser   # the store, canvas and WebGL, in Chromium (a few seconds)
npm run test:e2e       # real clicks and keys against a production build (under a minute)
npm run test:update    # rewrite the reference files (read the diff before committing)
```

The first time, install the browser: `npx playwright install --with-deps chromium`.

## Which layer a test belongs in

| What you're testing | Layer | Where |
| --- | --- | --- |
| A function that takes values and returns values (cells, colors, bytes, widths, parsing) | unit | `tests/unit/*.test.js` |
| The store, or anything that needs a real canvas, WebGL, fonts or image decoding | browser | `tests/browser/*.test.js` |
| What happens when someone clicks, drags, types or presses a shortcut in the UI | end-to-end | `tests/e2e/*.spec.js` |

Pick the lowest layer that can see the bug. A unit test is fastest and says exactly what broke; an
end-to-end test is for things only the real UI can get wrong (focus, events, dialogs, downloads).

### Unit

Plain Vitest in Node, as in `tests/unit/wide-chars.test.js`:

```js
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { overwrites } from '../../src/document/wideChars.js';

test('typing over a wide character\'s trail turns its lead into a space', () => {
  const cells = [{ char: '漢', wide: 'lead' }, { char: '漢', wide: 'trail' }, { char: 'a' }];
  assert.deepEqual(overwrites(cells, 3, 1, 0, 1), [0]);
});
```

### Browser

Vitest in Chromium, driving the stores directly (no UI mounted). `createTestApp()` gives fresh
stores with the display font loaded; `loadImage` and `settle` load a fixture and wait for the render.
Read results from `project.cells` (char, fg, bg), not from the screen. From
`tests/browser/wide-chars.test.js` (shortened):

```js
import { createTestApp, loadImage } from '../support/app.js';

test('a wide character takes two columns; the last column refuses it', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  expect(project.typeAt(19, 1, '漢', { fg: '#ffffff', bg: '#000000' })).toBe(false);
});
```

`tests/support/scenes.js` has a ready-made document with a bit of everything drawn on it.

### End-to-end

Playwright against `npm run build` served by `vite preview`. Act through the UI only (roles, labels,
the mouse and keyboard); read the stores with `store(page, 'project', (p) => ...)` to check the result.
Take `test` and `expect` from `./support.js` (lint insists): its `test` cuts the page off from the
SOCIAL server, so no spec reaches the network; a SOCIAL spec fakes it with `fakeServer` from
`./social-support.js`.
From `tests/e2e/edit-drag-select.spec.js`:

```js
import { test, expect, openApp, store, cellPoint, drag } from './support.js';

test('a drag in Edit Mode becomes a Select selection', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Edit Mode' }).click();
  await drag(page, await cellPoint(page, 3, 3), await cellPoint(page, 8, 6));
  expect(await store(page, 'workspace', (w) => w.selection)).toEqual({ c0: 3, r0: 3, c1: 8, r1: 6 });
});
```

## Testing SOCIAL without its server

The SOCIAL tab talks to a server that these tests never reach. Each layer stands in for it differently:

- **Unit** (`tests/unit/social-*.test.js`): the pure modules in `src/social/` (the API helper,
  lobby state, names, messages). No network.
- **Browser** (`tests/browser/social-*.test.js`): `SocialStore` and the key and Turnstile modules in
  Chromium, with `fetch` stubbed by `vi.stubGlobal` (a small fake API that records each request) and a
  fake `WebSocket` class the test answers for the server. WebCrypto and IndexedDB are the real ones.
- **End-to-end** (`tests/e2e/social-*.spec.js`): `fakeServer(page, { me, rooms, ... })` from
  `tests/e2e/social-support.js` answers the API through `page.route` and the lobby socket through
  `page.routeWebSocket`, records every request and message, and lets a spec push lobby messages or
  drop the connection. Without it, the default `test` in `tests/e2e/support.js` aborts every request
  to `localhost:8787` and closes every socket, so a spec that forgot to fake the server fails
  instead of reaching a real one.

### Rooms end to end

A room spec runs two pages (a host and a watcher, in one browser context) that share one
`fakeRoom({ password, allowGuests, max, full })` from `tests/e2e/social-support.js`. Each page's
`fakeServer` gets it as `room`; the fake answers the room sockets as the Room does and passes the
host's messages to the watchers, so the specs click through starting, joining, following and ending
without a real server. The connection between the two pages is a real WebRTC one:

- The e2e build is made with `VITE_SOCIAL_STUN=none` (in `playwright.config.js`), so no STUN server
  is asked for and nothing leaves the machine.
- Chromium hides local addresses behind mDNS names, which two pages on one machine can't resolve to
  each other, so the browsers launch with `WebRtcHideLocalIpsWithMdns` off (both `vitest.config.js` and
  `playwright.config.js`).
- Chromium keeps only the last `--disable-features` it's given, and Playwright passes its own. So
  `launchWithout` in `tests/support/chromiumArgs.js` reads Playwright's list from a browser it
  launches while the config loads, and passes Playwright's features and ours as one list.

### Room connections on macOS

The room tests (`tests/browser/social-peer.test.js`) connect two WebRTC peers inside Chromium, which
needs the machine to let that Chromium receive UDP. With the macOS firewall on (stealth mode
especially), Playwright's ad-hoc-signed browser has its incoming packets dropped: the first
connection may work and the next ones time out. Allow it once, for the headless shell the tests
launch (`~/Library/Caches/ms-playwright/chromium_headless_shell-<version>/...`, the
`chrome-headless-shell` binary inside):

```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add <path to chrome-headless-shell>
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp <path to chrome-headless-shell>
```

Redo it after a Playwright browser update, which installs a new binary at a new path. Linux and CI
need nothing.

## Running one test

```bash
npm run test:unit -- cells             # files matching "cells"
npm run test:browser -- bake
npx playwright test merge-dialog
npx playwright test --headed export    # watch it run
npm run test:browser -- -t "last column"   # by test name
```

Failed browser tests leave a screenshot under `.vitest/attachments/`; failed end-to-end tests leave a
trace under `test-results/` (`npx playwright show-trace <path>`).

## Software WebGL

The image pipeline runs on WebGL, and GPUs round differently. Both browser layers launch Chromium
with SwiftShader (software WebGL), locally and in CI, so a conversion gives the same cells on every
machine and can be compared exactly. If a Chromium update shifts its rendering, the reference tests
fail everywhere at once: regenerate the references (below) and check the diff is a level here and
there, not a changed picture.

## Reference files

`tests/fixtures/reference/` holds outputs the tests must reproduce exactly: export bytes, converted
cells, loaded projects' cells. A reference is a claim that today's output is right. They're written
only by `npm run test:update`; a missing or different reference fails the test.

When you change output on purpose, run `npm run test:update`, then read `git diff
tests/fixtures/reference` and commit only what you meant to change.

## Turning a bug report into a test

1. Put the reporter's file under `tests/fixtures/`: an image in `images/`, a project in `projects/`,
   named for the issue (`projects/issue-42.phosphor`).
2. Add it to the test for its kind: `IMAGES` in `tests/browser/images.test.js`, `FIXTURES` in
   `tests/browser/projects.test.js`, or a grid in `tests/unit/export.test.js` for an export problem.
3. Make the test say what should happen (a cell, a byte, a round trip), watch it fail, then fix the
   app until it passes.

`tests/fixtures/README.md` lists every fixture and how it was made (`npm run fixtures` rebuilds the
generated ones).
