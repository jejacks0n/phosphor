# Juno: draws live in her own room

## Who

Juno draws in front of people two or three evenings a week. She sets up a room, posts its link where her regulars
hang out, talks in the chat while she works, and now and then invites someone she knows to draw with her. She knows
Phosphor's editor well, and she knows what a stream needs: the room up quickly, the chat readable, trolls gone in one
move, and nothing lost when her browser hiccups. What she draws changes from night to night: one evening a photo, the
next an .ans scene, a banner, a vector piece or an old long file.

## Why they're here

She wants an evening's session to run without a hitch: a room set up the way she likes it (named, welcomed, public or
behind a password, guests or not), people coming in and chatting, a regular invited to draw beside her, undo that takes
back only her own strokes, a troll dealt with, a reload that doesn't drop anyone, the room handed to someone else and
back, and at the end the numbers for the night and the art saved. Done is a room ended on purpose, with her art
intact and saved as a .phosphor.

## What they bring

- Her account, by the `account` trait (the README's Starting, driving, ending): her page is `context.pages()[0]`, faked
  before she opens SOCIAL with `social.fakeServer(juno, { me, room })`, where `room` is one `social.fakeRoom()` the
  whole run shares (keep it on `globalThis` so later snippets reach it). Signed in, `me` is `social.member()`; a guest
  starts with `me: null` and signs in from the lobby by password, which makes her that same member. On the fake she's
  `ansi-fan`.
- The art of the drawn `partner`, opened as that persona opens it (see Traits): `images/photo.jpg`, `scene.ans`, a
  blank canvas or `long.ans` (`files.writeFiles(join(runDir, 'files'))` for the .ans files).
- The other people, each a page of the same context made with `social.watcherPage(context, room, { me })`, then
  `goto('/')` and the lobby card's Join (`social.joinFromCard`) or the room's link (`social.followLink`). The other
  people's moves are setup, not her steps: the `social` helpers may make them.
  - `tin_owl` (`social.ARTIST`): a regular, the one she invites.
  - `pixel_fox` (`social.member({ id: 'u_4', username: 'pixel_fox', name: 'pixel_fox', email: 'fox@example.com' })`):
    a chatty watcher, her second artist.
  - `spam_gull` (`u_9`) and `loud_crow` (`u_8`), members made the same way: the trolls.
  - One guest (`me: null`). The fake gives every guest the same account, so a second guest takes the first one's
    place: one guest at most.
  - For the sizes, more members with ids `u_10` and up.
- Her room's name is "neon harbor", the name the other pages' lobby card lists (`watcherPage` lists one room by that
  name, hosted by `ansi-fan`).
- Habits: keeps the chat open beside every tab; types a hello before she draws; checks the room from a watcher's eyes
  (a screenshot of a watcher's page) after anything big; reaches for keys first, as everyone does in a run.
- A desktop or a laptop with a mouse or a trackpad, or a tablet by touch.

## What they lean on

- The lobby, signing in, Start a room and Set up your room ([The lobby](../../social.md#the-lobby),
  [Members and guests](../../social.md#members-and-guests), [Starting a room](../../social.md#starting-a-room)).
- The chat panel: N here, each person's ⋯ (Make artist, Back to watching, Make host, Remove from room, Quiet mute,
  Block from your rooms), Delete on a message, the room menu (Copy link, Settings and stats) and End room
  ([Hosting](../../social.md#hosting), [Chat](../../social.md#chat)).
- Drawing together and handing over ([Drawing together](../../social.md#drawing-together),
  [When the host changes](../../social.md#when-the-host-changes)); shapes and art layers in a room
  ([Rooms](../../vector.md#rooms)); the layers a room holds ([Layers](../../layers.md#the-left-column)).
- A reload while live, and Back while live ([The address, Back and Forward](../../social.md#the-address-back-and-forward)).
- Whatever her partner leans on, from their file.

## What makes them give up

- The room dropping, or her art lost, when she reloads or the connection blinks while people are watching.
- Undo taking back someone else's strokes, or hers going missing after someone else's.
- A troll she can't get rid of quickly, or a Remove or Block that doesn't hold.
- A setting she can't change while live, with nothing saying why.
- Ending the room by accident, or not being able to end it.

## Sizes

- One room: up to 12 watchers (Max watchers' default; 1 to 30 allowed). In an ordinary run, up to 5 pages besides
  hers (`tin_owl`, `pixel_fox`, the guest, `spam_gull`, `loud_crow`); step 8's `extremes` probe fills the room to 12
  with nine more members, and step 13's brings five of its own; each probe closes its pages after it.
- Up to 7 people drawing (her and six artists), where the room's own limit stops Make artist.
- Her art is her partner's: `photo.jpg` at 80 by 27 lines (2,160 cells), `scene.ans` at 80 by 6, a blank canvas at 80
  by 25 (2,000 cells), or `long.ans` at 300 by 1,600 (480,000 cells, the biggest art a room is sent).
- A room holds the base, at most one vector layer and one layer above them: 3 layers at most, no frames.
- Chat: a few hundred messages in a session (the host keeps the last 5,000), messages of up to 300 characters.
- A session of an hour or more, with `qa.memory` at the start and end of each section.

## Traits

- No phone: rooms need a wide screen, so Juno is a desktop, a laptop or a tablet. On a tablet, Delete and Report on a
  message show by tabbing to it or a tap, not a hover.
- `account`: decides step 2 (see What they bring). Everything after is as a signed-in member.
- `partner`: whose art she draws. Her drawing steps (10 and 14) say "do the partner's sections"; these are their
  sections, by heading in that persona's file:

  | Partner | Step 1 opens | Step 10, live with people watching | Step 14, drawing together |
  | --- | --- | --- | --- |
  | `maya` | `images/photo.jpg` | [The filters and their order](maya.md#the-filters-and-their-order) (steps 8 to 11) | [Dithering](maya.md#dithering) (steps 12 to 14, on her photo) |
  | `dex` | `scene.ans`, Edit it | [Drawing character by character](dex.md#drawing-character-by-character) (steps 4 to 9) | [Blocks: select, copy, move](dex.md#blocks-select-copy-move) (steps 10 to 14) |
  | `priya` | a blank canvas | [Setting up the scene](priya.md#setting-up-the-scene), steps 2 to 4 | the same section's steps 5 and 6 (art layers) |
  | `sam` | a blank canvas | [A banner from text](sam.md#a-banner-from-text) (steps 2 to 7) | [Widths](sam.md#widths) (steps 8 to 10) |
  | `walt` | `long.ans`, Edit it | [The long file](walt.md#the-long-file) (steps 2 to 7) | [SAUCE at its limits](walt.md#sauce-at-its-limits) (steps 12 to 15) |

  A room refuses some of what those steps do, and says so: no adding, deleting, duplicating or moving layers while
  live (only + Vector layer when there's none, added directly on the base), no layer's own character settings (the
  Characters section is always Base's), no Animate ("Live rooms don't support animations yet."), and while anyone else
  is drawing no Open, new image, blank canvas, restoring a version or Clear ("Unavailable while co-artists are
  drawing."). A partner's step that runs into one of these is tried once; a refusal the docs promise
  ([Drawing together](../../social.md#drawing-together)) isn't a finding, and the step goes on without it (Dex's step
  11 moves its block on Layer 1, Priya's step 2 skips step 1's Animate). A refusal with no reason given is.
- `language`: on a French run, the `social` helpers that press buttons by their English names (`goLive`,
  `joinFromCard`, `followLink`, `openStats`, `fromMenu`, `invitedPage`, `artistPage`) fail. Make the other people's
  moves by the names their pages show; `fakeServer`, `fakeRoom`, `member`, `watcherPage` and the store reads work in any
  language.
- `interruption`: as the README has it. A `reload` while live is also step 22's; on a run that draws it, put the drawn
  one in another section, with unsaved work.
- What the fake server can't reach, each step that needs it opened `rated: false` with a note
  (the README's [A step that can't be done](../README.md#a-step-that-cant-be-done)): the lobby card other people see
  for her room (its picture, Join count, signal and how long it's been live are the fake's list, not made from her
  room); signing in with Discord or GitHub; email links; a real network between two machines (every page is on this
  one, so "Couldn't reach this host" can't happen).

## Script

Each `##` heading after this one, up to Known, is a section of the script. Steps are numbered through the whole
script. Every section ends with Free time.

## Getting ready

### 1. Open tonight's art
- Does: takes `qa.memory`; on the start screen opens what her partner opens (the table in Traits): the photo with
  Choose a file, an .ans with Choose a file and Edit it, or "Or start with a blank canvas".
- Expects: it opens as it does for that persona (their step 1); LAYERS shows Layer 1 over Base; the side panel shows
  LAYERS and Social (marked Beta). Opening takes under the `file` budget.
- Probes: `back-out`: for an .ans, press Cancel at the question first; `again`: open the same art a second time, and
  check New project asks about unsaved changes only if there are any.
- Rated: yes, wants Cmd+O (Cmd+N for a blank canvas)

### 2. Come into SOCIAL as myself
- Does: fakes the server for her page (What they bring), then opens the Social tab. As a guest she presses Sign in to
  socialize and signs in with her email and a password; signed in, she reads the top of the lobby.
- Expects: a guest sees a guest nickname with a guest tag, Sign in to socialize, "No account? Create one", and no Start
  a room; once signed in (or from the start, signed in) the top shows `ansi-fan` after its cell, with Edit account and
  Sign out, and Start a room sits under Public rooms; In the lobby lists her, marked (you)
  ([Members and guests](../../social.md#members-and-guests)).
- Probes: `out-of-order`: as a guest, open the Start a room address (`/#/social/start`) before signing in: it doesn't
  open, and the lobby shows; `back-out`: open Sign in and close it with × and with Escape, and check where focus lands;
  `interrupt`: reload with the lobby showing and check she's still signed in; `free`: press Create one to see what a
  new account asks, then close it.
- Rated: yes, wants a key to reach the side panel's Social tab (Tab-walking is the path today)

### 3. Check my art fits a room
- Does: presses + Layer to add a second cells layer, opens Start a room and looks at Go live; closes it, undoes the
  layer; then turns Animate on, adds a frame, and looks again; undoes the frame and turns Animate off.
- Expects: with a layer too many, Go live is off and says "For now, a room holds at most Base, one vector layer and
  one layer above them, all with the same character settings. Merge or delete layers to go live."; with two frames it
  says "Live rooms don't support animations yet."; once the art fits again, Go live is on
  ([Drawing together](../../social.md#drawing-together)).
- Probes: `undo-redo`: undo the layer, redo it, undo it again, and check Go live follows; `out-of-order`: give Layer 1
  character settings of its own and check Go live says why, then undo them.
- Rated: yes, wants a key for Start a room

**Free time:** she'd open Edit account and look at her name's cell and glyph, try Start a room with nothing open
(New project first, then put her art back from "Pick up where you left off"), read the filter menu over the empty
lobby, and look at Who's here.

## Setting up the room

### 4. Fill in my room
- Does: opens Start a room and fills Set up your room: Room name "neon harbor", a two-line Welcome message, Public in
  the lobby, Allow guests on, Max watchers 12, Signal "Wants feedback"; looks at the Lobby picture beside them.
- Expects: the Room settings box beside the Lobby card box (below it in a narrow window); a count under the welcome
  as she types (up to 200); "Rooms stream directly from your browser. Up to 12 watchers suits most home connections."
  under Max watchers; the Lobby picture frames part of her art, about twice as wide as tall
  ([Starting a room](../../social.md#starting-a-room)).
- Probes: `extremes`: a 61-character name (it stops at 60), a name of only spaces (refused: "Use at least one character
  that isn't a space"), a 250-character welcome with emoji, Max watchers 0, 31 and 999 (a higher number goes back to
  30), then put back her values; `back-out`: close the box with × halfway, reopen it, and check what she typed is still
  there.
- Rated: yes, wants Tab between the fields

### 5. Go live behind a password first
- Does: picks Unlisted (link only), types a password, presses Go live; opens Settings and stats from the room menu;
  has `tin_owl` follow the room's link, type a wrong password, then the right one; then ends the room from Settings and
  stats (End room, then End room in the question).
- Expects: the Lobby card box goes for a link-only room; Settings and stats says "Send the link and the password to
  anyone you want in.", and under Room settings "Set when the room started": Only with the link, Password set;
  `tin_owl` is asked Join this room?, then for the password ("Wrong password", then in); ending says "End this room?"
  and "Everyone will be disconnected (including co-artists) and the room chat will clear.", and `tin_owl` sees "The host
  ended the room" ([Hosting](../../social.md#hosting)).
- Probes: `back-out`: press Cancel at End this room? and check the room goes on; `out-of-order`: look for a way to
  change the password or make the room public while it's live (they stay as set: that's the docs' rule, not a
  finding).
- Rated: yes, wants a key for End room, then Enter

### 6. Go live in public
- Does: on the fake an ended room stays ended, so first makes a new `social.fakeRoom()` and fakes her page again with
  it (`social.fakeServer(juno, { me, room })`: the newer routes answer first), and `tin_owl`'s page too; then Start a
  room again, the public room of step 4 (check what the form kept), Go live.
- Expects: the box closes and she's back on her art; the side panel's Social tab is now CHAT, with End room in its
  header beside the room menu; the address carries `?room=abcdefghij`; she draws as usual
  ([Starting a room](../../social.md#starting-a-room)).
- Probes: `again`: press Go live twice quickly and check one room starts (one `POST /api/rooms`); `interrupt`: switch to
  PIXEL, SAUCE and back, and check the address and CHAT follow.
- Rated: yes, wants Enter on Go live

**Free time:** she'd press Copy link and paste it into the chat box (if the browser refuses, "Couldn't copy the link"
should say so), open Settings and stats and read Room settings' facts, fold the side panel with » and open it with «,
and drag the panel wider.

## Live, with people watching

### 7. People come in
- Does: has `tin_owl` join from the lobby card, the guest follow the link, and `pixel_fox` join from the card; opens
  "N here" in the chat panel.
- Expects: the chat shows who joined between messages, comings and goings with nothing said between them on one line;
  "3 here", folded; opened, each name after its cell, the guest tagged guest, each tracking her (or connecting…); a
  member's row has a ⋯ and the guest's has none ([Hosting](../../social.md#hosting)).
- Probes: `again`: have `tin_owl` leave and come back, and check the line says came back; `out-of-order`: open N here
  before anyone's there; `speed`: have three people join at once.
- Rated: yes, wants a key to open N here (Tab, then Enter, is the path today)

### 8. Say hello
- Does: types a hello in the chat box and presses Enter; has `tin_owl` answer.
- Expects: her message shows with her name, a host tag and a time, and reaches every watcher; Shift+Enter makes a new
  line and the box grows to 5 lines, then scrolls; Send is gray with nothing to send
  ([Chat](../../social.md#chat)).
- Probes: `extremes`: a 300-character message with emoji (the 301st character can't be typed), then the full room: 9
  more members join (12 watchers) and each says a line, and she times her own message reaching a watcher against
  `response`, then the nine leave (their pages closed), so later steps aren't refused as "Room is full"; `speed`: send five messages as fast as she can ("Easy there—wait a moment before sending again." after
  three, with her text kept).
- Rated: yes, wants a key to put the cursor in the chat box

### 9. Change the welcome while live
- Does: opens Settings and stats, changes the welcome message, presses Save; looks at a watcher's page.
- Expects: watchers see the new welcome pinned at the top of their chat once she saves; what she typed stays in the
  form if she goes to another tab before saving ([Hosting](../../social.md#hosting)).
- Probes: `back-out`: type a new welcome, press Escape without saving, reopen, and check what's there; `again`: save
  twice within a second and check the latest one is what watchers see.
- Rated: yes, wants a key for Settings and stats

### 10. Draw my partner's first sections live
- Does: does the partner's sections for this step (the table in Traits), live, from that persona's file: each of their
  steps' Does, Expects and probes, with people watching. After each of their steps, screenshots `tin_owl`'s page.
- Expects: everything their file expects, and on top of it: watchers see each change as she makes it, with a box in her
  name color where her view is, at her zoom (never above 100%); going to SAUCE keeps the last view
  ([Starting a room](../../social.md#starting-a-room)). For `walt`, watchers receive the 480,000-cell art: time how
  long until a watcher shows it, and take `qa.memory` on her page and theirs.
- Probes: `interrupt`: scroll and zoom while a watcher tracks, and check the watcher's box follows; `out-of-order`:
  where a partner step adds or moves a layer or opens a file, check the room's refusal says why.
- Rated: no (the partner's work; their steps are rated in their own runs)

### 11. Choose what the lobby card shows
- Does: in Settings and stats, scrolls the Lobby picture frame to another part of her art, ticks Use this exact
  position, scrolls again, then unticks it.
- Expects: the frame scrolls (across, too, for wide art); ticked, it holds what the frame shows whatever she does;
  unticked, it follows her view again ([Hosting](../../social.md#hosting)). What the card shows in other people's lobby
  isn't reachable on the fake: note it.
- Probes: `extremes`: scroll to the far bottom right of the art; `interrupt`: tick it, go to PIXEL and scroll there,
  come back and check the frame held.
- Rated: yes, wants a key to tick Use this exact position (Tab then Space)

**Free time:** she'd read Who came by while people come and go, switch to her own PIXEL view to see what watchers see
change, ask in the chat whether people can see her box, and have a watcher Exit and rejoin from the link.

## Drawing together

### 12. Invite a regular to draw
- Does: in N here, opens `tin_owl`'s ⋯ and presses Make artist; then Withdraw invitation; then Make artist again; has
  `tin_owl` Accept.
- Expects: the row says invited, with Withdraw invitation in the menu; `tin_owl` sees "ansi-fan invited you to draw
  together." with Accept and Not now, which goes when she withdraws; accepted, the row says artist
  ([Drawing together](../../social.md#drawing-together)).
- Probes: `out-of-order`: look for Make artist on the guest's row (guests have no ⋯ and can't be asked);
  `again`: Make artist, Withdraw invitation and Make artist three times quickly, and check `tin_owl` ends with one
  invitation; `back-out`: open the ⋯ and press Escape, and
  check focus is back on it.
- Rated: yes, wants Tab to the row's ⋯, then Enter on Make artist

### 13. Invite a second, up to the limit
- Does: makes `pixel_fox` an artist too; turns Show others' cursors off and on.
- Expects: both artists' marks show at their cells with their names (a tag at the edge for one out of view, which
  goes there when pressed); Show others' cursors off hides them ([Drawing together](../../social.md#drawing-together)).
- Probes: `extremes`: five more members join (ids `u_10` and up); she makes four of them artists, then opens the
  fifth's ⋯: Make artist is off and says "This room already has the maximum number of artists."; then she puts the
  four back to watching and the five leave (their pages closed); `speed`: have both artists draw while she
  scrolls, with `qa.frames`.
- Rated: yes, wants Tab to the row's ⋯, then Enter on Make artist

### 14. Draw my partner's sections together
- Does: does the partner's sections for this step (the table in Traits), live, while `tin_owl` draws strokes and
  types in the same part of the art (setup moves on `tin_owl`'s page).
- Expects: everything their file expects, and: each sees the other's strokes as they happen, before a stroke ends; a
  block moved or pasted reaches the others when it's placed, or after 2 seconds with no further move; `tin_owl` draws
  in her font and size; on `tin_owl`'s page the settings, sliders, SAUCE fields, the base layer, Bake, Flatten and
  Merge down are off and say "Only the room's host can change this."
  ([Drawing together](../../social.md#drawing-together), [Rooms](../../vector.md#rooms)).
- Probes: `again`: draw on the very cells `tin_owl` just drew, and check the last edit wins for both; `interrupt`: for
  `priya`, have `tin_owl` step into an art layer while she tries to (Edit art is off and its title says who is
  drawing); for the others, switch tabs while `tin_owl` draws.
- Rated: no (the partner's work; their steps are rated in their own runs)

### 15. Undo only what I drew
- Does: draws a stroke; has `tin_owl` draw over half of it; presses Cmd+Z; then Shift+Cmd+Z; then has `tin_owl` press
  Cmd+Z.
- Expects: her undo takes back only her stroke and shows what's beneath, `tin_owl`'s half staying; redo puts hers back;
  `tin_owl`'s undo takes back only theirs; every page ends showing the same art ([Drawing
  together](../../social.md#drawing-together)).
- Probes: `undo-redo`: undo, redo, undo again, then draw and check redo is off; `speed`: press Cmd+Z thirty times as
  fast as the page takes it and check none of `tin_owl`'s or `pixel_fox`'s strokes went, then redo them all; `out-of-order`:
  undo with nothing of hers left: nothing changes, and no one else's strokes go.
- Rated: yes, wants Cmd+Z

### 16. What I can't do while they draw
- Does: tries Open, New project, the blank canvas, a version from Versions and Clear; then Merge down on Layer 1 and
  Bake, canceling each warning.
- Expects: Open, new art, restoring and Clear are off and say "Unavailable while co-artists are drawing."; Merge down
  warns first ("Merging down can't be undone while drawing together.") and Bake too ("Baking can't be undone while
  drawing together."), each with a way to back out ([Drawing together](../../social.md#drawing-together)).
- Probes: `back-out`: Cancel and Escape at each warning, checking nothing merged or baked; `out-of-order`: press Cmd+O
  and check the key is refused the same way as the button.
- Rated: yes, wants Cmd+E for Merge down, then Escape at the warning

### 17. Put the artist back to watching
- Does: opens `pixel_fox`'s ⋯ and presses Back to watching; then `tin_owl`'s.
- Expects: each is told once, in their open chat ("You're back to watching."), keeps the art open as an ordinary
  document with its undo emptied, and nothing they draw reaches the room; their row says tracking again; with nobody
  drawing, her Open, New and Clear come back, and Merge down and Bake no longer warn
  ([Drawing together](../../social.md#drawing-together)).
- Probes: `undo-redo`: after both are back, undo one of her own strokes (her undo still works); `again`: Make artist on
  `tin_owl` right away, and check the invitation comes again.
- Rated: yes, wants Tab to the row's ⋯, then Enter on Back to watching

**Free time:** she'd have `tin_owl` save the art as a .phosphor from their page (a project saved by an artist has no
names in it), press `tin_owl`'s cursor tag when it's off screen, and leave `tin_owl` invited and have them Exit (the
invitation clears), then have them join again from the card (step 22 makes them an artist again).

## Running the room

### 18. Read the night's numbers
- Does: opens Settings and stats and reads it all.
- Expects: the name, Live for (H:MM:SS, counting up), Copy link and End room at the top; Here now, Max, Total, Messages
  and Removed, matching what happened so far (a person who came back counts once in Total; joins and leaves aren't
  messages); Who came by lists each visitor with their time, Here now or Left at, and their messages, newest last, with
  "Show N more" past ten rows ([Hosting](../../social.md#hosting)).
- Probes: `again`: have a watcher send a message with the box open, and check Messages and their row count it;
  `interrupt`: close and reopen the box, and check the numbers held.
- Rated: yes, wants a key for Settings and stats

### 19. Turn guests away
- Does: unticks Allow guests and saves without ticking "Also remove the guest currently here"; then opens the guest's
  ⋯ in N here and presses Kick; then ticks Allow guests again and saves.
- Expects: the guest already in stays until she kicks them; while guests are off, the guest's row has a ⋯ with Kick;
  kicked, the guest's page says "The host removed you" and is back in the lobby; a new guest can't get in while guests
  are off ([Starting a room](../../social.md#starting-a-room)).
- Probes: `back-out`: untick, then press Escape without saving and check nothing changed; `out-of-order`: tick "Also
  remove…" and save with no guest in the room (the option isn't there).
- Rated: yes, wants Tab to Allow guests, Space, then Enter on Save

### 20. Quiet a troll
- Does: has `spam_gull` join and post several messages; points at one and presses Delete; then opens `spam_gull`'s ⋯
  and presses Quiet mute (only you see them); has them post again; then Unmute.
- Expects: Delete shows in the time's place on hover or tab, and leaves "Message deleted by the host" for everyone;
  muted, their row says muted and their new messages reach no one else, shown to her marked "Quietly muted — visible
  only to the two of you"; what they said while muted stays hidden from the others after Unmute
  ([Hosting](../../social.md#hosting)).
- Probes: `speed`: delete five of their messages in a row as fast as she can; `out-of-order`: look for Delete on a
  message already deleted.
- Rated: yes, wants Tab to the message's Delete, then Enter

### 21. Remove and block
- Does: opens `spam_gull`'s ⋯ and presses Remove from room; has `spam_gull` try the link again. Then has `loud_crow`
  join, opens their ⋯, presses Block from your rooms, Cancel, then Block from your rooms and Block.
- Expects: removed, `spam_gull`'s page says "The host removed you", and they can't come back until the room ends (the
  fake keeps no list of who was removed, so a rejoin isn't refused there: that part isn't reachable on the fake, and
  is noted, not faked);
  "Block loud_crow?" says "They can't join any room you host, and they leave this one now. Unblock them from Account.";
  blocked, they leave; Removed counts each once ([Hosting](../../social.md#hosting)).
- Probes: `back-out`: Cancel and Escape at Block, with focus back on the ⋯; `interrupt`: have `loud_crow` leave while the
  question is open, then press Block (it still blocks the account, and focus goes to N here); `again`: check Account's
  See who you blocked lists `loud_crow` once.
- Rated: yes, wants Tab to the row's ⋯, then Enter on Block from your rooms, then Enter

**Free time:** she'd Unblock `loud_crow` from Account, lower Max watchers below the number here and see what changes
for people already in, report `spam_gull` from N here (Report in their ⋯), and change the signal while live.

## Reload and hand over

### 22. Reload while live
- Does: makes `tin_owl` an artist again; draws a stroke, waits a second and a half, and reloads her page (accepting the
  browser's leave-page question with `page.once('dialog', (d) => d.accept())`); looks at a watcher's and `tin_owl`'s
  pages while it's away.
- Expects: she comes back at the same address and tab, hosting, not asked to join; the art with her stroke, the chat,
  the numbers and Live for (not restarted) are back; the side panel shows CHAT, as it does in a room
  ([Chat](../../social.md#chat)): if it comes back on LAYERS, that difference is a finding;
  watchers see "The host is reconnecting…" and then carry on; `tin_owl` sees "Waiting for the host to
  reconnect—drawing paused…" and then draws on; everyone sees "Your undo starts over. All the drawing is still here."
  Undo empty after the reload is by design ([Hosting](../../social.md#hosting),
  [When the host changes](../../social.md#when-the-host-changes)).
- Probes: `interrupt`: have `tin_owl` draw while she's away, and check their strokes reach her once she's back;
  `again`: reload a second time while it's still reconnecting.
- Rated: no (a reload)

### 23. Hand the room to my regular
- Does: opens `tin_owl`'s ⋯ and presses Make host; Cancel; then Make host and Make host.
- Expects: "Make tin_owl the host?" with "You'll stay in the room as an artist."; drawing pauses ("Handing off to the
  new host—drawing paused…"); then everyone sees "ansi-fan made tin_owl the host."; she's an artist: host-only controls
  are off for her with "Only the room's host can change this.", her undo is kept, and watchers carry on watching
  `tin_owl` ([When the host changes](../../social.md#when-the-host-changes)).
- Probes: `back-out`: Cancel and Escape at the question; `out-of-order`: look for Make host on a watcher's row (only
  artists, while connected); `undo-redo`: as an artist, undo her last stroke and redo it.
- Rated: yes, wants Tab to the row's ⋯, then Enter on Make host, then Enter

### 24. Take it back
- Does: has `tin_owl` make her the host again from their ⋯ (setup); opens Settings and stats.
- Expects: "tin_owl made ansi-fan the host."; she hosts again, with the chat so far, the room's name and welcome kept;
  the stats start new and no one is muted ([When the host changes](../../social.md#when-the-host-changes)). That
  people removed stay removed isn't reachable on the fake (it keeps no list of them): noted, not faked.
- Probes: `interrupt`: have a watcher reload during the hand back and check they come in watching her; `again`: hand it to `tin_owl` and back a second time,
  and check the chat, name and welcome still carry over.
- Rated: no (the other person's move)

**Free time:** she'd read what `tin_owl`'s page said all along, check Live for didn't restart through the hand
over and back, undo a stroke she drew before handing over, and have a watcher send a message during a hand over.

## Ending

### 25. Back past where I went live
- Does: presses the browser's Back until it would leave the room's address.
- Expects: Back past the page where she went live asks "End this room?" with End room and Cancel; Cancel keeps the room
  and the address ([The address, Back and Forward](../../social.md#the-address-back-and-forward)).
- Probes: `back-out`: Escape at the question; `again`: press Back twice quickly, and check it asks once.
- Rated: no (the browser's own Back, `page.goBack()`)

### 26. End the room
- Does: with `tin_owl` drawing and watchers in, presses End room in the chat panel's header, then End room.
- Expects: "End this room?" with "Everyone will be disconnected (including co-artists) and the room chat will clear.";
  ended, every watcher sees "The host ended the room" and is back in the lobby; `tin_owl` keeps the art as an ordinary
  document; her art stays open; CHAT goes, the lobby is back, and the address loses `?room=`
  ([Hosting](../../social.md#hosting)).
- Probes: `back-out`: Cancel first; `out-of-order`: press Forward afterward and check the room isn't joined or started
  again.
- Rated: yes, wants a key for End room, then Enter

### 27. Save the night's art
- Does: presses Cmd+S and saves; opens the .phosphor in a New project.
- Expects: the art as the room ended it, everyone's strokes in it; no names in the file; layers and settings as they
  were; nothing of the room left open. Takes `qa.memory`.
- Probes: `again`: save twice and check the names differ; `interrupt`: reload before reopening and check "Pick up where
  you left off" offers it.
- Rated: yes, wants Cmd+S, then Enter

**Free time:** she'd start a second room right away with the same settings (what the form kept), and with it the
moves that would have ended the first one early: with `tin_owl` drawing, close her tab to see the handover without
asking (it needs a new `social.fakeRoom({ hostWaitMs: 3000 })`, her page and `tin_owl`'s faked again with it), press
Back to your room from a new tab, and sign out while hosting; then check the lobby no longer lists a room of hers.

## Known
