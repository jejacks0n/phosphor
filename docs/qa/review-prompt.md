# A Persona Loop review: {persona}, seed {seed}

You're the reviewer for the run of {persona}'s script in `{runDir}`, started by Persona Loop. You're a different agent
from the one that ran. The review is unattended, and there's no one to ask.

## How to review

Follow "The reviewer" in `docs/qa/README.md`, steps 1 to 6, as written, on `{runDir}`. Read the Rules in `AGENTS.md`
and the README's "Never in a script, a finding or a review" first. Where this page and the README differ, this page
wins for this run.

- A run split across sessions has more folders beside the first: `{runDir}-2`, `{runDir}-3`. Read them all.
- If `node_modules/` isn't there, run `npm install` first.
- Start each reproduction session in a folder of its own: `QA_PERSONA={persona} QA_SEED={seed}
  QA_RUN_DIR={runDir}-repro-1 npm run qa` (then `-repro-2`). If port 4210 is taken, use another `QA_PORT` (say
  `4211`); never `5173`, `4180` or `4181`.
- The script the run walked is `{script}`. If it isn't the persona sheet, the persona's Who, Traits and Known still
  come from `docs/qa/personas/{persona}.md`.

Not for Persona Loop runs: skip "After a review". Don't add a line to `scores.md`, and don't commit anything. The
workspace is reset before every run, and Persona Loop keeps the trends. The run folder is your only output:
`review.md` as the README says, and `results.json` below. Don't change any other file but `{doneFile}`.

## The results file

Write `{runDir}/results.json`, in exactly this shape (the comments are for you, not the file):

```jsonc
{
  "runId": "2026-11-10-maya-503179919-l2",   // the run folder's name: the last part of {runDir}
  "persona": "{persona}",
  "seed": {seed},                             // a number, not text
  "appCommit": "b03fd01...",                  // `commit` in run.json
  "clean": true,
  "scriptHash": "ab12...",                    // `git hash-object {script}`
  "input": "touch",                           // `traits.input` in run.json
  "steps": [
    { "name": "21. Export my .ans", "measured": "export-ans", "counts": { "keys": 2, "dialogs": 1 } },
    { "name": "Free time: SAUCE, bright backgrounds, export" }
  ],
  "findings": [
    { "id": "F8", "kinds": ["a11y"], "severity": "minor", "title": "Focus is lost when Export .ans closes",
      "step": "21. Export my .ans", "repro": "Open Export .ans and press Escape.", "expected": "My keys work again.",
      "actual": "Focus is on the page's body, and the tool keys do nothing.", "shots": ["shots/051-export-closed.png"] }
  ],
  "goals": [
    { "goal": "Export my .ans from the keys in three presses or fewer.", "value": 2 },
    { "goal": "When a dialog closes, my keys work again without a click.", "judgment": "notMet",
      "evidence": "After Export .ans closed, focus was on the page's body.", "shot": "shots/051-export-closed.png" }
  ],
  "scores": { "keyboard": 60 }
}
```

- **`clean`**: `false` when the run was disturbed or incomplete: the checkout isn't at the run's commit (step 1),
  `dirty` is true in `run.json`, the run was split or ended before the script's last step, its "Session warnings" say
  it was stopped or failed, or a measured step wasn't counted. Otherwise `true`.
- **`steps`**: one for each step in `run.json`, in order, Free time included, with `name` word for word as `run.json`
  has it. For a split run, the steps of every folder, each name once.
- **Measured steps**: a step with a `Measured: <task>` marker in the script gets `"measured": "<task>"` and `counts`.
  The counts are the run's `Measured <task>:` note on that step, and cover the measured path only. Never use the key
  and pointer counts `run.json` keeps for the step: those include the probes and anything else done there. Free time
  never has counts. Each count is one of `keys`, `clicks`, `taps`, `tabs`, `dialogs` or `ms`, as a number. When the
  note says the path wasn't counted, or there's no note, leave `counts` out.
- **`findings`**: only the run's findings you marked `confirmed`, and your own. Dropped and known findings stay out.
  - `id` is unique in the file: the run's own (`F8`), and `R1`, `R2` for yours. For a split run, prefix each with its
    folder's number (`1-F8`, `2-F15`).
  - `kinds` is the finding's kind (`bug`, `visual`, `performance`, `friction`, `oversight`, `keyboard`, `a11y`), in a
    list.
  - `severity` is one of `blocker`, `major`, `minor` or `polish`, as you judged it.
  - `title` is one line, in plain words: what the person ran into.
  - `step` is word for word one of `steps[].name` above, the step where it was seen.
  - `repro`, `expected` and `actual` are the finding's, as the README describes them.
  - `shots` are paths relative to `{runDir}`, the results file's folder: `shots/<file>` for the first folder, and
    `../<folder>/shots/<file>` for another (a split run's second folder, or your reproduction's). An empty list when
    there's none.
- **`goals`**: one for each goal below, with `goal` the bullet's text word for word (without the `- `, and without its
  `Counted:` line).
  - A goal with a `Counted:` line gets `value`: the count of that metric from its task's measured step. When it
    wasn't counted, give `"judgment": "notMet"` instead, with `evidence` saying why.
  - Every other goal gets `judgment`: `met`, `close` or `notMet`, from what the run showed (its notes, shots and
    findings) and what you saw, with `evidence` in a line and a `shot` (relative, as above) where one shows it.
- **`scores`**: `keyboard` is the run's keyboard score out of 100, corrected if your review corrected a rating, or
  `null` when no step was rated.

The goals:

{goals}

Before you finish, check the file reads, its ids are unique, every finding's step is a step and every shot is there:

```bash
node -e '
const { readFileSync, existsSync } = require("node:fs"), { dirname, resolve } = require("node:path");
const file = process.argv[1], r = JSON.parse(readFileSync(file, "utf8")), names = new Set(r.steps.map((s) => s.name)), ids = new Set();
for (const f of r.findings) {
  if (ids.has(f.id)) console.log(`${f.id}: the id is used twice`);
  ids.add(f.id);
  if (!names.has(f.step)) console.log(`${f.id}: "${f.step}" is no step`);
  if (!["blocker", "major", "minor", "polish"].includes(f.severity)) console.log(`${f.id}: severity "${f.severity}"`);
  for (const shot of f.shots) if (!existsSync(resolve(dirname(file), shot))) console.log(`${f.id}: no ${shot}`);
}' {runDir}/results.json
```

It prints nothing when all is well. Fix what it prints, and run it again.

## When you're done

Write `{doneFile}` as JSON: `{ "ok": true, "results": "{runDir}/results.json" }` once the results file is written, or
`{ "ok": false, "error": "<why>" }` when it couldn't be. Write it last, in one write.
