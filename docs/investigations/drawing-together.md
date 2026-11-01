# Investigation: how many people can draw in one room

Question: how does a room behave with many people drawing, and how many should it let in?

Written 2026-10-31 against the `jejacks0n/drawing-together` branch. The cap this sets is `MOST_ARTISTS`
(`src/store/drawing/host.js`), and it counts the host. Two other things changed because of it: how often a host
writes its ledger, and that someone drawing is no longer sent the art.

## Summary

- **`MOST_ARTISTS` is 7.** The rule: the largest count where a change lands on someone else's screen within
  250 ms at the 95th percentile, and the host's tab stays usable, in every one of three runs. **Usable** means
  that the host's longest main-thread task in a run is under 200 ms, the point past which a press that lands
  behind it reads as late. The threshold was chosen before any of these runs.
- **It was 6 at first, and a defect was holding it down.** Artists were also sent the art as watchers get it, and
  after a fill each one decoded a whole-document snapshot it never used, at 1 to 2 seconds of main thread at 15
  people. A person drawing is now sent no art. At 8 people, the 95th percentile went from 156 to 239 ms down to 44
  to 133 ms. Both sets of numbers are below.
- **What stops 8 and 10 is now one thing: the ledger's write.** 8 misses in one run, and 10 in one run, both on the
  clone alone (249 and 266 ms). Their latency passes every time (up to 206 ms). No run took the write away, but
  by inference the cap would then be 10. 12 misses on latency (up to 376 ms) and 15 on both.
- **Steady drawing isn't what limits it.** 15 people drawing with no fills pass easily (measured before the art
  change, which it can only have helped): 22 ms at the 95th percentile, and no task on the host over 50 ms. The
  limit comes from one person filling 500 lines every 10 seconds.
- **7 holds for a new room, and partly because these runs last 60 seconds.** They end with about 20 MB in the
  ledger. An estimate from the ledger's table: one person's 40,000-cell fill every 20 seconds adds about 15 MB a
  minute, which crosses the 25 MB where the write alone goes over 200 ms about 2 minutes in, and in a smaller room
  with the same person filling too. So a long room with a lot of filling misses this rule at any size.
- **From about 8 people, this machine is the limit as much as the code is.** All of them are on 12 cores, and the
  lowest of the machine's idle, sampled about every 7 seconds, is 6% at 8 people and under 1% at 10. People on their own computers would
  each do only their own share, so 7 is cautious. How cautious can't be told from one machine.
- **The ledger write is a visible stall when the ledger is full of cells, at any number of people.** About half
  a second at the limit. It used to come every 2 seconds; it's now about every 7 to 10. A cap doesn't help
  this, and pacing makes it rare but doesn't remove it.

## How this was measured

**The machine:** a MacBook Pro with an M3 Pro (12 cores: 6 performance, 6 efficiency) and 36 GB, on macOS. Chromium
156 headless, one browser with one context per person, with WebGL on the machine's GPU (ANGLE on Metal).

**The room:** real. A production build of the app, a throwaway run of the server's API with nothing in it,
real signed-in accounts, and real WebRTC data channels with no STUN.

**The document:** a blank canvas of 80 x 2,000 (160,000 cells), on the ANSI tab.

**The drawing:** a count below includes the host, who draws too. Everyone works in their own part of the
document, calling the store actions the tools call (not real pointer events): about 30 moves a second, a new
stroke every 2 seconds or so, cells and paint by turns, with cursors on. One artist also fills 500 lines every 10
seconds, by turns 40,000 cells or 80,000 pixels. Most people would call that a lot of filling.

**What was done to lighten it:** only that artists' windows are 800 x 500 against the host's 1400 x 900. Each run
is 60 seconds on a new room, and the first 5 seconds don't count. So the ledger starts empty in every run, which
is why it's measured apart below. Rooms up to 8 hold together. Above that the numbers describe a saturated
machine (the pages drop to about 40 frames a second at 15).

**A change's time** runs from the message being handed to the data channel to the frame it's written to the
screen, read from the one clock all the pages share. It doesn't include the wait for the next slice before the
send, up to 100 ms.

## The numbers

Three runs each, on the final code. The latency is to other artists. "Task" is the host's longest in the run. "Idle"
is the whole machine's, sampled about every 7 seconds: the mean, and the lowest seen in any of the runs. The count that
sets the cap, and each miss, are in bold.

