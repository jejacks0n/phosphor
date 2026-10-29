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
```

## Where things live

- `src/store/ProjectStore.js`: the document's state and getters. Its actions are in
  `src/store/project/`, one file per area, joined in `ProjectStore.js` by `combineActions` (which
  refuses a name defined twice):
  - `document.js`: new image or canvas, open, save, export, the filename
  - `rendering.js`: the grid's size, renders and recomposites, the cells the views show
  - `reading.js`: colors and cells under a point, without changing anything
  - `editLayer.js`: paint, typing, flipping, clearing the edit layer
  - `baseLayer.js`: the base layer's own pixels and pins
  - `selection.js`: copy, cut, paste and floating moves
  - `merging.js`: Merge up, Merge down, Into the image, Bake
  - `sliders.js`: slider moves as undo steps
  - `history.js`: recording edits, undo and redo
  - `shared.js`: constants the groups share

  Actions call each other through `this` (they're all one store), so the files don't import each
  other. A new action goes in its area's file; `tests/browser/store-actions.test.js` lists every
  action, so update it with the new name.
- `src/store/WorkspaceStore.js`: the editor around the document: the tool, colors, selection, views.
- `src/document/`: the document's data (layers, cells, history, files); `src/lib/`: the libraries
  (cells, colors, the image pipeline, exports); `src/tools/`: one file per tool.
- The SOCIAL tab: `src/social/` (the network and crypto modules: API calls, the lobby socket, keys
  and passes, Turnstile, names, the server's error words; for rooms `wire.js` (messages between
  browsers), `peer.js` (WebRTC), `hosting.js`, `watching.js`, `thumbnail.js` (the lobby picture) and
  `chat.js` (the text rule, the kept log and its pages, the allowance)),
  `src/store/SocialStore.js` (who you are, your pass, the lobby), `src/store/RoomStore.js` (the room
  you host or watch) and `src/components/social/` (one component per page; the chat is `ChatPanel.vue`, `ChatFoot.vue` and `ReportDialog.vue`). Its tests are the
  `social-*` files in `tests/unit`, `tests/browser` and `tests/e2e`; the end-to-end fake server is
  `tests/e2e/social-support.js` ([docs/testing.md](docs/testing.md)).
- `server/`: a git submodule, the SOCIAL server's own repo. Work on it in place, but commit and push
  inside `server/` (its commits go to its repo, never this one); then commit the new `server`
  pointer here on its own. A fresh checkout gets it with
  `git -c protocol.file.allow=always submodule update --init` (its remote is a local path).

## Rules

- **Never describe how the server is built, anywhere in this repo.** Not in code, comments, tests,
  docs or commit messages: no names of its files, modules, classes, libraries, hosting, storage or
  layout. This repo talks about the server only as its API: paths, messages, fields and error codes.
  Whatever the server's internals are, they're documented in `server/` and nowhere else.
- **Every change comes with a test in the right layer**: pure logic in `tests/unit`, the store,
  canvas or WebGL in `tests/browser`, real UI interactions in `tests/e2e`. A bug fix starts with a
  test that fails. [docs/testing.md](docs/testing.md) says which layer and how.
- **Moderation can be described, never how it decides.** Docs and UI may say that reports exist,
  what a report sends, that people can be muted or suspended and what they see then. Nothing in UI
  copy, `docs/`, comments, tests or commit messages says how reports lead to a mute (how many, how
  fast, whose count, how long), since people would game it. Nor that anything happens on its own
  because of reports or a mute (a room leaving the lobby, say), nor what the admin can do. A
  reporter sees only "Reported. Thank you."; a muted person only until when. The rules are the
  server's, documented in `server/`.
- **Reference files are claims.** Never run `npm run test:update` to make a failing test pass
  without reading `git diff tests/fixtures/reference` and knowing why every change is right.
- **A failing test blocks the deploy.** Don't skip or loosen a test to get past it; fix the cause,
  or say plainly that the test was wrong and why.
- Bug reports with a file: the file goes in `tests/fixtures/`, a case goes in its test (the routine is
  in [docs/testing.md](docs/testing.md)).
- User-facing behavior is described in `docs/` ([layers](docs/layers.md),
  [characters](docs/characters.md)); update it when behavior changes.
