# Social Rooms

Phosphor Social lets you share your drawing live with others, watch other artists draw, chat, and draw together in
real time.

Social lives in the side panel on the right of the workspace. Its **SOCIAL** tab (marked Beta) sits beside **LAYERS**
and is there even before you've opened any art. While you're in a room it becomes **CHAT**. Signing in, your account
and starting a room open in boxes over everything, each with a close button (**×**) at its top right (or Escape).

Social needs a wide screen: a window at least 769 pixels wide, such as a laptop, a desktop monitor or a tablet in
landscape. A phone held sideways can be wide enough. See [Not in This Version](#not-in-this-version).

---

## Privacy and Peer-to-Peer Connections

The first time a browser opens Social (the SOCIAL tab, one of its pages, or a room's link), it shows **Before you use
Social rooms**, a short version of the policies:

- **The lobby**: Opening Social connects your browser to Phosphor's server. People in the lobby can see your username
  (guests get a random nickname). Public rooms show their host, name, how many are in them, and a preview.
- **Joining a room**: Your browser connects directly to the host's, so each of you can see the other's IP address. It
  can show your general location and internet provider. Use a VPN to keep yours private. Everyone in the room sees
  the chat.
- **Starting a room**: People in your room see your art as you draw it, and can see your IP address. Public rooms
  show a preview in the lobby. Anyone you invite to draw gets a copy of the whole project, including the original
  image. A report of your room sends Phosphor's moderators a picture of the canvas.
- **Community rules**: No harassment, bullying or hate. Don't misuse IP addresses or share personal information. Keep
  public rooms appropriate, respect other artists' work, and report only in good faith.

**Accept** stays off until you tick **I am 13 or older and agree to the Terms, Privacy Policy, and Community
Guidelines**. Each of those opens over the question, and closing it brings you back with your tick as it was.

- **Who's asked**: Everyone, with an account or without (the browser can't tell before it connects). Nothing from
  Social runs until you accept: no signing key, no pass, no request, no lobby.
- **Accept** goes on to where you were going: the lobby, a page of Social, a room's link (which then asks whether to
  join), or a link from one of Phosphor's emails.
- **Not now** (or Escape) closes it and goes back to LAYERS, forgetting a link's room and page. Arriving straight from
  a link, you land on PIXEL (or the start screen, with nothing open) at a plain address. A link from an email still
  works when you open it again, until it expires.
- **Remembered**: The answer stays in this browser. It's asked again if the policies change in a way that matters, or
  after you clear the site's data.
- **Coming back to a room you're in** isn't held up: a reload while hosting or watching stays in the room without
  asking. The next plain load of the page asks.

The **Community Guidelines** (beside the Terms and the Privacy Policy) put section 5 of the Terms in plain words. The
Terms govern. **About Phosphor** (the logo at the top of the settings column) links all three.

---

## The Lobby

Out of a room, the **SOCIAL** tab is the lobby: the **Public rooms** live right now, as a column of cards, with how
many are live beside the heading. Unlisted rooms are never shown.

- **Room cards**: Each card shows a small picture of the art, the room's name, the host's username, how long it's been
  live, the host's signal if they chose one (*live 42 min · wants feedback*), and **Join** with how many are in the
  room and how many it holds (*Join (4/12)*).
