# QA runs

How a QA agent walks a persona's script against the real app, and how a reviewer checks the run. Follow it as
written: a run is unattended, and there's no one to ask.

## What a run is

A persona is a named person with a real reason to use Phosphor, and their file in `docs/qa/personas/` holds a script:
a walk through the app the way that person uses it. A run is one agent following one script in a real browser, with
traits drawn at random (device, input, language, theme, and for some personas an account, an interruption and a
partner), pushing around every step the way a person would and recording bugs, visual problems, slow steps, friction,
oversights and a keyboard score. A second agent, the reviewer, then confirms or drops each finding, so what reaches
the owner is judged, not a green check.

## Starting, driving, ending

A run is a session: one headless Chromium on this machine's GPU, kept open while you send it snippets (small
JavaScript files) one at a time and read what each did. Before you start:

- Work from a clean tree on the branch you're testing. The session builds the working tree and records `HEAD` as the
  app's commit, and the persona file's last commit as the script's version (`null` until the file is committed), so
  uncommitted changes to either are in the run but not in its record. It records whether there were any (`dirty` in
  `run.json`, "Uncommitted changes" in the report's header).
- Read the persona's file, the docs it walks (`docs/layers.md`, `docs/characters.md`, `docs/vector.md`,
  `docs/animation.md`, `docs/social.md`), and the Rules in `AGENTS.md`.
- Run one session at a time. Both commands find the session through `qa-runs/<persona>.latest`, and every session
  uses the same port.

Some traits shape the run beyond the browser:

- `account` (Juno and Theo): `guest` or `signedIn`. Fake the server for the page as that person:
  `social.fakeServer(page, { me: null })` for a guest, `social.fakeServer(page, { me: social.member() })` signed in.
  Fake the server before the person opens SOCIAL: a page that opened it unfaked has already been refused. A step the
  fake server can't reach is skipped (see [A step that can't be done](#a-step-that-cant-be-done)).
- `partner` (Juno only): the persona whose kind of work Juno draws in her room. Where Juno's script says to draw,
  draw as that persona would, with their files and sizes.
- `interruption`: see [Interruptions](#interruptions).

### The commands

```bash
QA_PERSONA=maya QA_SEED=3 npm run qa              # start a session; run it in the background
npm run qa:send -- maya qa-runs/snippets/01.mjs   # send a snippet, wait, print what it did
npm run qa:send -- maya --end                     # write report.md, end the session, print the report's path
npm run qa:smoke                                  # check the harness itself (not part of a run)
```

`npm run qa` builds the app into `dist-qa/`, serves it on the QA port, opens the persona's browser on the start
screen and prints `QA run: <folder>` once it's ready for snippets (the build takes about a minute). Wait for that
line before you send anything. Start it in the background with the longest timeout your shell allows (in Claude
Code, Bash with `run_in_background: true` and `timeout: 7200000`, two hours): a shorter one ends the session, and the
browser with it, partway through a run. It runs until you send `--end`, until it has had no snippet for `QA_IDLE_MIN` minutes,
or until it's stopped (Ctrl+C or a kill); every way of stopping writes `report.md`.

| Variable | Default | What it does |
| --- | --- | --- |
| `QA_PERSONA` | (required) | `maya`, `dex`, `priya`, `juno`, `theo`, `sam`, `lea` or `walt`. A misspelled one stops before the build; an unset one stops the session as it starts, after the build. |
| `QA_SEED` | random | A whole number. The same persona and seed always draw the same traits. Unset, a random seed is drawn and recorded. |
| `QA_RUN_DIR` | (dated) | The run's folder, when something hands the run its own (see [The run folder](#the-run-folder)). |
| `QA_PORT` | `4210` | The port the QA build is served on. Never `5173`, `4180` or `4181` (refused). A port in use stops the run: it never tests someone else's server. |
| `QA_SNIPPET_MS` | `120000` | How long a snippet may run before it's recorded as timed out. |
| `QA_IDLE_MIN` | `30` | Minutes with no snippet before the session ends itself. Your thinking time between snippets counts. |
| `QA_WAIT` | `180` | Seconds `qa:send` waits for an answer before it gives up (exit 1). |

If port 4210 is taken, find out what holds it (`lsof -nP -iTCP:4210 -sTCP:LISTEN`). A QA session you left running:
end it with `--end`. Anything else isn't yours to stop: start with another `QA_PORT` instead (say `4211`).

If a session ends before the run is done, start a new one at the same seed (`QA_SEED=<seed>`, so the traits are the
same), rebuild the state the next step needs, say what you rebuilt in a `qa.note` on the new session's first step, and
carry on from where the first stopped. The new session gets a folder of its own; give the reviewer both folders.

### The run folder

Each session gets `qa-runs/<local date>-<persona>-<seed>/` (a second session of the same seed on the same day gets
`-2`, then `-3`). `qa-runs/` is ignored by git, and so is `dist-qa/`.

When `QA_RUN_DIR` is set, the session uses exactly that folder instead, and makes it if it isn't there. A relative
path is from the repo's root. It's for a caller that hands each run its own folder (Porpoise does, with
`QA_RUN_DIR` under `qa-runs/`). A folder a session has already used is refused, so a session that ends early and
starts again needs a new one: name it after the first, with `-2`, then `-3`, beside it.

In the folder:

- `run.json`: everything recorded so far, rewritten after every call that records something.
- `report.md`: written when the session ends.

Never edit `run.json` or `report.md` by hand, during the run or after it: they're the record the reviewer judges. A
correction (a probe that went on the wrong step, a rating that was wrong) goes in a `qa.note`, saying what was wrong
and what's right.
- `shots/`: screenshots, named `001-<step>.png` and so on.
- `inbox/` and `outbox/`: the snippets as sent, and what each did (`outbox/<name>.json`).

The run's only output is its folder. Don't change any file in the repo outside `qa-runs/`, and don't commit. If a
script step looks wrong about the app, say so with `qa.note` on that step and walk it as the app is; don't edit the
script (the owner decides, and the next change to it is someone's work). Keep a short log of your own in the run folder
(`agent-log.md`): what you did at each step and anything odd, so the reviewer can follow you. If you're running out of
room to work (an agent's context, say), stop where you are and send `--end`: a run cut short with its report beats one
with none. Look at your screenshots as images (open the PNG), not only at the DOM.

Keep your snippet files in `qa-runs/snippets/` (or anywhere outside the tracked tree); `qa:send` copies each one into
the inbox under a new name, so you can send the same file again.

### The snippet contract

A snippet is an ES module whose default export is an async function. It's called with one object:

| Argument | What it is |
| --- | --- |
| `page` | The newest page of the context. Once a second page is open it may not be the persona's: see below. |
| `context` | The Playwright browser context (the person's browser: device, language, theme). |
| `browser` | The Playwright browser. |
| `qa` | The recorder (below). |
| `traits` | What was drawn: `{ persona, seed, device, input, language, theme, account, interruption, partner }`. |
| `runDir` | The run folder's absolute path (`qa` has no `runDir` of its own). |
| `e2e` | `tests/e2e/support.js`: `fixture(path)`, `imageInput(page)`, `settled(page)`, `store(page, name, read)`, `cellPoint`, `pixelPoint`, `drag`, `chars`, `tab`, `pickLayer`, `saveAs`, `autosaved` and the rest. |
| `social` | `tests/e2e/social-support.js`: the fake SOCIAL server (`fakeServer`, `fakeRoom`, `member`, `goLive`, `watcherPage`, `artistPage` and the rest). |
| `files` | `tests/qa/files.js`: the ANSI files the personas bring (see [Files](#files)). |
| `terminal` | `tests/qa/terminal.js`: a headless terminal to play exports in (see [Files](#files)). |
| `expect` | Playwright's `expect`. |

What the function returns comes back in the outbox, so keep it small and plain (a few values, a screenshot's path).
The answer `qa:send` prints is `{ "ok": true, "value": ..., "ms": ... }`, or `{ "ok": false, "error": "...", "ms":
..., "shot": "shots/..." }` when the snippet threw or ran out of time; the session takes a screenshot of a failure and
keeps serving the next snippet. What a failed snippet recorded before it failed stays recorded.

Keep each snippet to a step or part of one, so it finishes well inside `QA_SNIPPET_MS`. A snippet that times out isn't
stopped, only given up on: it may still be acting on the page when the next one starts. Every Playwright action gives
up after 10 s and every navigation after 30 s (`actionTimeout` and `navigationTimeout` in
`tests/qa/playwright.config.js`), so a leftover snippet fails at its next action rather than acting much later.
Playwright's own waits (`waitForFunction`, `waitForEvent`, `locator.waitFor`) are held to the same 10 s, and so are the
helpers built on them: `e2e.settled` and `e2e.saveAs` give up after 10 s. Opening or exporting a big file (Walt's
300×1600, a long GIF) can take longer, and a time-out there is the harness, not the app: for that one call, raise the
limit with `context.setDefaultTimeout(60_000)` and set it back to `10_000` after, or pass `{ timeout: 60_000 }` to the
wait you write yourself. Time it with `qa.time` all the same: past the `file` budget is a finding. Waits that aren't
Playwright's (`waitForTimeout`, `expect.poll`, a loop) aren't bounded, so wait in small pieces. If one times out, send a
snippet that only looks (a screenshot, `page.url()`) before you go on. Raise `QA_SNIPPET_MS` when you start the session
if a step really waits longer (opening the long file on a slow step, say); above 180 s, raise `QA_WAIT` (in seconds)
for `qa:send` too, or it gives up before the snippet does.

A step stays open until the next `qa.step`, so one step can take several snippets. Calling `qa.step` again with the
open step's name carries on with that step (a retry after a failed snippet), so it's never counted twice. `page` is
always the newest page: once a second page is open (a second tab, or a watcher or artist a `social` helper opens), hold
the persona's own as `context.pages()[0]` and pass the page you mean to every call. `qa.shot`, `qa.frames` and
`qa.memory` throw without one then, naming the call to make. The SOCIAL server is cut off for
the whole browser unless a snippet fakes it for a page with `social.fakeServer(page, ...)`. Import Node's own modules
(`import { join } from 'node:path'`) as you like, but reach the repo's code through the arguments above, not by
relative path: the snippet runs from the inbox.

What earlier runs got wrong, so you don't:

- **A dialog handler outlives its snippet.** `page.on('dialog', ...)` answers every dialog after it, in every later
  step. For one dialog use `page.once('dialog', ...)`; remove any `page.on` handler (`page.off('dialog', handler)`)
  before the step ends.
- **Check what has focus before you type** (as in [Walking a step](#walking-a-step), step 7), so stray keys don't land
  in the art or a field.
- **Give your own locators short timeouts**, around 5 s (`locator.click({ timeout: 5_000 })`,
  `expect(locator).toBeVisible({ timeout: 5_000 })`), so one that never matches fails fast.
- **Bring a page to the front before you drive it.** With several pages open, call `await page.bringToFront()` on the
  page you're about to drive: a page behind another stalls its timers and animations in headless Chromium, so the
  snippet hangs, and `qa.frames` there gets no frames. Take every screenshot from the page you mean, and name that
  page in the shot's name.
- **`qa.probe(kind, note)` takes two arguments.** Put everything in the note; a third argument throws.

### The `qa` recorder

| Call | What it records |
| --- | --- |
| `qa.step(name, { rated, want })` | Starts a step. `rated: true` when the script's step says `Rated: yes`; `want` is the keystroke path the script wants. A rated step must be rated before the next `qa.step`, or that call throws. The open step's name again carries on with that step, as first opened. |
| `qa.rate(how, want)` | Rates the open step: `'keys'`, `'keysLong'` or `'mouse'` (see [The keyboard score](#the-keyboard-score)). `want` replaces the step's wanted path. |
| `qa.probe(kind, note)` | A probe tried at the open step: one of the [probe kit](#the-probe-kit)'s kinds, and what you did and what came of it. The note is required, and there's no third argument. |
| `qa.note(text)` | A note on the open step: anything the reviewer should know that isn't a finding (a step skipped and why, a known difference you saw, timings that aren't real). The report prints it under the step. |
| `qa.shot(name, { page, fullPage, timeout })` | A screenshot of `page` into `shots/`, kept with the open step. Returns its path, relative to the run folder. `page` may be left out only while one page is open. |
| `qa.time(name, fn, budget)` | Runs `fn` and records its time against `budget`, a number of ms or a budget's name (see [Budgets](#budgets)). Returns the ms. |
| `qa.frames(name, fn, page)` | Records the worst gap between animation frames on `page` while `fn` runs, against the `frame` budget, and how many were longer than `longFrame`. Returns `{ worst, long }`. When fewer than two frames came (a page behind another stalls), it records a note on the step instead of a timing and returns `{ worst: null, long: null }`: bring the page to the front and try again. `page` may be left out only while one page is open. Don't reload or navigate inside it. |
| `qa.memory(page)` | Records the page's JavaScript heap size under the open step. Returns the bytes. `page` may be left out only while one page is open. |
| `qa.finding({ kind, severity, expected, actual, repro, shot, step })` | A finding (see [What's a finding](#whats-a-finding)). `expected`, `actual` and `repro` are required; `shot`, when given, must be a file in the run folder (a path `qa.shot` returned); `step` defaults to the open step's name. Returns its id (`F1`, `F2` ...), which the report prints in the finding's heading. |
| `qa.run` | The run record itself, as `run.json` has it. |
| `qa.page` | The newest page, the same as the `page` argument at the time you read it. |
| `qa.save()` | Writes `run.json` now. Every recording call already does. |

Each recording call checks what it's given and throws on a kind, rating, severity or budget that isn't one of the
lists below, so a typo comes back as a failed snippet rather than a bad record. The session calls `qa.end()` itself.

Besides these, the session records on its own:

- the keys and pointer presses that reached the page in each step (counted outside the page, so a reload or a second
  tab doesn't lose them);
- the page's errors and console errors, under the step they happened in (each kept once with a count);
- the machine, the browser and the GPU renderer.

The report's "Session warnings" are the harness's own (a snippet's stray error, a step left unrated, a stop); what
you want to tell the reviewer goes in a note, on the step it's about:

```js
qa.note('input/qa/ is missing, so this step is skipped.');
```

### An example

The first snippet of a Maya run (seed 3 draws a tablet, touch, English, light, and a second tab):

```js
// qa-runs/snippets/01-open.mjs: open a picture from the start screen, then pick the Pencil by its key.
export default async ({ page, qa, e2e, traits }) => {
  qa.step('1. Open my picture');
  await qa.time('open gradient.png', async () => {
    await e2e.imageInput(page).setInputFiles(e2e.fixture('images/gradient.png'));
    await e2e.settled(page);
  }, 'file');
  await qa.shot('picture open');

  qa.step('2. Pick the pencil', { rated: true, want: 'P' });
  await page.keyboard.press('p');
  const tool = await e2e.store(page, 'workspace', (w) => w.activeTool);
  qa.rate(tool === 'pencil' ? 'keys' : 'mouse');
  await page.keyboard.press('p');
  qa.probe('again', `pressed P a second time: the tool is ${await e2e.store(page, 'workspace', (w) => w.activeTool)}`);
  return { traits, tool, shot: await qa.shot('pencil picked') };
};
```

```bash
npm run qa:send -- maya qa-runs/snippets/01-open.mjs
```

The answer has the tool and the screenshot's path; look at the screenshot before you go on. A real step does more
than this: see [Walking a step](#walking-a-step).

## Walking a step

The first snippet of a run looks before it acts: it returns `traits` and takes a screenshot of the start screen. Once
the persona has something open, open the app's shortcut list (`?`, or Alt+? while typing in a field) and keep what it
says beside you for the keyboard score. Then, for each step of the script:

1. **Read the step**: what the person wants, what they'd expect, the probes it names, and whether it's rated.
2. **Try the keyboard path first**, whatever the input trait, and `rate` it, when the step is rated (see
   [The keyboard score](#the-keyboard-score)).
3. **Do the step the drawn input's way**, and check what the step Expects. A person finds controls by what the screen
   says, in the drawn language, so you do too: read the page as they would (a screenshot, or
   `await page.locator('body').ariaSnapshot()` for the names) and act on what you find there, by role and visible
   name. The `e2e` helpers are for setting up and checking, not for walking the step: one that does the step for you
   hides the friction you're there to find. Most of them, and the `social` helpers, find controls by their English
   names, so on a French run they fail; `fixture`, `imageInput`, `settled`, `store`, `cellPoint`, `pixelPoint` and `drag` work in any language.
4. **Run the step's named probes, and at least two kit probes of your own choosing** beyond them, recording each with
   `qa.probe(kind, note)`. A named probe doesn't count toward the two: reviews of earlier runs found steps with only
   the named ones. Pick what this person would actually run into at this step.
5. **Look at a screenshot of the result.** Open the image file and look at it. Don't rely only on the DOM or the
   stores: overlap, clipping, cut-off text, contrast, a layout that jumped and a wrong picture only show there.
6. **Time what the persona waits on**, with `qa.time` (a click's response, a setting, opening or exporting a file)
   or `qa.frames` (a drag), against its budget.
7. **Check the basics**: focus lands somewhere sensible after the step, Escape closes what opened, and the controls
   you used have names (an icon button with no name shows as a bare `button` in the aria snapshot). Where focus is:
   `page.evaluate(() => [document.activeElement?.tagName, document.activeElement?.getAttribute('aria-label')])`;
   `BODY` means focus went nowhere.
8. **Record findings** with `qa.finding`, each with a screenshot or a timing.
9. **Put back what a probe changed** before the next step, when later steps rely on it (a setting, a key, a layer,
   the file that's open): by undo, or by setting it back. If it can't be put back, say so in a `qa.note` on the step,
   with what the rest of the run started from.

### A step that can't be done

When a step can't be done (the control isn't there, the feature is gone, the flow is blocked), open the step as the
script has it, try the path, and record what stopped you:

- a rated step is rated `mouse`, with `want` set to the path the script wants;
- an `oversight` finding, or a `bug` when the docs say it works;
- a note on the step saying what you tried;

then go on to the next step. A step skipped for something outside the app (the `input/qa/` packs missing, a step the
fake SOCIAL server can't reach) is opened with `rated: false` and gets only a note, saying why.

### The end of a run

After the last section's Free time, send `npm run qa:send -- <persona> --end`. The run is then handed to the reviewer
(below), with the run folder's path.

### Pointing and driving

`e2e.cellPoint` and `e2e.pixelPoint` assume the whole grid is in view; when the view is zoomed or scrolled (most
grids on a tablet or phone), they give points off the canvas. Check a point falls inside the visible canvas
(`page.locator('.ansi-editor').boundingBox()`) before you press there, and take points from a screenshot when it
doesn't.

Name each step as the script does, its number and heading: `qa.step('3. Make it smaller')`. Reading a store is fine
for checking what you saw (`e2e.store(page, 'project', (p) => p.cols)`); changing a store or dispatching events
from `page.evaluate` is never a person's action, and isn't counted.

How each input is driven:

| Input | How |
| --- | --- |
| `mouse` | `locator.click()`, `page.mouse` (move, down, up, wheel). |
| `trackpad` | As the mouse; scrolling is `page.mouse.wheel(dx, dy)`, and a pinch is a wheel with Control held (`page.keyboard.down('Control')`, the wheel, then `up`). |
| `touch` | `locator.tap()`, `page.touchscreen.tap(x, y)`. A touch drag goes through the DevTools protocol, as below. |
| keys | `page.keyboard.press`, `down`, `up`, `type`, and `locator.press` or `pressSequentially`. Cmd is `Meta` (`page.keyboard.press('Meta+z')`). `locator.fill` sends no key presses, so a step that types to earn its rating types with `pressSequentially`. |

```js
// A touch drag from (x0, y0) to (x1, y1) in page pixels, as a finger makes it.
const cdp = await context.newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
await touch('touchStart', x0, y0);
for (let i = 1; i <= 10; i++) await touch('touchMove', x0 + (x1 - x0) * i / 10, y0 + (y1 - y0) * i / 10);
await touch('touchEnd');
```

Keyboard-only isn't an input trait: every run tries the keys first at every rated step, so the score is the same
whatever input was drawn.

## The probe kit

A script is a route, not a checklist. Around every step, try what a person might run into. Each kind is a `PROBES`
value for `qa.probe`:

| Kind | What it means | For example |
| --- | --- | --- |
| `again` | Do it twice. | Export the same file twice in a row; add a layer, then add another right away. |
| `undo-redo` | Undo, redo, undo again, and redo after a different edit (which should have nothing to redo). | Draw a stroke, Cmd+Z, Shift+Cmd+Z, Cmd+Z, then type a letter and try to redo; undo a slider's move and check both the picture and the slider went back. |
| `back-out` | Leave midway: Escape, Cancel, a click away. | Open the save dialog, change the name, press Escape, and open it again; start a drag-select and press Escape before letting go. |
| `interrupt` | Break off and come back: reload, Back, a second tab, switch layer, frame or tab. | Halfway through typing, switch to PIXEL and back; reload a second and a half after a stroke and check autosave brought it back. |
| `out-of-order` | Do it with nothing to act on, or before it makes sense. | Press Delete with no selection; paint on a hidden layer, or an empty one. |
| `extremes` | Empty, zero, huge, junk pasted in, long names, emoji and wide characters, the persona's biggest sizes. | Rename a layer to 200 characters with emoji in it; set the width to 0, then to 99999. |
| `speed` | Rapid repeats, a held key, undo mashed. | Press Cmd+Z thirty times as fast as the page takes it; hold an arrow key moving a selection for two seconds (`keyboard.down` again and again sends repeats, then `up`). |
| `free` | An off-script move in [Free time](#free-time). | Try the right-click menu on a layer; drag a file onto the canvas instead of using the button. |

Some settings aren't undo steps, by the owner's choice: the grid size, Art style, Color palette, Color count, frames per
second and a frame's hold. Cmd+Z after one takes back the edit before it, and that isn't a finding. What a run checks
instead is that the change kept the undo steps before it: a setting that forgets them is a `bug`.

Record what you did and what came of it, in a line: `qa.probe('undo-redo', 'undid the stroke, redid it, undid it;
drew a dot and redo was off, as it should be')`. A probe that turns something up is also a finding.

## Free time

Every section of a script ends with **Free time**. Open it as its own step, not rated
(`qa.step('Free time: <section>')`), and make three to five off-script moves this person would try next, each
recorded as `qa.probe('free', ...)`. Free time's probes are all `free`: the rule of two kit probes a step doesn't
apply to it. The moves: the control they'd reach for, the thing they'd want to do with what they just
made, the mistake they'd make. Use what you've seen of the person so far, and what makes them give up.

## Interruptions

The drawn `interruption` trait adds one break to the run, besides any `interrupt` probes:

- **`reload`**: once, in the middle of a section, at a moment with unsaved work: edits made since the last time the
  persona saved a file. Autosave writes a second after edits stop (at least every 10 s while they go on), so wait for
  it as a person pausing would: a second and a half after the last edit (`await page.waitForTimeout(1500)`).
  `e2e.autosaved(page)` only says the document has been written once, so it's no use after the first write. Reload
  with `page.reload()`, then check autosave brought the work back as a project file keeps it: the picture and its
  settings, every layer with what's on it (its name, its eye, its character settings), shapes, frames, the file name
  and that there are unsaved changes; and the address brings back the tab. Undo starting empty after a reload is
  `friction`: file it once a run (minor), not at every reload. Losing work that was given time to autosave is a finding; losing the last second
  before the reload isn't.
- **`secondTab`**: open the app in a second page of the same context (`const second = await context.newPage(); await
  second.goto('/');`), look at what the second tab shows and does, then close it (`await second.close()`) and come
  back to the first, which is `qa.page` again. Check the first tab's work is as it was.
- **`none`**: no break beyond the probes.

Record the break as an `interrupt` probe on the step it fell in.

## What's a finding

| Kind | What it is | For example |
| --- | --- | --- |
| `bug` | Wrong output, a broken state, undo or redo that doesn't come back right, work lost on reload or reopen, an export that doesn't match the screen. | Undoing a layer move puts the cells back on the wrong layer. |
| `visual` | Overlap, misalignment, clipping, cut-off text at phone width, poor contrast in light or dark, an odd hover or focus look, a layout that jumps. | A long layer name runs under the eye button at phone width. |
| `performance` | A step over its budget at the persona's sizes, long frames during a drag, memory that keeps growing. | A brightness step on the 300 by 1600 file took 640 ms against 250. |
| `friction` | It works, but the person had to look twice, guess, hunt for a control, wait, or was surprised. | Export took three menus to find; the person looked under Actions first. |
| `oversight` | A missing control the person reaches for, wrong or confusing words, a dead end, a refusal with no reason, docs that promise what the app doesn't do. | Opening an .xb file does nothing and says nothing. |
| `keyboard` | A shortcut that works but isn't in the app's shortcut list, a listed one that doesn't work, an action with no keyboard path the person reaches for often. | The shortcut list names a key for an action, and the key does nothing. |
| `a11y` | Focus that's lost or trapped, a control with no accessible name, Escape that doesn't close what opened. | After the color popover closes, focus is on the page's body and the tool keys don't work. |

| Severity | What it means |
| --- | --- |
| `blocker` | The person can't finish what they came to do, or loses work. |
| `major` | Wrong output, or a long way round that most people wouldn't find. |
| `minor` | Noticeable, and costs the person time or trust, but they get there. |
| `polish` | Small: a look, a word, a step that could be smoother. |

Friction counts even when the thing works: if the person would have hesitated, it's a finding.

A finding's `expected` is what this person expected, in their words; `actual` is what happened; `repro` is the moves
from the start screen that show it, in plain words, so the reviewer can follow them at the same seed; `shot` is the
path `qa.shot` returned. One finding per problem: a problem seen at three steps is one finding that says so.

Not findings:

- style opinions with no effect on the persona;
- anything on the persona's Known list;
- Safari- or Firefox-only problems (runs are Chromium only).

Also not a new bug each run: the terminal check's three known differences from the app's widths (an emoji with a
variation selector, like ❤️; skin-tone and joiner sequences, like 👍🏽 and 👨‍👩‍👧; flags, like 🇺🇸), and a hidden
character (its foreground the same as its background), which an export writes as a space by design. Note them; which
side is right is the owner's call.

## The keyboard score

The score is what the persona could do from the keys, found by trying it. It rises as keyboard support grows.

| Rating | When | Marks |
| --- | --- | --- |
| `keys` | Three keystrokes or fewer. A key with its modifiers (Shift+Cmd+Z) is one keystroke. | 1 |
| `keysLong` | From the keys, but more than three keystrokes: Tab-walking, arrowing through a menu. | 0 |
| `mouse` | No keyboard path. | 0 |

A path of more than three keystrokes isn't one a person would use, least of all one that starts with Tab, so
`keysLong` earns nothing. It's rated apart from `mouse` only so the to-do list can tell "make the path shorter" from
"add one".

The score is round(100 × marks ÷ rated steps), out of 100. A run with no rated steps has no score (`null`, "not
rated" in the report).

- **What's rated:** each step that's an action: picking a tool, changing a setting, opening or closing something,
  running a command, moving between layers, frames, tabs or fields. Arrow keys moving a selection or the cursor count
  as a keyboard path, and a missing one is a finding.
- **What isn't rated:** drawing on the canvas itself (a freehand stroke, a drag-select, placing a shape) and what you
  type as the art (the text, not the path to the text tool). That's the work, not a missing shortcut. Free time isn't
  rated either.
- **What counts as a keystroke:** the keys it takes to reach the control and to commit (Enter, or leaving the field).
  A value typed into a field is content, not counted.
- **Rated by how it's reached, not just the action.** If a tool has a key but its size only changes on a slider, the
  size change is rated on its own. When a step's action takes more than one control, rate it by the worst of them, and
  name that part in `want`.
- **Focus costs.** A click needed only to get the keys working again (focus lost after a dialog, say) is a click: if
  nothing on the keyboard brings focus back, the step is `mouse`. Keystrokes that bring it back (Escape, Tab) count
  toward the step's total. Either way, lost focus is also an `a11y` finding.
- **Try it, don't guess it.** At every rated step, before the drawn input: try the path the step wants, then what the
  shortcut list offers, then Tab and the arrows. Rate by the shortest path that worked, with `qa.rate(how, want)`,
  where `want` is the path the person would want when it isn't `keys` (for example `'B, then ] to grow the brush'`).
  Then carry on with the drawn input.
- Every keystroke you rate on goes through `page.keyboard` or `locator.press` in that step's span, so its key count
  backs the rating up. A step rated `keys` or `keysLong` with no keys counted gets a warning in the report.

For example: picking a tool by its key is `keys`. Tab five times to reach a slider is `keysLong`. A menu with no key
is `mouse`, with `want` naming the path wanted (`'Cmd+E to open Export'`).

Shortcuts that work but aren't in the app's shortcut list, and listed ones that don't work, are `keyboard` findings.

The report lists the steps that cost marks, mouse first, each with its `want`: that's the to-do list for keyboard
work.

## Budgets

The times a person notices, in ms (`BUDGETS` in `tests/qa/score.js`), passed to `qa.time` by name:

| Budget | ms | For |
| --- | --: | --- |
| `response` | 100 | A click's or a key's visible response. |
| `frame` | 33 | A frame during a drag (`qa.frames` uses it). |
| `longFrame` | 50 | A frame longer than this is counted as long (`qa.frames`). |
| `setting` | 250 | A setting's change at the persona's size. |
| `file` | 2000 | Opening or exporting a file at the persona's size. |

The targets in [layer-stack-performance.md](../investigations/layer-stack-performance.md) win where they're
stricter; pass those as a number (`qa.time('hide the top layer', fn, 100)`). Among them, at the limit with 16 layers:
hiding, showing or moving an upper layer under 100 ms, a slider step within 50 ms of its cost with one layer, a
selection move under 20 ms per pointer move; and in an animation, a frame swap under 60 ms.

`qa.time` measures from Node, so `fn` must wait for what the person waits for (the picture redrawn, the dialog shown),
and a few ms of the time are the browser's round trip. Take `qa.memory` at the start and end of each section, so
growth over a long session shows.

Timings are only real on the GPU. The report's first line says when the renderer is software or unknown; then don't
file `performance` findings; note it on the first step.

## Files

- **Generated:** `files.writeFiles(join(runDir, 'files'))` writes three ANSI files into the run folder and returns
  their paths, `{ long, scene, logo }`:
  - `long`: 300 columns by 1,600 lines (480,000 cells, about 10.6 MB), every color of the 256, for the sizes near the
    limit;
  - `scene`: an 80 column scene with what real .ans files have (CP437 characters, a move right, a saved and restored
    cursor, a bright background written as blink, a line running past column 80, SAUCE);
  - `logo`: a 20 by 5 shape on spaces, for merging onto other art.
- **Fixtures:** `e2e.fixture(path)` is the absolute path of anything in `tests/fixtures/`: images (`images/photo.jpg`,
  `gradient.png`, `rgba.png`, `tall.png`, `tiny.gif` and more), projects (`projects/animated.phosphor` and more), SVGs
  (`svg/rose-mark.svg`, `svg/gradients.svg` ...), `ansi/past-the-edge.ans`, fonts and clipboard captures.
  `tests/fixtures/README.md` says what each covers.
- **Real packs:** `input/qa/packs/` holds real scene packs from 16colo.rs, listed in `input/qa/README.txt`
  (acdu0793, acid-50a, acid-55a, mist1216, blocktronics_blocktober, impure88, fire-41). The folder is local and
  ignored by git: never commit anything from it or copy its files into `tests/fixtures/`. Its path from a snippet is
  `join(runDir, '..', '..', 'input', 'qa', 'packs')`. The packs hold .ans, .asc and .txt, and also .xb, .sue, .tnd,
  .nfo and .diz files the app may not open: trying those is part of a run, and what happens is recorded (a refusal
  that says why is fine; nothing at all, or the wrong art, is a finding). When the folder is there, use it and say so
  in a note on the first step that does. When it isn't, skip the steps that need it, each opened and noted (see
  [A step that can't be done](#a-step-that-cant-be-done)).

Exports: wait for the download and keep it in the run folder (`const download = await page.waitForEvent('download')`
around the click that saves, then `await download.saveAs(join(runDir, 'exports', download.suggestedFilename()))`).
Check an export against the screen and against the app's own reopen. A .ans, .utf8ans or .cast is also played in the
headless terminal and compared cell by cell:

```js
const bytes = new Uint8Array(await readFile(join(runDir, 'exports', 'art.ans')));   // readFile from 'node:fs/promises'
const app = await e2e.store(page, 'project', (p) => ({ cols: p.cols, rows: p.cells.length / p.cols,
  cells: p.cells.map((c) => ({ char: c.wide === 'trail' ? ' ' : c.char, fg: c.fg.hex.toLowerCase(), bg: c.bg.hex.toLowerCase() })) }));
const shown = await terminal.terminalCells(bytes, { cols: app.cols, rows: app.rows, encoding: 'cp437' });
const differences = terminal.diffCells(terminal.normalizeHidden(app), shown);
```

A .utf8ans ends with a line feed, so give the terminal one row more than the art and compare the rows the art has:

```js
const shown = await terminal.terminalCells(bytes, { cols: app.cols, rows: app.rows + 1, encoding: 'utf8' });
const differences = terminal.diffCells(terminal.normalizeHidden(app), { ...shown, rows: app.rows, cells: shown.cells.slice(0, app.cols * app.rows) });
```

A .cast is `terminal.castFinalCells(text)`, the screen it ends on.

## The reviewer

The reviewer is a different agent from the one that ran. When the run ends:

1. Check the checkout is still at the run's commit: `git rev-parse HEAD` against `commit` in `run.json`. If it isn't,
   say so at the top of `review.md`, with both commits, since a reproduction then tests a different app.

2. Read `report.md` and `run.json` (a run split across sessions has a folder for each: read them all), and open every
   screenshot a finding cites, and at least one for each step. Look at each with fresh eyes: a visual problem the run
   missed is yours to add.
3. Reproduce each `bug` and `performance` finding in a fresh session at the same seed (`QA_PERSONA=<persona>
   QA_SEED=<seed> npm run qa`, which makes a new folder), following the finding's repro. A timing reproduces when it's over its budget again. Other kinds you judge
   from the report and the screenshots, reproducing where you doubt one.
4. Mark each finding `confirmed`, `dropped` (with why: didn't reproduce, a style opinion, not this persona's problem,
   Safari- or Firefox-only) or `known` (on the persona's Known list).
5. Flag:
   - the steps with no probes (the report's "No probes tried"), and steps with fewer than the step's named probes
     and two of the kit's, leaving out Free time and the steps skipped with a note;
   - Free time with fewer than three `free` probes;
   - the event check's warnings (the `Warning:` lines under Steps: a step rated for the keys with no keys counted),
     and any rating you think is wrong,
     with the rating it should have;
   - the notes under each step, and the "Page errors" and "Session warnings" sections, each read and judged: a page error the steps didn't explain
     is worth a finding of its own.
6. Write `review.md` in the run's folder (the first, for a split run; not your reproduction's): the run's folder names, then each finding by its id
   with its mark and a line on why, then your own findings (as the run's are written: kind, severity, step, expected,
   actual, repro, shot), then the flags.

## After a review

- Confirmed findings go to the owner: the run's `report.md` and `review.md`, with the run folder's path. The owner
  picks what gets fixed.
- A line goes in [scores.md](scores.md), added by the reviewer and committed: the run's date, persona, keyboard score
  (corrected if the review corrected a rating), rated steps, the app's and the script's commits (8 characters), seed
  and traits. A reproduction session gets no line.
- Items reach a persona's Known list only once the owner accepts them as known or won't-fix. Neither the run nor the
  reviewer adds to it.
- A confirmed bug gets its failing test only when it's fixed, in the lowest layer that sees it (AGENTS.md).

## Keeping scripts current

A change to a feature changes the steps that walk it, in the same work: the words of a step, what it Expects, the
keystroke path it wants, its probes. A step for a feature that's gone is removed; a new feature a persona would use
gets steps. The persona file's commit is the script's version: a run records it beside the app's, so a jump in a
score that comes from a rewritten script isn't mistaken for keyboard work. Commit a script change before you run it.

## Never in a script, a finding or a review

- How the SOCIAL server is built. The server is its API: paths, messages, fields and error codes. A finding about it
  says what the person saw and what the app sent or got.
- How moderation decides. A script, a finding or a review may say that a report was sent and what the person saw
  ("Reported. Thank you."; a silenced person sees only until when), never how many reports, how fast, or what follows
  from them.