| People | p50 (ms) | p95 (ms) | p95, to the host (ms) | Host's longest task (ms) | An artist's longest task (ms) | Idle: mean, lowest |
| ---: | --- | --- | --- | --- | ---: | --- |
| 6 | 15 to 18 | 28, 27, 65 | 22 to 24 | 145, 121, 148 | 141 | 58%, 40% |
| **7** | 13 to 14 | **27, 29, 26** | 20 to 22 | **131, 117, 115** | 205 | 57%, 27% |
| 8 | 15 to 18 | 133, 60, 44 | 22 to 28 | 148, 142, **249** | 241 | 44%, 6% |
| 10 | 16 to 19 | 163, 121, 206 | 33 to 73 | **266**, 176, 186 | 274 | 34%, 0.4% |
| 12 | 17 to 27 | **376, 372**, 239 | 27 to 75 | **248, 210**, 150 | 558 | 33%, 0.4% |
| 15 | 50 to 53 | **1164, 884, 929** | 127 to 137 | **366, 468, 295** | 905 | 49%, 0% |

Above 8 the numbers describe a saturated machine. The longest tasks at 8, 10 and 12 are all the ledger's clone.

Before the art stopped going to artists, and so what set the first cap of 6 (the ledger written every 10 seconds, as
now):

| People | p50 (ms) | p95 (ms) | p95, to the host (ms) | Host's longest task (ms) | An artist's longest task (ms) | Idle: mean, lowest |
| ---: | --- | --- | --- | --- | ---: | --- |
| 4 | 12 to 13 | 64, 30, 38 | 24 to 41 | 137, 108, 118 | 263 | 66%, 50% |
| 5 | 13 to 15 | 39, 128, 62 | 21 to 32 | 133, 145, 118 | 303 | 57%, 31% |
| **6** | 14 to 17 | **119, 107, 54** | 20 to 23 | **105, 164, 116** | 386 | 54%, 25% |
| 7 | 13 to 17 | 152, **334**, 179 | 21 to 23 | 128, 123, 133 | 633 | 47%, 18% |
| 8 | 15 | 218, 239, 156 | 24 to 29 | 139, **229**, 148 | 627 | 37%, 6% |
| 10 | 18 to 21 | **836, 633, 778** | 46 to 62 | **314, 346, 334** | 923 | 36%, 0.8% |
| 12 | 22 to 28 | **1009, 1780, 1561** | 63 to 93 | **322, 202, 233** | 1407 | 28%, 0.7% |
| 15 (one run) | 40 | **2471** | 128 | **297** | 1544 | 36%, 4% |

The same, without the fills, and with the art left out for artists by a scratch change to the running page, which is
what pointed at the defect. One run each:

| People | | p50 (ms) | p95 (ms) | Host's longest task (ms) | An artist's longest task (ms) | Idle: mean, lowest |
| ---: | --- | --- | --- | --- | ---: | --- |
| 15 | no fills | 13 | 22 | under 50 | under 50 | 22%, 8% |
| 8 | fills, no art to artists | 14 | 66 | 135 | 138 | 50%, 17% |
| 12 | fills, no art to artists | 24 | 393 | 377 | 516 | 30%, 5% |
| 15 | fills, no art to artists | 33 | 868 | 266 | 620 | 46%, 0% |

The median hardly moves, and a change reaches the host fast at every count. What grows is the time after a fill,
when everyone is applying it at once and everything behind it waits.

The rest of this section is on the final code, unless it says otherwise.

**Queued bytes per artist:** the host's queue was never used, at 0 in every run. The channel's own buffer peaked at
about 1.5 MB with fills (8 MB is where the host starts queueing), and at 2 KB without them. No channel closed.

**The check:** it never fired. Across all the runs, thousands of checks were heard (1,316 across the three runs at
15 people), with no mismatch and no project sent because of one.

**Cursors:** with everyone's on, the host sends (measured before the art change, which doesn't touch them):

| People | Messages a second | Sent, in all |
| ---: | ---: | ---: |
| 4 | 26 | 14 KB/s |
| 8 | 62 | 68 KB/s |
| 15 | 132 | 267 KB/s |

