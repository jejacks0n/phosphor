# Working on Phosphor

Phosphor is a Vue 3 + Pinia app that turns images into ANSI art and lets you draw on it. People
extend it for their own use; these notes are for anyone (person or coding agent) changing it.

## Commands

```bash
npm install
npx playwright install --with-deps chromium   # once, for the browser and end-to-end tests
npm run dev                       # http://localhost:5173
npm test                          # lint, unit, browser and end-to-end tests: run before you call a change done
npm run test:unit                 # or one layer: test:unit, test:browser, test:e2e
npm run test:update               # rewrite reference files (see below)
npm run build
npm run desktop                   # the desktop app (Electron), built first
npm run build:desktop             # the desktop build alone, in dist-desktop/ (packages: npx electron-builder)
npm run test:e2e:desktop          # the desktop app's end-to-end tests, not part of npm test
```

Addresses are path addresses (`/social`) on the web, so the host serves `index.html` for every path (Cloudflare
does). An old hash address (`/#/social`) is rewritten to its path on load. `VITE_ADDRESSES=hash npm run build` builds
hash addresses instead, and the desktop app always has them. The end-to-end tests run on the path build.

## Where things live

- `src/store/ProjectStore.js`: the document's state and getters. Its actions are in
  `src/store/project/`, one file per area, joined in `ProjectStore.js` by `combineActions` (which
  refuses a name defined twice):
  - `document.js`: new image or canvas, open, save, export, the filename, opening a project's parts
    (`openParts`), restoring what autosave kept (`restoreDocument`)
  - `rendering.js`: the grid's size, renders and recomposites, the cells the views show
  - `reading.js`: colors and cells under a point, without changing anything
  - `editLayer.js`: paint, typing, flipping, clearing the edit layer
  - `baseLayer.js`: the base layer's own pixels and pins
  - `selection.js`: copy, cut, paste and floating moves
  - `merging.js`: Merge up, Merge down, Into the image, Bake
  - `vector.js`: the vector layer's shapes: added, changed, restacked, deleted, and the cells they cover drawn again
  - `layers.js`: the layers' names, eyes and own character settings (`setLayerChars`), layers added, moved, deleted and duplicated, and the cells layer in use (`useLayer`)
  - `sliders.js`: slider moves as undo steps
  - `font.js`: the drawing's bitmap font (`setDrawingFont`) and the width it's drawn at (`setDrawingFontWidth`)
  - `history.js`: recording edits, undo and redo
  - `animation.js`: frames: moving between them, adding, deleting, reordering, timing, a whole movie's palette
  - `sharing.js`: the document shared with a room: slices of an edit going out, changes heard, undo asking the host
  - `sharingHost.js`: a host's side of that: the ledger kept, an artist's change numbered, the project, base and settings sent
  - `sharingArtist.js`: an artist's: slices held and sent, what's asked of the host, a check, the project opened
  - `handover.js`: the numbering moving between people: a host's reload, a handover, a new host, an artist who's ahead asked
  - `shared.js`: constants the groups share

  Actions call each other through `this` (they're all one store), so the files don't import each
  other. A new action goes in its area's file; `tests/browser/store-actions.test.js` lists every
  action, so update it with the new name.
- `src/store/WorkspaceStore.js`: the editor around the document: the tool, colors, selection, views.
- `src/composables/useAutosave.js`: writes the document to the browser as you work and brings it back,
  with `src/document/autosaveRules.js` (when, and what goes) and `src/document/autosaveStore.js` (the
  IndexedDB storage).
- `src/router.js` and `src/lib/addresses.js`: the address (which tab, SOCIAL page and room) and Back,
  Forward and reload. The stores are the truth; the router follows them, and `reconcile` is the one
  place that navigates. `addresses.js` is the table of paths, where an address may land, and the path an old hash
  address (`/#/social`) means.
- `src/document/frames.js` (a frame as data, what it resolves to) and `src/document/FrameBuilder.js` (a frame's cells, made the way a still's are), with `src/composables/usePlayback.js` (playing) and `src/lib/CastFile.js` and `src/lib/GifFile.js` (exports; a GIF's palette and file are made off the page in `src/lib/gifWorker.js`, with `src/lib/GifEncoder.js`): animation.
- `src/document/`: the document's data (layers, cells, history, files); `projectIO.js` holds the project's file forms and the `.pho` wrapper, a PNG with the project in its `phPr` chunk ([docs/pho.md](docs/pho.md); the picture is `cellsPng` in `src/lib/PngFile.js`); `src/lib/`: the libraries
  (cells, colors, the image pipeline, exports); `src/tools/`: one file per tool.
- What a cells layer holds (paint, paint blocks, characters of someone's own) and what paint, Merge down, Retouch,
  Colors only and the PIXEL view's Overlay do with each: [docs/model.md](docs/model.md), numbered rules that say where
  each lives and which tests hold it. Read it before changing any of those paths; a change to a rule changes it there,
  in the same commit, and its tests name the rule.
- The color layer ([docs/layers.md](docs/layers.md), The Color Layer): `src/components/ColorLayer.vue` (the box under the
  color pair, tabs Colors | Palettes), framed by `src/components/FloatingPanel.vue` (the character palette layer uses it
  too: small, floating, dialog and whole-window sizes); `ColorsPage.vue` (the picker) and `ColorPalettesPage.vue` (This
  drawing, Favorites, Library, Search Lospec, Use and Put back), with `ColorList.vue` (the Custom color list's editor in
  This drawing: swatches, the picked color, Import and Export) and `src/lib/colorList.js` (a list read, written and
  changed); `src/components/ArrowIcon.vue` draws every arrow (no arrow glyphs in templates or strings); favorites and the
  shipped set, `src/store/ColorLibraryStore.js` and `src/lib/colorPalettes.json`, written by `scripts/color-library.mjs`
  (`npm run colors`, run by hand, never in CI); Lospec, `src/lib/lospec.js` (a palette's slug, its address, its answer
  read), and `desktop/lospec.js` for the desktop app. Its tests are `color-list.test.js`, `lospec.test.js` and
  `desktop-lospec.test.js` in `tests/unit`, `color-layer.test.js`, `colors-page.test.js`, `color-palettes-page.test.js`,
  `color-list.test.js`, `color-library-store.test.js` and `desktop-color-palettes-page.test.js` in `tests/browser`, and
  `color-list.spec.js`, `color-keys.spec.js`, `color-palettes-phone.spec.js` and `colors.spec.js` in `tests/e2e`.
- The SOCIAL tab: `src/social/` (the network and crypto modules: API calls, the lobby socket, keys
  and passes, Turnstile, names, the server's error words; for rooms `wire.js` (messages between
  browsers), `peer.js` (WebRTC), `hosting.js`, `watching.js`, `pending.js` (an artist's changes with no number yet), `thumbnail.js`
  (the lobby picture) and `chat.js` (the text rule, the kept log and its pages, the allowance); and in `src/document/`,
  `ledger.js` (who drew what, for undo and the numbers) and `changes.js` (a change as data, its hash, the tail)),
  `src/store/SocialStore.js` (who you are, your pass, the lobby), `src/store/RoomStore.js` (the room
  you host or watch), `src/store/DrawingStore.js` (who's an artist, invitations, cursors; a host's side in `src/store/drawing/host.js`, an artist's in `src/store/drawing/artist.js`) and `src/components/social/` (one component per page; the chat is `ChatPanel.vue`, `ChatFoot.vue` and `ReportDialog.vue`; the question asked before anything of SOCIAL runs is `ConsentDialog.vue`, with the wait in `SocialStore.boot` and its version in `src/social/consent.js`). Its tests are the
  `social-*` files in `tests/unit`, `tests/browser` and `tests/e2e`; the end-to-end fake server is
  `tests/e2e/social-support.js` ([docs/testing.md](docs/testing.md)).
- The desktop app ([docs/desktop.md](docs/desktop.md)): the web app in Electron, with rooms by address and no server.
  The build is `VITE_DESKTOP=1`, and its branches sit behind `import.meta.env.VITE_DESKTOP === '1'`, so the web build
  leaves them out. `desktop/` is the Electron side: `main.js` (the windows, the `app://phosphor/` origin it serves
  `dist-desktop/` from, quitting), `preload.cjs` (`window.phosphorDesktop`, the page's one way in), `roomService.js`
  (the room API on this computer: greetings, asks, channels, hand-overs), `addresses.js` (where others can join),
  `selfPass.js` (passes checked in Node), `lospec.js` (the Palettes page's Search Lospec: one palette asked of
  lospec.com by its slug), `menu.js` (the menu bar, in the page's words), `files.js` (files opened,
  saved and kept in Open Recent) and `windows.js` (where a file opens, where a new window sits, the two-phase leave of
  a close or quit). The page's side: `src/social/desktop.js` (the door to the preload),
  `socketPeer.js` (a WebSocket in a data channel's shape), `address.js` (what someone types to join),
  `selfPass.js` (passes signed by their own key) and `windowKey.js` (a window's identity: the computer's key for one
  window at a time, its own for the others), with `src/components/social/DesktopStartPage.vue` in the lobby's
  place and `src/composables/useDesktopMenu.js` running the menu's commands and Check for Updates. Packaging is `electron-builder.yml` (the icon, `build/icon.png`, drawn by `node build/make-icon.mjs`; `build/installer.nsh` and `build/phosphor-mime.xml`, a `.pho` previewed as the PNG it is on Windows and Linux), released by `.github/workflows/desktop.yml` only on a version tag (`v1.2.3`, or `v1.2.3-beta` for a
  pre-release: package.json's version, higher by semver than every version tag before it, checked by
  `scripts/release-tag.mjs`, on a commit main's tests passed), which also publishes phosphor.work for a release (not a
  pre-release); every push to main publishes next.phosphor.work (`.github/workflows/deploy.yml`). Its
  tests are the `desktop-*` files in `tests/unit`, `tests/browser` (the `browser-desktop` project) and `tests/e2e`.
- Plugins ([docs/plugins.md](docs/plugins.md)): `src/plugins/` (`manifest.js`, a stranger's `phosphor-plugin.json` read
  into a clean manifest, and the color slots; `zip.js` and `package.js`, a folder, a `.zip` or a lone manifest read into
  the manifest and the script it names; `script.js`, a script's export read into clean solvers, brushes, shapes and
  filters; `icon.js`, a brush's or shape's SVG icon read and rebuilt, so none of a stranger's markup reaches the page;
  `solvers.js`, the registry of a script's parts (its solvers, brushes, shapes and filters by ref), the layer's options
  and the stand-ins; `filters.js`, a filter's values as a drawing keeps them (`filterOptions`) and the settings column's
  groups; `hangMark.js`, the mark a script leaves while it runs, so a plugin that froze the page starts off next time;
  `themes.js`, a theme value naming a plugin's theme, what it resolves to, the copy kept for `index.html`'s first paint,
  `?plugins=off`; `storage.js`, the IndexedDB records), `src/lib/PluginSolve.js` (a plugin solver's passes in
  JavaScript, the reference its shader must agree with; its shader's side is in `src/lib/ShapeMatcher.js`, and the
  agreement check in `src/document/Renderer.js`), `src/tools/pluginBrush.js` (a plugin brush as a tool, and a stroke's
  `paint`), `src/tools/pluginTool.js` (what a plugin's brushes and shapes share: their options in the toolbar, the hang
  mark on a first call, a failure said), the Shape tool's plugin shapes in `src/tools/vshape.js`, the plugin brushes
  beside the built-in tools in `src/tools/index.js` (`pluginTools`), a filter's passes in `src/lib/WebGLProcessor.js`
  (after the effects, before the color sliders), `src/store/PluginStore.js` (installed plugins, the themes on offer,
  Reload, Follow file and Allow, and the Marketplace's list and installs from it); the Marketplace: `listing.js` (a
  listing's rules: the wiki's links, reading `plugins.json`, raw URLs, what a card's button is), `hash.js` (sha256) and
  `market.js` (the page's fetches, hash-checked), `desktop/pluginList.js` (the desktop main process's two fetches:
  phosphor.work's list and raw GitHub only), `scripts/plugin-list.mjs` (builds `plugins.json` in CI, in
  `.github/workflows/deploy.yml` for next and `.github/workflows/desktop.yml` for a release, and refreshed by `.github/workflows/plugin-list.yml`),
  `src/components/PluginMarket.vue` (the Marketplace tab) and the fixture list `tests/fixtures/plugin-list.json` (the
  dev server answers `/plugins.json` with it, and its plugins' files at `/dev-raw/`, in raw GitHub's place, from
  `vite.config.js`'s `devRawFile`), `src/components/PluginsDialog.vue`, `src/components/SolverOptions.vue` (a solver's
  options in the Characters section, and a filter's in its group, which `src/components/ControlPanel.vue` draws after
  Image filters) and `src/composables/useTheme.js` (the theme on `<html>`; `index.html`'s inline script paints it before
  the app starts by the same rules). A plugin's script runs only after the person says Install; it is the one code a
  plugin brings. A plugin solver is a kind of By shape, with the rule R12 in [docs/model.md](docs/model.md); a plugin
  brush's paint follows R5 there. Its tests are the `plugin-*` files and `solver-options.test.js` in `tests/unit` and
  `tests/browser` (a brush's in `plugin-brush.test.js`, a shape's in `plugin-shape.test.js`, a filter's in
  `plugin-filters.test.js` and `plugin-filter-gpu.test.js`, an icon's in `tests/unit/plugin-icon.test.js`, the three
  examples' in `tests/browser/plugin-examples.test.js`), `tests/browser/plugins-dialog.test.js` and
  `tests/e2e/plugins.spec.js`, with the official plugins in `plugins/` (Midnight, a dark theme; Rain, a light one; Outlines, a solver; Smear, a
  brush; Superformula, a shape; and Aberration, a filter; they aren't in the app's build, and people install them from
  the Marketplace) and, in `tests/fixtures/plugins/`, `outlines.zip`, as GitHub makes one.
- `src/dev/actionLog.js` (and `skipped.js`, the actions it leaves out) and `src/components/dev/HistoryPanel.vue`: the
  development-only HISTORY tab, every step taken this session as a log to paste into a bug report ([docs/testing.md](docs/testing.md)).
- `server/`: a symlink to the SOCIAL server's own repo (`/server` is gitignored), so both can be
  worked on side by side. Commit and push inside `server/`; its commits go to its repo, never this
  one. A fresh checkout makes the link with `ln -s <the server's checkout> server`.

## Rules

- **Never describe how the server is built, anywhere in this repo.** Not in code, comments, tests,
  docs or commit messages: no names of its files, modules, classes, libraries, hosting, storage or
  layout. This repo talks about the server only as its API: paths, messages, fields and error codes.
  Whatever the server's internals are, they're documented in `server/` and nowhere else. The one
  exception is the Privacy Policy (in `src/components/LegalDialog.vue`), which names the services
  that handle people's data, Cloudflare among them, because the law asks it to.
- **Every change comes with a test in the right layer**: pure logic in `tests/unit`, the store,
  canvas, WebGL and a component mounted on its own in `tests/browser`, and in `tests/e2e` only what
  the whole page can get wrong (focus, real pointer events, downloads, reloads). A bug fix starts with
  a test that fails, in the lowest layer that sees it. [docs/testing.md](docs/testing.md) says which
  layer and how.
- **Moderation can be described, never how it decides.** Docs and UI may say that reports exist,
  what a report sends, that people can be silenced or suspended and what they see then. Nothing in UI
  copy, `docs/`, comments, tests or commit messages says how reports lead to silencing (how many, how
  fast, whose count, how long), since people would game it. Nor that anything happens on its own
  because of reports or silencing (a room leaving the lobby, say), nor what the admin can do. A
  reporter sees only "Reported. Thank you."; a silenced person only until when. The rules are the
  server's, documented in `server/`.
- **Reference files are claims.** Never run `npm run test:update` to make a failing test pass
  without reading `git diff tests/fixtures/reference` and knowing why every change is right.
- **QA scripts are claims too:** a change to a feature changes the persona scripts in `docs/qa/personas/`
  that walk it, in the same work ([docs/qa/README.md](docs/qa/README.md)).
- **A failing test blocks the deploy.** Don't skip or loosen a test to get past it; fix the cause,
  or say plainly that the test was wrong and why.
- Bug reports with a file: the file goes in `tests/fixtures/`, a case goes in its test (the routine is
  in [docs/testing.md](docs/testing.md)).
- User-facing behavior is described in `docs/` ([layers](docs/layers.md),
  [characters](docs/characters.md)); update it when behavior changes.
