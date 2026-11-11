# A Persona Loop run: {persona}, seed {seed}

You're the QA agent for one run of {persona}'s script against Phosphor, started by Persona Loop. The run is
unattended, and there's no one to ask.

## How to run

Follow `docs/qa/README.md` from the top through "The end of a run", as written: starting the session,
walking each step, the probe kit, Free time, interruptions, findings and the keyboard score. Read the Rules in
`AGENTS.md` first. Where this page and the README differ, this page wins for this run.

- If `node_modules/` isn't there, run `npm install` first (Persona Loop's workspaces skip setup), and
  `npx playwright install chromium` if Playwright says its Chromium is missing.
- Start the session with these three set, as the README says (in the background, with the longest timeout):

  ```bash
  QA_PERSONA={persona} QA_SEED={seed} QA_RUN_DIR={runDir} npm run qa
  ```

- `{runDir}` is this run's folder, and its only output. Keep your snippets and `agent-log.md` in it too.
- If port 4210 is taken, do as the README says: another `QA_PORT` (say `4211`). Never `5173`, `4180` or `4181`.
- If the session ends before the run is done, start the next one with `QA_RUN_DIR={runDir}-2` (then `-3`), at the
  same seed, and carry on as the README says. The reviewer looks for those folders by name.

## The script

Walk the script at `{script}`.

- If it's the persona sheet, `docs/qa/personas/{persona}.md`, walk its `## Script` section.
- Otherwise it's the script Persona Loop wrote for this loop: walk its steps instead of the sheet's. Who {persona} is
  and their Traits still come from `docs/qa/personas/{persona}.md`: read its Who, Why they're here, What they bring,
  What they lean on, What makes them give up, Sizes, Traits and Known.

Name each step as the script does, its number and heading (`qa.step('21. Export my .ans')`). A `Measured: <task>`
marker, on its own line under the heading or at the end of the step, isn't part of the name.

## The goals

{persona}'s goals, to keep an eye on as you go:

{goals}

Walk the script as it is; don't bend it toward the goals. When you see something that bears on a goal, put it in a
`qa.note` on that step, with a shot, so the reviewer can judge the goal.

## Measured steps

At each step with a `Measured: <task>` marker, count the measured path: the step's own path, walked once, before any
probe. Count what the goal names for that task (a `Counted:` line under a goal above):

- `keys`: the keystrokes of the shortest keyboard path that worked, which you try first at every rated step anyway. A
  key with its modifiers (Shift+Cmd+Z) is one keystroke.
- `clicks` or `taps`: the presses of the drawn input's path. `tabs`: the Tab presses in the path. `dialogs`: the
  dialogs it opened.
- `ms`: the timing the step names, against its budget: `qa.time` of the named action, or for a drag, the worst frame
  gap `qa.frames` gives. If you time it more than once, the slowest counts.

Then record what you counted in one note on the step, in this form, giving only what you counted:

```js
qa.note('Measured export-ans: keys 2, dialogs 1');
```

If there's no path to count (no keyboard path at all, or the step can't be done), say so in the note instead:
`qa.note('Measured export-ans: not counted, there is no keyboard path')`. Probes and Free time come after the count and
never go in it.

## When you're done

Send `npm run qa:send -- {persona} --end` and check `{runDir}/report.md` was written. Don't commit, and don't change
any file outside `{runDir}` (and `{runDir}-2` and on, for a split run) but `{doneFile}`.

Then write `{doneFile}` as JSON: `{ "ok": true }` when the run finished with its report, or
`{ "ok": false, "error": "<what went wrong>" }` when it didn't. A run you ended early with `--end` (out of room to
work, say) has its report, so it's `"ok": true`, with where it stopped in your log. Write it last, in one write.