At 15, that's about 19 KB/s to each artist, in 9 messages a second of about 2 KB, since each holds everyone's
cursor. Each artist sends 9 a second, under 1 KB/s. It's about a sixth of what the numbered changes take at 15 with fills
(1.6 MB/s) and doesn't limit anything, so the pace stays. Nor does the slice pace limit anything, since steady
drawing passes at 15.

**A heard cell change:** batching holds. At 15 people drawing steadily (before the art change), an artist writes what it's heard about 52
times a second, never more than a frame's worth, with 5 messages in a batch (9 at the 95th percentile), and takes
1.5 ms for one (3.1 ms at the 95th percentile, 12 ms at most). That's about 80 ms of main thread a second. The host
does the same in the same time. A fill is another matter: 25 messages of up to 64 KB at once. At 7 people the
longest batch takes about 75 ms, and at 15 up to 440 ms, on a machine with nothing left.

## The ledger's write

The whole ledger is written for a reload, as a structured clone on the main thread. Gathering what to write takes
no time; the clone inside IndexedDB's `put` is the cost. In the runs above, it's what the host's longest task
usually is. It depends on how many objects the ledger holds, not on how many people there are.

One artist filling the whole document again and again, until the ledger's 64 MB limit stops it growing:

| What's in it | Stacks | Clone on the main thread (ms) | Until written (ms) |
| --- | ---: | ---: | ---: |
| Cells | 19.5 MB | 164 | 174 |
| Cells | 39.1 MB | 270 | 287 |
| Cells | 58.6 MB (the limit, for this fill) | 407 to 488 | 444 to 525 |
| Paint | 31.5 MB | 27 | 36 |
| Paint | 63 MB | 34 to 58 | 49 to 74 |

Steady drawing costs little: before the art change, at 15 people with no fills, after 60 seconds, 9 MB of stacks and 17,000 items in the tail
clone in 29 ms. Filling with cells is what's costly. Past about 25 MB of them, the clone alone is over the 200 ms
this document calls usable, in a room of any size. By the estimate in the summary, a room that keeps filling reaches
that in minutes, not hours.

**A stall every 2 seconds at the limit was too often**, a quarter of the host's time, so `KEEP_LEDGER_EVERY_MS` went
from 2 to 10 seconds. Autosave also writes it, 1 second after edits stop and at least every 10 seconds, so in the
runs above that came to 6 to 9 writes a minute. The document is never ahead of the ledger on a reload, since
autosave's write comes straight after the document's. What a host loses is only that the ledger may be up to 10
seconds behind the artists, who catch it up from their own tail. This stays a half-second hitch every several
seconds, in a room whose ledger is full of cells. It's noted here as what it is: the design
writes a whole copy, and only a different design would take that away.

## A project over 16 MB

The pacing had only been tested on a fake channel, so: a 34.8 MB project (a PNG of random noise, which doesn't
compress) went to two artists accepting at the same moment. They had the art after 6.1 and 6.3 seconds. The host sent
69.7 MB in 1,118 chunks, the channel's buffer stayed at about 8 MB (8.03 MB at its highest, one chunk past the line,
which is the pacing doing its work), and neither channel closed in any of the samples, taken every 50 ms. A stroke
afterward reached the host and the other artist. The host's longest task was 522 ms, packing it.

## What these numbers don't show

- **There's no real network here.** Every browser is on one machine, so a change crosses loopback. A real room adds
  the time across the internet, and a host's upload becomes the limit: 15 people with fills asks for about 1.8 MB/s
  (15 Mbit/s) up, every byte of it from the host, and 7 far less. Packet loss and slow links aren't tested at all.
  Nor is a channel over a relay, as there's no TURN.
- **Nothing here is a typical computer.** It's a fast laptop, split among every person in the room. A host on a slower
  machine has longer tasks, and an artist on their own machine has less to compete with. Both are unmeasured.
- **Not real hands.** The drawing goes through the store rather than pointer events, and everyone keeps at it for the
  whole minute.
- **Rooms this short don't fill the ledger.** The runs show what a new room does, and the cap is only measured for
  that. Nothing here ran for longer than a minute at these counts. The ledger's table shows what
  an old one adds.
- **Three runs is few.** 8 and 10 each passed some and missed others, so the line between them and 7 is not sharp.

## If this should go higher

1. Write less of the ledger at a time. It's what stops 8 and 10, and an old room at any size. That's a change to how
   a room works, so it isn't made here.
2. Then measure on several machines. Past 8, the numbers on this one say little about the code.
