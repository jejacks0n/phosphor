Phosphor's rules come from `AGENTS.md`, and that file binds everything you write. Read it and
`docs/testing.md` before you start.

- **A failing test first.** Write the test that shows the bug, in the lowest layer that sees it, and watch it fail
  before you change the code: pure logic in `tests/unit`; the store, canvas, WebGL and a component mounted on its own
  in `tests/browser`; and in `tests/e2e` only what the whole page can get wrong (focus, real pointer events, downloads,
  reloads). `docs/testing.md` says which layer and how. A bug report with a file puts the file in `tests/fixtures/`.
- **Reference files are claims.** Never run `npm run test:update` to make a test pass without reading
  `git diff tests/fixtures/reference` and knowing why every change is right.
- **A new store action** goes in its area's file in `src/store/project/`, and its name goes in
  `tests/browser/store-actions.test.js`.
- **Docs follow behavior.** When what a person sees changes, update the page in `docs/` that describes it, and the
  persona scripts in `docs/qa/personas/` that walk it. Keep every `Measured: <task>` line in them word for word.
- **Before you're done, run:**
  - `npm run lint`;
  - the unit and browser tests that cover your change: `npx vitest run --project unit tests/unit/<file>` and
    `npx vitest run --project browser tests/browser/<file>`, or the whole layer (`npm run test:unit`,
    `npm run test:browser`) when the change is in code many tests use.

  Up to 3 builders run at once, each in its own worktree. The browser tests are safe side by side: each run takes the
  next free port. The end-to-end tests aren't: their config serves the build on fixed ports, `4180` and `4181`, and
  reuses a server it finds there, so one builder's run would test another's build, and the config has no way to give
  it another port. So never run `npm test` or `npm run test:e2e`. When the bug belongs in `tests/e2e`, write the test
  there all the same; CI runs it on the pull request.
- **Never start a dev server** (`npm run dev`, `vite`, `vite preview`, `npm run qa`), and never use ports `5173` or
  `4180`.
- If `node_modules/` isn't there, run `npm install` (these worktrees skip setup), and
  `npx playwright install chromium` if the browser tests say Chromium is missing.
- **Never describe how the server is built**, anywhere: not in code, comments, tests, docs or commit messages. Talk
  about the SOCIAL server only as its API: paths, messages, fields and error codes. `server/` isn't part of this repo;
  if the item needs the server to change, don't build it: write `"ok": false` and say what the API would need.
- **Never say how moderation decides.** You may say that reports exist, what a report sends, and that people can be
  silenced or suspended and what they see then. Never how reports lead to silencing (how many, how fast, whose count,
  how long), that anything happens on its own because of them, or what the admin can do. Not in UI copy, docs,
  comments, tests or commit messages.
- **Commit messages** are one or two plain sentences saying what is now true, in the present tense, ending with a
  period: no prefix, no "fix:" or "feat:". More detail, when it's needed, goes in a second paragraph. For example:
  "A QA session always ends with a report, whatever stops it, and names its folder by the local day."
- **American spelling** (color, behavior, center), and plain words, in code, docs and commit messages.
