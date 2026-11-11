# Keyboard scores

One line per reviewed QA run, added by the reviewer ([README](README.md#after-a-review)), newest last. The score is
out of 100, or "not rated" for a run with no rated steps. The commits are 8 characters: the app's, and the persona
file's (the script's version), so a jump that comes from a rewritten script isn't mistaken for keyboard work. Traits
are the run's draw in order: device, input, language, theme, then account, interruption and partner where they apply.

| Date | Persona | Score | Rated steps | App commit | Script commit | Seed | Traits |
| --- | --- | --: | --: | --- | --- | --: | --- |
| 2026-11-10 | maya | 49 | 34 | b03fd011 | 3a69a899 | 503179919 | tablet, touch, en, dark |
| 2026-11-10 | dex | 60 | 26 | b03fd011 | 88128f00 | 462371651 | tablet, touch, fr, dark, reload |
| 2026-11-10 | sam | 58 | 20 | b03fd011 | 88128f00 | 136057347 | phone, touch, fr, light |
| 2026-11-10 | walt | 30 | 22 | b03fd011 | 8e888f16 | 1983746940 | tablet, touch, en, light |
| 2026-11-10 | priya | 55 | 31 | 82a1a774 | 3a69a899 | 1467235712 | tablet, touch, en, dark, secondTab |
| 2026-11-10 | lea | 100[^lea] | 8 | 82a1a774 | 3a69a899 | 1141386645 | phone, touch, fr, light, secondTab |
| 2026-11-10 | juno | 55 | 22 | 82a1a774 | b03fd011 | 664634705 | laptop, trackpad, en, light, guest, reload, sam |
| 2026-11-10 | theo | 58 | 19 | 82a1a774 | b03fd011 | 725575287 | tablet, touch, en, dark, guest |

The app commit moves from b03fd011 to 82a1a774 partway through the round, though only the QA harness (its terminal
check, `tests/qa/terminal.js`, and that check's unit test) changed between them: the app the runs tested is the same.

The rows above were scored under the first rule, where a long keyboard path earned half a mark. From 2026-11-10 a
path of more than three keystrokes earns nothing ([The keyboard score](README.md#the-keyboard-score)). Under that rule
the same runs, from their reviewers' corrected ratings, score: maya 6, dex 42, sam 35, walt 18, priya 19, lea 100,
juno 9, theo 26. Compare later runs with these. They may be a little low: a step the first rule rated `keysLong` at
exactly three keystrokes now counts as `keys`, and only one such step (dex's 19) was found.

[^lea]: On a different scale from the other rows: only Lea's phone-keyboard steps are rated, and the phone's
    on-screen keyboard can't be emulated, so the score covers those steps alone. From 2026-11-10 phone personas aren't given a
    keyboard score: they're measured by taps per task.