- **Lobby picture**: Up to 80 columns of the art, around the part the host is looking at (or the part the host
  pinned; see [Hosting](#hosting)). The host's browser makes it a few seconds after going live, then again every few
  minutes if the art or that part has changed.
- **Can't join**: The Join button is grayed out with the reason beside it: **Room is full** (the host's watcher limit)
  or **Signed-in users only** (the room doesn't allow guests, and you aren't signed in).
- **Filter**: The menu at the right of **Public rooms** (**All**, **Wants feedback**, **Open to chat**, **Heads
  down**) shows only rooms with that signal. When none match: **No rooms match this filter**.
- **Someone you blocked is here**: shown on the card of a room they're in. You decide whether to go in.
- **Report room**: in the **⋯** at the top right of a card's picture (not on your own room's). See
  [Blocking and Reporting](#blocking-and-reporting).
- **Start a room**: under **Public rooms**, once you're signed in with your email confirmed. Until then the lobby says
  **Confirm your email to start a room**, with **Resend** to send the link again. While you're silenced, Start a room
  is off, with until when above it.
- **Back to your room**: takes the place of Join on a room of yours whose tab you closed. A room of yours with no card
  (unlisted, or filtered out) is offered in a line at the top instead: "Your room {name} is waiting for you." See
  [Reloads and Closed Tabs](#reloads-and-closed-tabs).

At the top is you: your username, with **Edit account** and **Sign out**. Not signed in, it shows your guest nickname,
**Sign in to socialize**, and **No account? Create one**.

Below the rooms, **In the lobby** lists who's here, with how many are signed in and how many are guests (*3 signed in ·
2 guests*). Guests are tagged **guest**, and you're marked **(you)**.

What Social has to tell you (a room that ended, something that failed) shows in a line at the top of the lobby, which
**✕** dismisses, or at the top of a box while one is open. In a room the panel shows the chat instead, so it shows as a
toast at the bottom of the window.

---

## Members and Guests

Signed in, you're a **member**; otherwise you're a **guest**.

- **Guests** can browse the lobby and watch any room that allows guests, without an account. Phosphor gives you a
  random nickname, such as `quiet-amber-fox`, tagged **guest** so nobody mistakes it for a member. Guests can't chat,
  draw, block or report.
- **Your nickname** stays with this browser: a reload, another tab, or signing out keeps it. A private window,
  clearing the site's data, or a while away gives you a new one.
- **Members** with a confirmed email can chat, start public or unlisted rooms, and report. Any member can block, and a
  host can invite any member in the room to draw.
- **Sign in to chat**: In a room, a guest's chat panel shows this in place of the message box. It opens the sign-in
  page over the room (closing it returns to the room). Once you're signed in, by password, Discord, GitHub or a
  two-factor code, you're back in the same room as yourself. An unlisted room asks for its password again after
  Discord or GitHub, which leave the page; after a password or two-factor sign-in, Phosphor still has it in memory
  for the trip back (and never saves it).

---

## Signing In and Creating an Account

**Sign in** offers **Continue with Discord**, **Continue with GitHub**, or your **Email or username** and
**Password**, with **Forgot your password?** below. Discord and GitHub show only where Phosphor's server has them set
up.

**Create an account** asks for:

- **Username**: how everyone sees you. Unique, 3 to 24 letters, numbers, hyphens and underscores. Names that read as
  staff or Phosphor (`admin`, `mod`, `support`, even as `adm1n` or `wren_mod`), placeholders (`test`, `user`, `demo`,
  even `test1`) and three words joined by hyphens (a guest's nickname) are reserved, and the field says so as you
  type.
- **Email**: not one at Phosphor's own domains (Discord and GitHub may use one they've verified).
- **Password**: at least 10 characters, and not one found in known data breaches.
- **A quick check** that you're a person, not a script.
- **The terms**: that you're 13 or older and agree to the **Terms**, **Privacy Policy** and **Community Guidelines**
  (each opens over the app).

Phosphor then emails you a link to confirm your address. Until you do, you can watch but not chat or start a room.

- **Discord and GitHub** make an account the first time you use them. **Pick your username** then asks for a username
  (it starts from the name on that account) and the same terms, or **Cancel and sign out** goes back to the lobby as a
  guest.
- **Forgot your password?** emails you a link that opens **Set a new password**. Setting it signs you out everywhere
  else.
- **Two-factor code**: With two-factor on, every sign-in (Discord and GitHub included) asks for a code from your
  authenticator app. **Trust this computer for 30 days** skips it on that computer, and **Use a backup code instead**
  takes a backup code, which works once.

---

## Accounts and Security

**Edit account** opens the **Account** page:

- **Username**: **Change** it once every 30 days. Your color and glyph come from your username: wherever a name shows
  (the lobby, room cards, chat, a room's lists, the host's tag on the art), a small cell comes before it, a CP437
  symbol (such as ♥ or ►) on your color.
- **Ways to sign in**: **Email and password**, Discord and GitHub, each with **Connect** or **Disconnect**. You need at
  least one way to sign in. Discord and GitHub are listed only where they're set up (or already connected, so they can
  be disconnected).
  - **Change password** asks for your current password and the new one twice. It keeps you signed in here and signs
    you out everywhere else. Its **Forgot your password?** sends the reset link to your address.
  - **Change email** asks for the new address and your password. Your address stays as it is until the new one
    confirms by a link. If your current address is confirmed, it has to approve first, by a link of its own. Open each
    link in this browser, signed in, within an hour; only the links from your latest ask work. You can ask twice a
    day. An account with only Discord or GitHub keeps the email they gave.
