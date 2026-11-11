# Theo: watches other people draw

## Who

Theo loves watching ANSI artists work. He's in a few art chats where people post room links, and some evenings he
browses the lobby for whoever's live. He has drawn a little in Phosphor himself, but in rooms he mostly watches, says
something nice, asks how a thing was done, and once in a while a host he knows asks him to draw along. He doesn't read
docs; he finds things by what the screen says, and he's quick to leave a room that's slow, noisy or confusing.

## Why they're here

He wants to drop into a room and see the art right away, look around it at his own pace, follow whoever's interesting,
chat without his messages vanishing, say yes to drawing when asked and get back to watching without losing anything,
and deal with a troll in a couple of moves. Done is an evening of rooms joined and left, his messages said, an
invitation taken, a troll reported, and his own art (open in his other tabs) untouched.

## What they bring

- His account, by the `account` trait (the README's Starting, driving, ending). His page is `context.pages()[0]`,
  faked before he opens SOCIAL with `social.fakeServer(theo, { me, room, rooms, blocked, signsInAs })`:
  - `THEO` is `social.member({ id: 'u_3', username: 'theo_watches', name: 'theo_watches', email: 'theo@example.com' })`;
    signed in, `me` is `THEO`; a guest has `me: null` and `signsInAs` THEO's fields, so signing in from the chat makes
    him `theo_watches`.
  - `room` is one `social.fakeRoom()` the run shares (keep it on `globalThis` so later snippets reach it).
  - `rooms`, the lobby's cards: the live room (`id: social.ROOM_ID`, name "neon harbor", host `ansi-fan`, count 0, max
    12, guests allowed, signal `feedback`, `blockedInside` true when he's signed in), and two he can't join, only look
    at: "quiet docks" (`allowGuests: false`, no signal) and "full house" (count 12 of 12, signal `chat`), each with an
    id of its own. Joining either would reach the same fake room, so he only reads why they're grayed.
  - `blocked`: `[{ id: 'u_8', username: 'loud_crow', since: Date.now() }]`: someone he blocked last month, from a room
    he hosted.
- The other people, each a page of the same context; their moves are setup, not his steps, and the `social` helpers
  may make them:
  - the host: `const host = await context.newPage(); await social.goLive(host, room, { welcome: 'Drawing a harbor
    tonight. Say hi!' })`, which is `ansi-fan` with `images/gradient.png` open; the host draws, scrolls and zooms on
    their page now and then, and runs their ⋯ menu with `social.fromMenu(host, action, name)`;
  - `tin_owl` (`social.ARTIST`), a regular the host makes an artist (`social.watcherPage`, then `goto('/')` and
    `social.joinFromCard`);
  - `spam_gull` (`u_9`) and `loud_crow` (`u_8`), members made the same way: the trolls;
  - for the full room, more members with ids `u_10` and up. Guests can't fill it: the fake gives every guest the same
    account, so a second guest takes the first one's place.
- His own art, open in another tab of the app: `images/photo.jpg`, with a stroke or two of unsaved paint.
- A shared link, as a message would bring it: `/?room=abcdefghij` (`social.ROOM_ID`).
- Habits: scrolls around the art instead of tracking; types fast and sends in bursts; pastes things into the chat;
  reloads when anything looks stuck; presses Back to leave.
- A desktop or a laptop with a mouse or a trackpad, or a tablet by touch.

## What they lean on

- The lobby: its cards, Join, the filter, who's here ([The lobby](../../social.md#the-lobby)).
- Members and guests: Sign in to chat ([Members and guests](../../social.md#members-and-guests)).
- Watching: the ROOM tab, tracking, Track, zoom, Follow, Exit ([Watching](../../social.md#watching)).
- The chat ([Chat](../../social.md#chat)), and Blocking and reporting
  ([Blocking and reporting](../../social.md#blocking-and-reporting)).
- An invitation to draw and Back to watching ([Drawing together](../../social.md#drawing-together)).
- Links, reloads, Back and Forward ([The address, Back and Forward](../../social.md#the-address-back-and-forward)).

## What makes them give up

- A room that takes long to show its art, or a view that keeps jumping back to the host when he's looking around.
- Messages that vanish, or a box that eats what he typed.
- Drawing with someone and losing his own unsaved art, or not finding his way back to watching.
- A troll he can't shut up or get away from.
- Being thrown out of a room by a reload.

## Sizes

- A room of 12 people: the host and 11 watchers, Theo among them; then a room at its Max watchers, where the next one
  in is refused.
- Chat: messages of up to 300 characters; 60 or more before he scrolls back (the newest 50 show, the rest load as he
  scrolls up); 5 sent in a burst.
- The host's art: `gradient.png` at 80 columns (80 by 40 lines, 3,200 cells), zoomed from 25% to 100%.
- Two to three people drawing while he watches: the host, `tin_owl`, and Theo when invited.
- An evening: four rooms joined and left, with `qa.memory` at the start and end of each section.

## Traits

- No phone: rooms need a wide screen, so Theo is a desktop, a laptop or a tablet. On a tablet, Report on a message
  shows by tabbing to it or a tap, not a hover, and looking around is a touch drag.
- `account`: a guest arrives as a guest, watches, and signs in from the chat at step 10; signed in, he arrives as
  `theo_watches`. From step 10 on both are signed in. A guest can't chat, be invited or report until then.
- `language`: on a French run, the `social` helpers that press buttons by their English names (`goLive`,
  `joinFromCard`, `followLink`, `openLobby`, `fromMenu`, `invitedPage`, `artistPage`) fail. Make the other people's
  moves by the names their pages show; `fakeServer`, `fakeRoom`, `member`, `watcherPage` and the store reads work in any
  language.
- `interruption`: as the README has it; a `reload` drawn lands while he has unsaved paint on his own art in another
  tab of the app.
- No partner.
- What the fake server can't reach, each step that needs it opened `rated: false` with a note (the README's
  [A step that can't be done](../README.md#a-step-that-cant-be-done)): the cards' Join counts, pictures and live times
  changing as people come and go (they're the fake's list); creating an account (its check that he's not a script
  can't run here), signing in with Discord or GitHub, and email links; a host on another machine or network ("Couldn't
  reach this host" can't happen when every page is on this one).

## Goals
- When I join a room, the host's art shows right away.
  Counted: ms on join-room, target 2000, lower is better.
- My messages never vanish, and the box never eats what I typed, even when I send too fast.
- I can say yes to drawing and get back to watching, with my own unsaved art in my other tab as I left it.
- A troll in the chat is out of my sight in a couple of moves.

## Script

Each `##` heading after this one, up to Known, is a section of the script. Steps are numbered through the whole
script. Every section ends with Free time.

## Arriving

### 1. See who's live
- Does: takes `qa.memory`; fakes the server for his page and sets the host live (What they bring); opens the Social
  tab.
- Expects: the lobby: at the top his name after its cell with Edit account and Sign out (signed in), or a guest
  nickname with a guest tag, Sign in to socialize and "No account? Create one" (a guest), and no Start a room for a
  guest; Public rooms with "3 live" and three cards, each with its name, the host's name, how long it's been live, its
  signal and Join with its count, "Join (0/12)"; signed in, the neon harbor card says "Someone you blocked is here";
  In the lobby counts who's signed in and who's a guest, him marked (you) ([The lobby](../../social.md#the-lobby)).
- Probes: `interrupt`: reload with the lobby showing and check his guest nickname (or his name) is the same;
  `free`: point at a card's ⋯ and read what's in it.
- Rated: yes, wants a key to reach the side panel's Social tab (Tab-walking is the path today)

### 2. Narrow the list
- Does: opens the filter menu at the right of Public rooms and picks Wants feedback, Open to chat, Heads down, then All.
- Expects: each shows only the rooms with that signal; Heads down has none and says "No rooms match this filter"; All
  shows them all again ([The lobby](../../social.md#the-lobby)).
- Probes: `again`: pick the same filter twice; `out-of-order`: pick a filter, then reload and see what it starts on.
- Rated: yes, wants Tab to the filter, then the arrows

### 3. Rooms I can't get into
- Does: reads the quiet docks and full house cards and presses full house's Join; as a guest, quiet docks' Join too.
  Signed in, quiet docks is open to him, so he only reads it (joining it would reach the same fake room).
- Expects: a grayed Join says why beside it: "Room is full" on full house, and, as a guest, "Signed-in users only" on
  quiet docks; pressing a grayed Join does nothing ([The lobby](../../social.md#the-lobby)).
- Probes: `out-of-order`: tab to a grayed Join and press Enter; `extremes`: narrow the window to the smallest the side
  panel shows at and check the reason still fits beside Join.
- Rated: no (reading the lobby)

### 4. Join from the card
- Measured: join-room
- Does: presses Join on neon harbor.
- Expects: "Joining…" and "Waiting for the host…", then the ROOM tab, after SAUCE, shows just the host's art, view
  only, in the host's font; the side panel's Social tab becomes CHAT, with the room's name, "hosted by ansi-fan", Exit,
  and the welcome pinned under them ("Pinned note"); "You joined" in the log; a box in the host's color with a tag in
  its corner, "· tracking"; the address is `/#/room?room=abcdefghij`. The art shows within the `file` budget of the press
  ([Watching](../../social.md#watching)).
- Probes: `again`: press Join twice quickly and check he's in once (the host's N here counts him once);
  `interrupt`: switch to PIXEL and back while it's joining.
- Rated: yes, wants Enter on a focused Join

### 5. Exit, and come back by a link
- Does: presses Exit; then opens the shared link (`/?room=abcdefghij`), answers Not now; opens it again and presses
  Join.
- Expects: Exit takes the ROOM tab away, puts him back on the tab he was on, and brings the lobby back; the link asks
  "Join this room?" with "You followed a link to it. Joining connects your browser directly to the host's, so the host
  can see your IP address."; Not now leaves him in the lobby at a plain address; Join puts him in the room
  ([The address, Back and Forward](../../social.md#the-address-back-and-forward)).
- Probes: `back-out`: Escape at the question instead of Not now; `out-of-order`: open a link that can't be a room's
  (`/?room=nope`), which says "This room isn't available" without asking.
- Rated: yes, wants Enter on Join in the question

**Free time:** he'd open the link in a second tab while watching in the first ("You're watching this room in another
tab" in the older one), then join again from the first and close the second, so he's watching there for step 6;
point at the host's name on a card, look for a way to see a room before joining it, and
narrow the window until the side panel goes.

## Watching

### 6. Follow the host's view
- Does: watches while the host scrolls down, zooms ANSI out to 50%, and goes to PIXEL and back (setup moves on the
  host's page).
- Expects: while he tracks, the art follows the host's view: drawn at the host's zoom (never above 100%), smaller
  still if that's what fits all of the host's view in his window; the box is the host's whole view
  ([Watching](../../social.md#watching)).
- Probes: `extremes`: shrink his window to the smallest that keeps the side panel and check the host's whole view
  still fits; `speed`: have the host scroll fast for two seconds and time his art keeping up with `qa.frames`.
- Rated: no (watching)

### 7. Look around on my own
- Does: scrolls the art with the wheel (a touch drag on a tablet), then with the arrow keys after clicking the art;
  presses Track; scrolls the host's box out of sight.
- Expects: scrolling stops tracking and keeps his zoom; the tag becomes a "Track ›" button; Track brings back the host's
  view at the host's zoom; with the box out of sight its tag waits at the art's edge with an arrow pointing to it
  ([Watching](../../social.md#watching)).
- Probes: `interrupt`: have the host scroll while he's looking around, and check his view stays put; `again`: press
  Track twice.
- Rated: yes, wants the arrows to look around and a key for Track

### 8. Zoom in to see the characters
- Does: presses + in the art's corner up to 100%, − down to 25%, then zooms with Ctrl+wheel (a pinch).
- Expects: the art zooms from 25% to 100% and no further; zooming stops tracking, like looking around; Track goes back to
  the host's zoom ([Watching](../../social.md#watching)).
- Probes: `extremes`: press + ten times past 100% and − ten times past 25%; `speed`: Ctrl+wheel quickly with
  `qa.frames`.
- Rated: yes, wants a key to zoom the art (− and =)

### 9. Work on my own art while I watch
- Does: goes to ANSI, where his own photo is open (opened from the start screen before joining, or from Choose a file
  now), paints a stroke on it, then back to ROOM; on ROOM presses letters, Space and Cmd+Z.
- Expects: the room keeps running on ROOM and the chat stays beside his work; watching never changes his own art; on
  ROOM, letters, Space and Cmd+Z leave his art and its tools alone ([Watching](../../social.md#watching)).
- Probes: `undo-redo`: back on ANSI, undo his stroke and redo it, and check the room didn't move; `interrupt`: have the
  host draw while he's on ANSI, then go to ROOM and check the art caught up.
- Rated: yes, wants the tablist's arrows to move between ANSI and ROOM

**Free time:** he'd look for the host's name on the art's tag and what it shows, try to select or copy cells from the
ROOM tab, open PIXEL to see whether his own art's PIXEL view is still his, and read the shortcut list (`?`) on ROOM.

## Chatting

### 10. Sign in to chat
- Does: a guest presses Sign in to chat at the foot of the chat panel, closes the page once with ×, presses it again
  and signs in with his email and a password. Signed in from the start, he reads the foot of the panel and opens Edit
  account from the lobby instead, and closes it.
- Expects: a guest's foot shows Sign in to chat in place of the message box; the sign-in page opens over the room and
  closing it goes back to the room; signed in, he's back in the same room as `theo_watches`, with the message box and
  "[ theo_watches ]" on its border; his own coming and going isn't shown in the log as someone else's
  ([Members and guests](../../social.md#members-and-guests), [Chat](../../social.md#chat)).
- Probes: `back-out`: Escape on the sign-in page; `interrupt`: press Back while the sign-in page is open, and check he's
  still in the room.
- Rated: yes, wants Tab to Sign in to chat, then Enter

### 11. Say hello
- Does: clicks the message box, types a hello, presses Enter; then a two-line message with Shift+Enter; has the host
  answer.
- Expects: his message shows with his name, "(you)" and a time, and reaches the host; Shift+Enter makes a new line;
  the box grows to 5 lines, then scrolls; Send is gray with nothing to send, purple with text
  ([Chat](../../social.md#chat)).
- Probes: `again`: send the same message twice; `out-of-order`: press Enter in an empty box, and in a box of only
  spaces (nothing is sent).
- Rated: yes, wants a key to put the cursor in the message box

### 12. A long message
- Does: types a long message, then pastes 1,000 characters, then a 300-character word with no spaces, then a line of
  emoji and wide characters (`漢字`, 👍🏽, 🇺🇸).
- Expects: the box stops at 300 characters (the 301st can't be typed, and a paste is cut there); a long word wraps in
  the log without widening the panel; emoji and wide characters show whole in the box and the log
  ([Chat](../../social.md#chat)).
- Probes: `extremes`: paste text with a tab, a zero-width joiner and a right-to-left word; `back-out`: type a long
  message, switch to ANSI and back, and check it's still in the box.
- Rated: no (typing the message)

### 13. Fast messages
- Does: sends five short messages as fast as he can, then waits a second and sends one more.
- Expects: three go at once, then one a second; a refused one stays in the box with "Easy there—wait a moment before
  sending again.", and what he typed after it is kept; after a second it sends ([Chat](../../social.md#chat)).
- Probes: `speed`: hold Enter with text in the box for two seconds; `again`: send the kept text as soon as he can, and
  check it isn't sent twice.
- Rated: yes, wants Enter

### 14. Scroll back through a busy chat
- Does: has the host and `tin_owl` send 60 messages between them; then scrolls the log to the top and back down while
  one more arrives.
- Expects: the newest 50 show; "↑ Scroll up for earlier messages" loads the rest as he scrolls up; "You joined" marks
  where he came in; a message arriving while he's scrolled up keeps his place, and at the bottom the log follows it
  ([Chat](../../social.md#chat)).
- Probes: `speed`: scroll up as fast as the wheel goes for two seconds with `qa.frames`; `interrupt`: fold the panel
  with », have three messages arrive, and check the arrow counts them, then « opens it.
- Rated: yes, wants Page Up and Page Down in the log

**Free time:** he'd paste a link into the chat to see whether it's a link, select and copy someone's message, drag the
panel's left edge wider and double-click it back, and type a message with his name in it.

## Drawing when asked

### 15. Follow an artist
- Does: the host makes `tin_owl` an artist (setup); Theo reads the chat panel's list of who he can follow, presses
  Follow for `tin_owl`, then Show everyone, then Show box off.
- Expects: the list shows the host and `tin_owl`, each with Follow (Following for the one he's on), starting on the
  host; following `tin_owl` tracks their whole view, with only their box; Show everyone adds the others' boxes and tags;
  Show box off hides the followed box while he keeps following ([Watching](../../social.md#watching)).
- Probes: `interrupt`: the host puts `tin_owl` back to watching while he follows them, and he's back on the host;
  `out-of-order`: look for the list with nobody drawing (none of it shows).
- Rated: yes, wants Tab to Follow, then Enter

### 16. Not now
- Does: the host makes him an artist (`social.fromMenu(host, 'Make artist', 'theo_watches')`); he reads the notice,
  then presses Not now.
- Expects: "ansi-fan invited you to draw together." in the chat panel with Accept and Not now; it blocks nothing, so
  he can save his own art first; with his photo's paint unsaved it says "Accepting replaces your current canvas (you
  have unsaved changes)."; Not now clears the notice ([Drawing together](../../social.md#drawing-together)).
- Probes: `back-out`: press Escape with the notice showing (does it stay?); `again`: the host asks again right away,
  and the notice comes back once.
- Rated: yes, wants Tab to Not now, then Enter

### 17. Accept
- Does: saves his own art with Cmd+S first; the host asks again; he presses Accept.
- Expects: the room's art opens in the ordinary tabs and his row on the host's side says artist; what he had open is in
  the browser's own list ("Pick up where you left off" in a new tab); his ROOM tab shows his own copy of the art, strokes
  that haven't reached the host included ([Drawing together](../../social.md#drawing-together)).
- Probes: `interrupt`: open a second tab of the app and check his photo is offered there, then close it; `out-of-order`:
  press Accept on a notice the host has just withdrawn (it's gone).
- Rated: yes, wants Tab to Accept, then Enter

### 18. Draw with them
- Does: paints a few strokes and types a word near the host's; looks at the left column and SAUCE; presses Cmd+Z.
- Expects: everyone sees his strokes as he makes them, and he sees the host's and `tin_owl`'s; each other artist's mark
  and name shows at their cell (Show others' cursors, on by default); he draws in the host's font and size; the
  settings, sliders, SAUCE fields, base layer, Bake, Flatten and Merge down are off with "Only the room's host can
  change this."; Cmd+Z takes back only his own edits ([Drawing together](../../social.md#drawing-together)).
- Probes: `undo-redo`: undo his stroke, redo it, undo it; then have the host draw over a cell of his and undo again,
  and check the host's stays; `again`: draw on the very cells the host just drew.
- Rated: no (drawing)

### 19. Put back to watching
- Does: the host chooses Back to watching in his ⋯ (setup); he draws a stroke afterward, presses Cmd+Z, and looks at
  ROOM.
- Expects: "You're back to watching." once in his open chat; the art stays open as an ordinary document to save or keep
  working on, its undo emptied; nothing he draws on it reaches the room; ROOM shows the host's art again
  ([Drawing together](../../social.md#drawing-together)).
- Probes: `undo-redo`: Cmd+Z right after (nothing to undo from before), then on the new stroke; `interrupt`: reopen his
  saved photo from "Pick up where you left off" in a new tab and check it's as he saved it.
- Rated: no (the host's move)

**Free time:** he'd save the room's art as a .phosphor while he's an artist, look for a way to ask the host to draw
again, check his own tool and colors came back, and see what the host's view looks like on ROOM after drawing.

## Trouble in the room

### 20. Someone I blocked is here
- Does: has `loud_crow` join and post two messages; presses Show on one.
- Expects: their messages fold to a single line, "Message from someone you blocked", with Show; Show opens just that
  one; nobody else sees any difference ([Blocking and reporting](../../social.md#blocking-and-reporting)).
- Probes: `again`: press Show on the second as well; `interrupt`: reload and check the fold is back.
- Rated: yes, wants Tab to Show, then Enter

### 21. Report a message
- Does: has `spam_gull` join and flood the chat; points at one of their messages, presses Report, picks Spam or
  flooding and presses Report.
- Expects: Report shows in place of the message's time on hover or tab; a box asks "Report spam_gull?" and "What's
  wrong?" with Spam or flooding, Harassment or hate, Sexual or violent and Something else, and says what's sent; Report
  stays off until a reason is picked. Afterward he sees "Reported. Thank you." for a few seconds, and nothing more;
  Report goes away for `spam_gull` in this room ([Blocking and reporting](../../social.md#blocking-and-reporting)).
- Probes: `back-out`: Cancel, then Escape, each sending nothing, with focus back on the message's Report;
  `out-of-order`: look for Report on his own message, on the host's deleted message, and on a guest's line.
- Rated: yes, wants Tab to the message's Report, then Enter

### 22. Block the troll
- Does: looks for a way to block `spam_gull`: on their message, beside their name, in the chat panel's header, and in
  Edit account (See who you blocked).
- Expects: Block shows beside Report in place of their message's time on hover or tab; a box asks "Block spam_gull?"
  with Block and Cancel; Block folds their messages to "Message from someone you blocked" at once, and he stays in the
  room. See who you blocked lists `spam_gull` and `loud_crow`, each with Unblock
  ([Blocking and reporting](../../social.md#blocking-and-reporting)).
- Probes: `back-out`: Cancel, then Escape, each blocking nothing, with focus back on the message's Block;
  `out-of-order`: Unblock `loud_crow` from See who you blocked, come back, and check their messages unfold, then block
  them again from one of their messages; `free`: try right-clicking a person's name in the chat.
- Rated: yes, wants Tab to the message's Block, then Enter

### 23. Report the room
- Does: presses Report under Exit, picks Something else, presses Report.
- Expects: "Report this room?" and "What's wrong?" with the same four reasons, and the box says what's sent; afterward
  "Reported. Thank you." for a few seconds, and nothing more; Report room goes away for this room
  ([Blocking and reporting](../../social.md#blocking-and-reporting)).
- Probes: `back-out`: Cancel first; `interrupt`: Exit and join again, and check Report room is still gone.
- Rated: yes, wants Tab to Report room, then Enter

**Free time:** he'd open a card's ⋯ in the lobby to report a room from there, check whether `spam_gull` is still
talking, read the Community Guidelines from the lobby, and look at what the host's side shows of him.

## A full room

### 24. A room of 12
- Does: takes `qa.memory`; has members join until the room holds 12 people (the host and 11 watchers, him among them),
  each saying a line; then the host lowers Max watchers to 11 and saves, and one more member tries the link.
- Expects: comings and goings with nothing said between them share one line ("tin_owl joined, …"); his view and chat
  keep up; the one more is refused with "Room is full" ([When something goes wrong](../../social.md#when-something-goes-wrong)).
  Time a message reaching him against `response`, and take `qa.memory` again.
- Probes: `extremes`: have everyone send a message at once, three times, and check none is lost in his log;
  `speed`: scroll the log while they do, with `qa.frames`.
- Rated: no (watching)

### 25. Track through the crowd
- Does: with the room full, the host makes `tin_owl` an artist again (setup), and both draw; he follows the host, then
  `tin_owl`, then looks around and Tracks back.
- Expects: as in steps 7 and 15, with no lag from the crowd; frames stay in the `frame` budget while he scrolls.
- Probes: `speed`: the host and an artist scroll at once for two seconds while he follows one; `interrupt`: half the
  members leave at once, and the presence line says so.
- Rated: yes, wants Tab to Follow, then Enter

**Free time:** he'd count the people in the room from what the screen shows, open his own art beside it and paint, try
the shortcut list, and see how the chat reads with the panel at its narrowest.

## Reloads and leaving

### 26. Reload while watching
- Does: following `tin_owl`, reloads his page.
- Expects: he's back in the room without being asked to join, on the address he was on, with the art, the chat and
  the welcome; he starts on the host again; the host's list counts him once
  ([The address, Back and Forward](../../social.md#the-address-back-and-forward)).
- Probes: `again`: reload twice quickly; `interrupt`: reload while a message is half typed in the box (lost or kept:
  note which).
- Rated: no (a reload)

### 27. The host reloads
- Does: has the host reload their page (accepting its leave-page question).
- Expects: the art dims and says "The host is reconnecting…" until it's back; he isn't asked to join again; the host's
  edits after the reload reach him ([Watching](../../social.md#watching)).
- Probes: `interrupt`: send a message while the host is away and see what happens to it; `back-out`: press Exit while
  it's reconnecting.
- Rated: no (the host's move)

### 28. Back and Forward
- Does: in the room, presses the browser's Back until he leaves, then Forward; then Exit, then Back and Forward again.
- Expects: Back past the page where he joined leaves the room, and Forward joins it again without asking; a room he left
  with Exit isn't joined again by Back, Forward or a reload
  ([The address, Back and Forward](../../social.md#the-address-back-and-forward)).
- Probes: `speed`: Back and Forward five times quickly; `out-of-order`: Forward with nothing ahead.
- Rated: no (the browser's own Back and Forward, `page.goBack()` and `page.goForward()`)

### 29. The room ends
- Does: joins again from the card (step 28 left with Exit), then has the host press End room and End room.
- Expects: "The host ended the room"; he's back in the lobby, the ROOM tab gone, his own art as it was; the art goes
  with the room (Phosphor keeps no copy); a reload doesn't join it again ([Watching](../../social.md#watching)).
  Takes `qa.memory`.
- Probes: `out-of-order`: open the shared link again ("This room isn't available"); `interrupt`: have it end while he's
  on ANSI drawing, and check his work is untouched.
- Rated: no (the host's move)

**Free time:** he'd look for a way to keep a copy of the art he watched, check the lobby no longer lists neon harbor
(on the fake it does until the list changes: note it), sign out and see the lobby as a guest, and join another room's
link.

## Known
