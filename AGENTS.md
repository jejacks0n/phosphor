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

## Rules

- **Every change comes with a test in the right layer**: pure logic in `tests/unit`, the store,
  canvas or WebGL in `tests/browser`, real UI interactions in `tests/e2e`. A bug fix starts with a
  test that fails. [docs/testing.md](docs/testing.md) says which layer and how.
- **Reference files are claims.** Never run `npm run test:update` to make a failing test pass
  without reading `git diff tests/fixtures/reference` and knowing why every change is right.
- **A failing test blocks the deploy.** Don't skip or loosen a test to get past it; fix the cause,
  or say plainly that the test was wrong and why.
- Bug reports with a file: the file goes in `tests/fixtures/`, a case goes in its test (the routine is
  in [docs/testing.md](docs/testing.md)).
- User-facing behavior is described in `docs/` ([layers](docs/layers.md),
  [characters](docs/characters.md)); update it when behavior changes.
- Never commit `docs/superpowers/` or `.superpowers/` (local planning notes).