- **Two-factor**: **Turn on** asks for your password (an account without one needs a sign-in in the last 5 minutes),
  then shows a QR code for your authenticator app, and the secret key to type in instead. It's on once you enter the
  **Code from the app**; **Cancel** before that leaves it off.
  - You then get backup codes, shown once: store them somewhere safe. **New backup codes** replaces them and **Turn
    off** ends two-factor (both ask for your password).
  - If you lose your authenticator and your backup codes, there's no way back in from the app: write to
    hello@phosphor.work.
- **Blocked**: **See who you blocked** opens a page of its own (its address is /social/blocked) listing everyone
  you've blocked, each with **Unblock**. Its close button goes back to Account.
- **Delete account**: folded away until you open it. It asks for your password (an account without one needs a
  sign-in in the last 5 minutes), then **Delete for good** removes your account, your username and your block list.

---

## Starting a Room

**Start a room** opens **Set up your room**, laid out the way your room's Settings and stats will be. It needs art
open: that's what you share. Without any, **Go live** is off.

The **Room settings** box asks for:

- **Room name**: up to 60 characters.
- **Welcome message**: up to 200 characters on what you're working on and what you'd like from people. Watchers see it
  pinned at the top of the chat, and you can edit it while you're live.
- **Who can join**: **Public in the lobby** (a public room) or **Unlisted (link only)** (kept out of the lobby). An
  unlisted room can also have a **Password (optional)**; without one, the link alone lets people in.
- **Allow guests**: whether people who aren't signed in can watch. Guests can only watch.
- **Max watchers**: 1 to 30 (12 to begin with; a higher number goes back to 30). Each watcher uses some of your upload
  speed, and 12 suits most home connections.

A public room also has a **Lobby card** box:

- **Signal**: **None**, **Wants feedback**, **Open to chat** or **Heads down**. It shows on your card, and the lobby's
  filter uses it. An unlisted room has no card, so no signal.
- **Lobby picture**: the part of the art your card will show (see [Hosting](#hosting)). A position you pin here is
  kept when you go live.

An unlisted room has Room settings alone, in a narrower box.

What you've typed stays while you visit another tab. **Go live** shares the art you have open and closes the box; its
**×** leaves without starting.

- **Layers**: A room starts from any stack of layers.
- **Animation**: A drawing with frames can't go live: "Shared rooms do not support animation yet."

Once you're live you keep drawing as usual, and watchers see each change as you make it, with a box in your name color
for where your view is (the view of PIXEL or ANSI, whichever you looked at last, at your zoom). Open other art while
you're live and watchers see that instead.

---

## Hosting

While you host, the side panel's **CHAT** tab is your room's: its name, the room menu (**⋯**: **Copy link** and
**Settings and stats**), and **End room**.

While you're in a room, hosting it or watching or drawing in someone's, your screen stays on where the browser allows
it, as it does for a video. It can sleep again once you've left the room.

### Settings and Stats

**Settings and stats** opens your room's dashboard in a box:

- **The top**: the room's name, **Live for** (H:MM:SS since it went live; a reconnect or a reload doesn't restart it),
  **Copy link** and **End room**. The link is shown under them. For an unlisted room, send it to the people you want
  in, with the password if it has one. Following a link asks **Join this room?** first (**Join** or **Not now**),
  since joining shows the host your IP address.
- **The numbers**, counted by your browser for this room only and gone with it:
  - **Here now**: those connected.
  - **Max**: the most that were here at once.
  - **Total**: different people who joined (someone in two tabs, or joining twice, counts once).
  - **Messages**: said in the room, yours included. Joins and leaves aren't counted; deleted messages still are.
  - **Removed**: people you removed or blocked, each once.
- **Lobby picture** (public rooms): a small frame of what your card shows, about twice as wide as it is tall and never
  more than 80 columns, with the rest of the art scrolling inside it. It follows your view, centered on the middle of
  the PIXEL or ANSI view you looked at last. Scroll it to look around, and check **Use this exact position** to have
  the card show just what the frame shows. Scrolling while it's checked moves it; unchecking follows your view again.
  The choice lasts as long as the room.
- **Room settings**: **Welcome message**, **Allow guests**, **Max watchers** and, for a public room, **Signal**, with
  **Save**. Under them, **Set when the room started**: **Listed in the lobby** or **Only with the link**, and
  **Password set**. Those can't change while the room is live. What you've typed stays when you visit another tab,
  and a field you're halfway through typing in stays as it is when the setting changes meanwhile.
- **Turning guests off** while you're live: no new guest gets in, and a guest who leaves can't come back. The guests
  already here stay, unless you tick **Also remove the 2 guests currently in the room** before you save.
- **Who came by**: everyone who visited this session, newest last, with **Name** (**guest** for a guest), **Time** in
  the room (**< 1 min**, **54m**, **1h 38m**, counting up while they're here, with return visits added), **Status**
  (**Here now**, **Left at 8:55** or **Removed at 9:10**) and **Messages**. Ten rows show; **Show 4 more** opens the
  rest. Until someone comes: **Nobody has stopped by yet.**

### Running the Room

Under the chat panel's header, **N here** (folded to begin with) lists who's connected, and stays open or folded as
you left it for as long as the room lasts. Each row shows the person's name, **guest** for a guest, and whether they're
**tracking** you, **looking around** on their own, or still **connecting…**. Someone drawing shows **artist**, someone
asked shows **invited**, and someone muted shows **muted**.

A member's **⋯** menu has (guests have none):

- **Make artist**, **Withdraw invitation**, **Back to watching** and **Make host**: see
  [Drawing Together](#drawing-together).
- **Remove from room**: they leave now, and can't come back until the room ends.
- **Quiet mute**: their messages stop reaching everyone else. They aren't told: they still see what they send, and so
  do you, marked "Quietly muted — visible only to the two of you" (you can still report it). They stay tagged
  **muted** until you **Unmute** them or the room ends, and what they said while muted stays hidden from the others.
- **Block from your rooms**: asks first (**Block** or **Cancel**). They leave this room now, can't join any room you
  host again, and your rooms no longer show in their lobby. They aren't told; a link to one of your rooms says "This
  room isn't available". Unblock them from Account's **See who you blocked**.
- **Report**: see [Blocking and Reporting](#blocking-and-reporting).

While guests are off, a guest's **⋯** has **Kick**. (While they're on, a kicked guest would just come back as a new
one, so there's no Kick.)

In the chat, **Delete** takes the place of a message's time when you point at it or tab to it. It removes the message
for everyone, leaving **Message deleted by the host**.

### Ending the Room

**End room** asks **End this room?** first (**End room** or **Cancel**; so does Back, see
[The Address, Back and Forward](#the-address-back-and-forward)). It ends the room for everyone, anyone drawing
included, tells watchers at once, and clears the chat.

Watchers connect straight to your browser, so the room is as fast as your connection. If your connection to the room
drops for a moment, the page says **Reconnecting…**, and a change to Room settings made meanwhile goes once you're
back.

---

## Watching

**Join** on a room's card, or a link to it, opens the room on a **ROOM** tab after SAUCE, and the side panel's SOCIAL
tab becomes its **CHAT**. An unlisted room with a password asks for it first, on the ROOM tab.

- **One room at a time**: **Exit**, at the top right of the chat panel, closes the ROOM tab (you're back on the art
  tab you were on) and brings the lobby back.
- **The chat panel** shows the room's name, **hosted by** its host, and **Exit**, with the welcome message pinned under
  them as a **Pinned note**.
- **The art** is view only, in the host's font, in the middle of the page when it's smaller than the page. A box in
  the host's name color shows where they're looking, with a tag in its corner: the host's name, and **· tracking**
  while your view follows theirs.
- **Tracking**: The box is the host's whole view. While you track, the art is drawn at their zoom (never above 100%),
  or smaller if that's what it takes to fit their whole view in your window.
- **Looking around**: Scroll away to look on your own, keeping the zoom you had. The tag becomes **Track ›**, which
  brings you back at the host's zoom. Scroll the box out of sight and the tag waits at the edge of the art, with an
  arrow pointing to it.
- **Zoom**: from 25% to 100%, with **−** and **+** in the art's corner, Ctrl+wheel or a pinch. Zooming is looking
  around too.
- **Your own art**: You can go back to PIXEL or ANSI while you watch. The room keeps running on ROOM and the chat stays
  beside your work. Watching never changes your own art.

### Following an Artist

Once someone is drawing with the host, the chat panel lists who you can follow: the host and each artist here, each
with **Follow** (**Following** for the one you're on). You start on the host.

- **Follow** an artist and you track their whole view the way you track the host's, with their box and tag.
- **Show everyone** adds everyone else's box and tag (the host's too).
- **Show box** off hides the box you follow while you keep following.
- If the artist you follow goes back to watching or leaves, you're back on the host. A reload starts on the host too.

With nobody drawing, none of this shows.

### When the Room Ends

When the host ends the room, it ends for you too, and the art goes with it: Phosphor doesn't keep a copy. If the host
hands the room to an artist (see [When the Host Changes](#when-the-host-changes)), it carries on and you watch the new
host. While the host is reconnecting, the art dims and the page says **The host is reconnecting…**. Before the art
has come, it says **Joining…** and **Waiting for the host…**.

---

## Chat

Everyone in the room reads the chat. Members with a confirmed email write in it; a guest sees **Sign in to chat** and
an unconfirmed member sees **Confirm your email to chat**.

- **Sending**: **Enter** sends and **Shift+Enter** starts a new line. A message is up to 300 characters, and you can
  send about one a second (three at once, then one a second). Too fast says "Please wait a moment before sending
  another message." and keeps what you typed.
- **Your name** sits on the message box, with a **…** menu for **Edit account** and **Sign out**.
- **Earlier messages** load as you scroll up (**↑ Scroll up for earlier messages**), and **You joined** marks where you
  came in.
- **Comings and goings** show between messages, and those with nothing said between them share one line (*tin-owl
  joined, wren left, pixel_fox joined*). Someone who comes and goes more than once in a line is named once, by how it
  ended: **joined**, **left**, **came and went** or **came back**. Your own aren't shown, and they don't count as new
  messages.
- **The host's** messages are tagged **host**.
- **Where it goes**: Chat goes from browser to browser through the host, like the art, never through Phosphor's server
  (which sees chat only in a report). The host's browser keeps the last 5,000 messages for as long as the room lasts,
  and a watcher can scroll back no further than that. When the room ends, so does its chat.

### The Side Panel

The side panel stays open as you move between tabs, so you can work on your own piece and keep talking.

- **Unread**: While **LAYERS** shows, the **CHAT** tab counts new messages (and an invitation to draw).
- **Folding**: **»**, at the right end of the panel's tabs, folds the panel away (it takes no room then), and **«** in
  the same spot opens it again, counting what came while it was folded.
- **Width**: Drag the panel's left edge to make it wider or narrower (or focus the edge and use the arrow keys, Home
  and End). A double-click puts it back.
- **Kept**: Its width and whether it's folded are kept in the browser, for a reload or the next tab. Going into a room
  opens it on CHAT. A reload in a room shows it as it was: folded or open, on CHAT or LAYERS.
- **Toasts**: What the chat panel says about the drawing also shows as a toast while the chat isn't showing.

---

## Blocking and Reporting

### Blocking

- **Someone you blocked** in a room you're about to join shows on its card (**Someone you blocked is here**), and you
  decide whether to go in. Your block doesn't keep them out of other people's rooms.
- **Inside the room**, their messages fold to one line, **Message from someone you blocked**, with **Show** to read
  one. Nobody else sees any difference, and they aren't told.
- **Block from a message**: Watching while signed in, **Block** shows beside **Report** in place of a message's time
  when you point at it or tab to it, on anyone's message but your own. It asks first (**Block {name}?**, with **Block**
  or **Cancel**). They then can't join any room you host, your rooms no longer show in their lobby, and their messages
  here fold at once. You both stay in the room: only the host can remove someone from it.
- **As the host**, block from **N here** (see [Hosting](#hosting)).
- **Unblock** from Account's **See who you blocked**.

### Reporting

You can report once you're signed in with a confirmed email.

- **A person**: **Report** shows in place of someone else's message's time when you point at it or tab to it. As the
  host, the same **Report** is in a person's **⋯** in **N here**. You can't report yourself, a guest (they can't chat),
  or a deleted message.
- **A room**, for what it's drawing: **Report** sits under **Exit** in a room you're watching, and in the **⋯** on a
  room's lobby card (not on your own room's).

A box asks **Report {name}?** or **Report this room?** and **What's wrong?**: **Spam or flooding**, **Harassment or
hate**, **Sexual or violent**, or **Something else**. Pick one and press **Report**, or **Cancel** to send nothing. The
box links the **Community Guidelines**, and says what Phosphor's moderators will receive:

- **For a message**: that message and up to five before it, as they arrived, each signed by whoever wrote it.
- **For a person from N here**: their last five messages in the room, which may be none.
- **For a room**: its recent lobby pictures and, reported from inside the room, a picture of what you see now.

Afterward you see **Reported. Thank you.** for a few seconds, and nothing more: you aren't told what became of it. If
the report can't be sent, the box stays and you can try again. Once you've reported someone, **Report** goes away for
them in that room, even if you leave and join again; once you've reported a room, its Report goes away. This browser
remembers both for a day.

### Silenced and Suspended

- **Silenced**: Someone may be silenced for a while. Their messages stop reaching rooms, and they see **You're
  silenced until 9:40 PM.** in place of the message box (with the date too if it ends another day). They can still
  watch, and Start a room is off. When it ends, the box comes back with what they'd typed.
- **Suspended**: Signing in to a suspended account says **This account is suspended until {date}**, or **This account
  is suspended for good**.

---

## Drawing Together

A host can invite a member in the room to draw. In **N here**, the member's **⋯** menu has **Make artist**; their row
then says **invited**, with **Withdraw invitation** in the menu.

- **Who can be asked**: members who are connected. Guests can't be asked. An artist gets the whole project, including
  the original image, where watching only ever shows the rendered art.
- **How many**: up to seven people draw at once, the host among them. At that number **Make artist** is off and says
  "This room already has the maximum number of artists." Someone asked holds a place until they answer, and an artist
  who's away keeps theirs, so they can always come back. Going back to watching frees it.
- **The invitation**: The member sees "{host} invited you to draw together." in the chat panel, with **Accept** and
  **Not now**. It blocks nothing, so they can save what they have open first; if that art has unsaved changes, it says
  accepting replaces it. **Not now** clears it, and the host can ask again. Leaving the room clears it too.
- **Accepting** opens the room's art in the ordinary tabs, and their row says **artist**. What they had open stays in
  the browser's own list, like anything else autosave keeps. Their ROOM tab shows their own copy of the art, strokes
  that haven't reached the host included. If the art doesn't reach them or won't open, they see "The room's art
  couldn't be opened." and go back to watching, and the host can ask again.

### Drawing Rules

- **Everyone draws on any layer but the bottom one** and sees each other's strokes as they happen. Shapes and art
  layers on a vector layer are shared too ([Vector Shapes](vector.md)); one person at a time draws inside an art layer,
  and others see "{name} is currently editing this layer".
- **Moving and pasting**: A block an artist moves or pastes reaches the others when it's placed, or after 2 seconds
  with no further move. Moving it again after that is a new undo step, and what it covered there stays covered.
- **Undo** takes back only your own edits and shows what's beneath, even if that's someone else's. **Redo** puts your
  edit back where it was: where someone drew over it since, theirs stays on top and yours shows around it. With
  nothing drawn over it, redo brings it all back.
- **Undo history**: Artists have no undo steps from before they came, or from before a reload. If the host can't do an
  undo or a redo (it's too old, or the art was replaced since), you see "That action can no longer be undone." or
  "That action can no longer be redone." and that step is gone.
- **Font and view**: Everyone draws in the host's font and size, as watchers see it; if the host changes, so does the
  font. Each artist has their own tool, colors and view.
- **Show others' cursors** (in the chat panel, on by default, for everyone drawing): a mark and a name at each other
  artist's cell, or a tag at the edge for someone out of view, which goes to them when pressed.
- **Saving**: Anyone drawing can save the art. A project they save has no names in it.
- **Layers**: Everyone in a room changes the stack: adding, deleting, reordering, renaming and duplicating layers
  works for artists and the host alike ([Layers](layers.md#the-layers-list)). A change to the stack isn't an undo step.
  Delete asks "Delete {name} for everyone?" first, since no one can undo it, and is refused while someone else has the
  layer selected. The hidden eye and the layer you've selected are each person's own. The bottom layer is the host's:
  artists can't select or draw on it.
- **Character settings**: Each layer keeps its own, and they go to everyone, but only the host changes them. An
  artist's Characters section is off and says "Only the host changes character settings in a room."

### What Only the Host Does

- **The picture and the grid**: The settings, SAUCE fields, sliders, the base layer, Bake, Flatten and Merge down are
  off for an artist, and say "Only the room's host can change this." The same goes for a layer's character settings,
  which say "Only the host changes character settings in a room."
- **Final while others draw**: Merge down, Bake and Flatten can't be undone while anyone's listed as an artist, since
  other people's strokes can land on them. With another artist connected, each warns first: "Merging down cannot be
  undone in shared rooms.", "Baking cannot be undone in shared rooms." or "Flattening cannot be undone in shared
  rooms."
- **Not while others are drawing**: With another artist connected, the host can't open other art, start a new
  project, restore a version or clear the drawing layer; those say "Unavailable while co-artists are drawing." An
  artist who has dropped out holds none of this up. If the host opens something else while only dropped artists are
  listed, they come back as watchers.

### Pauses and Going Back to Watching

- **The host is reconnecting**: Drawing pauses for the artists: "Waiting for the host to reconnect. Drawing is
  paused…". A stroke being drawn ends, and strokes that haven't reached the host are marked. Scrolling and zooming
  still work. When the host is back, what's waiting is sent and drawing goes on.
- **Back to watching**: The host can choose **Back to watching** in an artist's menu, and the artist sees "You're back
  to watching." They keep the art open as an ordinary document to save or keep working on, with its undo emptied, and
  nothing they do there reaches the room. ROOM shows the host's art again at once. The same happens to anyone drawing
  when the room ends, or when they stop being able to draw for any other reason.

### When the Host Changes

A room outlives its host while anyone's drawing.

- **Make host**: In an artist's **⋯**, while they're connected, **Make host** (off while drawing is paused) asks "Make
  {name} the host? You will remain in the room as an artist." Drawing pauses with "Transferring host controls.
  Drawing is paused…". Once they've taken the art, everyone sees "{old} made {name} the host." and the old host goes
  on drawing as an artist. Everyone keeps their undo. If the new host doesn't answer within about 15 seconds, nothing
  changes.
- **The host leaves**: A host who closes their tab and doesn't come back within about a minute, or signs out, hands
  the room over without asking. An artist takes it, and everyone sees "{old} left the room. {name} is now the host."
  and "The host has changed, so undo history has reset. All existing artwork is preserved." Drawing pauses while the
  new host hears from the artists. All the drawing stays, and any stroke that hadn't reached the old host is sent
  again to the new one. Someone chosen who doesn't have the art passes the role to another artist. With no artist
  left, the room ends. Coming back in time (a reload, or **Back to your room** from a new tab) calls it off.
- **What the new host keeps**: the chat so far, the room's name and its welcome. They start with new stats (**Live
  for** among them, counting from the handover) and no one muted. People the former host removed stay removed;
  everyone else stays until the new host removes them. A former host can come back into a password room without the
  password; **Remove from room** keeps them out.
- **Watchers** can't be chosen; they carry on watching the new host.
- **Coming back after the role moved**: A host cut off who comes back after the handover is an artist, with no new
  invitation, and so is an artist who drops out and returns. The room's art replaces what they had open, which stays
  in the browser's own list with what they drew while away: "{name} is now the host. Your previous work is saved:
  open a new tab to find it under Pick up where you left off." A former host who comes back in a new tab has nothing of the
  room's open, and gets an invitation, since accepting replaces whatever is open there.

---

## Reloads and Closed Tabs

- **Watching**: A reload joins the room again (an unlisted room asks for its password again).
- **Drawing**: A reload as an artist comes back as an artist, with the art as it is now. Drawing is paused until it
  has come: "Syncing canvas from the host. Drawing is paused…".
- **Hosting**: A reload comes back to the same room as its host, at the same address and view, with the side panel as
  you left it. Watchers see it's reconnecting while it's away. The chat keeps its newest 1,000 entries through a
  reload.
- **The host's reload with artists**: For up to about 5 seconds drawing waits while the artists check in. If one of
  them has strokes the host doesn't, the host catches up from them first, which can hold drawing for up to a minute.
  If they can't be reached or can't fill the gap, the room carries on from the host's own saved art, and strokes only
  an artist had may be lost. Everyone sees "Undo history has reset. All existing artwork is preserved."
- **Closing the tab**: Closing the host's tab for good ends the room within about a minute, unless you come back or
  someone is drawing with you (then an artist carries it on; see [When the Host Changes](#when-the-host-changes)). If
  the room ended while the page was away, you're told "Your room closed while you were away." and your art stays.
- **Signing out while you host** ends the room at once, or, with someone drawing, hands it to an artist the way a
  closed tab does.
- **A copy of the tab**: A room opened in a copy of the hosting tab moves to the copy, and the older tab says "This
  room is open in another tab".

### Back to Your Room

For that minute after its tab has gone, **Back to your room** brings your room back from a new tab, in the same
browser and signed in to the same account.

- **Where it shows**: on the room's card, in a line at the top of the lobby for a room with no card, and beside
  **Join** when you follow a link to your room. It shows a couple of seconds after the room's tab has gone, never while
  it's open. (A reload slower than that can show it until the tab is back; pressing it then doesn't take the room, and
  the other tab says "This room is open in another tab".)
- **What it does**: It reloads the tab into the room, with the art from autosave, as if you had reloaded: chat,
  numbers and view are back, and watchers and artists carry on. Autosave can be a few seconds behind; with an artist in
  the room you catch up from them, and with none you have what autosave had. Anything that changed in the last second
  before the tab closed may be missing from the chat and the numbers.
- **Your open art** is replaced and stays in the browser's own list. If it has unsaved changes, the offer says
  "Returning replaces your open canvas, which has unsaved changes."
- **If it fails**: If the room's art can't be read (or the host had only just opened it and it was never written),
  you're told "The room's art couldn't be opened." and the room carries on without you; if the art won't open after
  the reload, you can try again while the offer lasts. Otherwise you're told "Couldn't go back to your room." Pressed
  too late, you're told the room ended, or you're back in as an artist if the role moved.
- **Signing out or deleting the account** forgets it. A tab still hosting under that account keeps its copy until it
  hears the session has ended, which closes its side of the room as signing out does. A hosting tab whose browser has
  since signed in to another account stops keeping its copy, and that account is never offered the room.

---

## The Address, Back and Forward

The address bar says which tab you're on (ROOM is /room), or which page of Social is open over it: Sign in, Create an
account, Pick your username, Account, Set up your room and the rest. Back and Forward move between them as on any
website (Back closes a page), and a reload brings you back to the same one. A room you host or watch is part of the
address. The lobby has no address of its own: a link to /social opens it in the side panel.

With a dialog open over the page (Export, Save project, Versions, the shortcut list, the question a file asks), Back
closes the dialog, as Escape does, as on a phone, and the page stays where it was; the next Back goes back.

- **A page you can't be on** goes to the nearest one you can. Account and Blocked show Sign in when you're signed out.
  Sign in and Create an account don't open when you're signed in, and neither does Set up your room when you're signed
  out or your email isn't confirmed, the two-factor code page when no code was asked for, or the new-password page
  without a link from an email.
- **Following a link to a room** asks **Join this room?** first, except that loading another room's link in the tab you
  host in keeps you in your own room and drops the link. A link that can't be a room's says **This room isn't
  available** without asking. A link to your own room, with its tab closed, also offers **Back to your room**.
- **Watching**: A reload, or Forward onto a page where you were watching, joins the room again without asking (an
  unlisted room asks for its password again). Back past the page where you joined leaves the room, and Forward joins
  it again. A room you left with **Exit**, or that ended, isn't joined again by Back, Forward or a reload.
- **Hosting**: Back past the page where you went live asks **End this room?** (**End room** or **Cancel**). A reload
  comes back to the room at the address you were on.

---

## When Something Goes Wrong

- **No public rooms live right now**: "Start a room and your canvas will light up the lobby."
- **Can't reach the lobby right now**: "Your local editor still works normally." Rooms already running carry on. If
  the lobby turned this browser away twice, it adds "If your device's clock is off, fix the time and reload."
- **Reconnecting…**: The lobby lost its connection for a moment (a dropped Wi-Fi, say). The rooms stay, dimmed,
  until it's back. On your room's dashboard it means the same for the room's connection.
- **This browser does not support the security features required for Social rooms.**: It lacks the signing Social
  uses (older Safari, for one). The rest of Phosphor works as usual.
- **Couldn't reach this host**: Rooms connect your browser straight to the host's, and some networks (offices and
  schools, often) block that. Try another network.
- **This room needs a password** / **Wrong password**: an unlisted room with a password asks before you join.
- **Room is full**: the host's watcher limit is reached.
- **The host ended the room** / **The host removed you**: you're back in the lobby.
- **This room isn't available**: the room is gone, or isn't open to you.
- **You're watching this room in another tab**: You joined the same room again, from another tab or computer. The
  newer one watches, and this one goes back to the lobby.
- **Couldn't copy the link**: The browser didn't let Phosphor copy the room's link. Select it on the dashboard and copy
  it yourself.
- **You're silenced until 9:40 PM.** / **This account is suspended**: see
  [Silenced and Suspended](#silenced-and-suspended).
- **Couldn't reach Phosphor's server. Check your connection.**: Signing in or creating an account couldn't connect.

---

## Not in This Version

- **Narrow screens**: Social needs a wide window, and the side panel isn't shown on a narrow one. A link to a room
  opened on a narrow screen, or a room you're in when the window narrows, shows "Shared rooms require a wider
  screen." A watcher gets **Exit** with it, which leaves as the room's own Exit does. A host's room goes on, without
  Exit, and is back as it was when the window widens.
- **Animation**: Rooms are for still drawings.
- **A picture on a layer**: Adding a picture to a layer isn't supported in shared rooms yet.
- **Keeping a copy** of art you're only watching.
