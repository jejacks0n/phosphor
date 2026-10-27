# Social

> **Planned, not built yet.** This page describes how Phosphor's social side is meant to work.

Phosphor's **SOCIAL** tab is where you meet other people: you can watch someone draw, or let others
watch you. It sits beside PIXEL, ANSI and SAUCE and is there even before you've opened any art. It's
for desktop browsers: on phones and other narrow screens the tab isn't shown.

## The lobby

The SOCIAL tab opens on the lobby: a gallery of the **public rooms** that are live right now. Each
room shows a small live picture of what its host is looking at, its name, the host's username, how
long it's been live, the host's **signal**, and a **Join** button with how many are in the room
and how many it holds (*Join 4/12*). Private rooms are never listed.

When you can't join a room, its Join button is grayed out and says why beside it:

- **Room is full**: it's at the host's watcher limit.
- **Signed-in users only**: the room doesn't allow guests, and you haven't signed in.

A filter above the gallery narrows it to rooms whose host wants feedback or is open to chat.

Beside the gallery, signed in:

- **You**: your username, with **Account** and **Sign out**.
- **Your signal**: Wants feedback, Open to chat or Heads down. It shows beside your name in the
  lobby and on your room while you host.
- **Start a room**.
- **In the lobby**: who else is here, with their signals (guests show as guests).

Not signed in, the same column shows your guest nickname, **Sign in**, and **Create one** for a new
account, in place of your signal and Start a room.

Sign in, Create an account, Account and Start a room each open in the SOCIAL tab in place of the
lobby, with **Back to the lobby** at the top.

## Members and guests

Signed in, you're a **member**; otherwise you're a **guest**.

You can browse the lobby and watch without an account, in any room that allows guests. Phosphor
gives you a random nickname, such as `quiet-amber-fox`, shown with a **guest** tag so nobody
mistakes it for a member. A room for signed-in users only shows its Join button grayed out until
you sign in. In a room, a guest's chat panel shows **Sign in to chat** in place of the message box.

## Signing in and creating an account

**Sign in** offers **Continue with Discord**, **Continue with GitHub**, or your email and password,
with **Forgot your password?** below.

**Create an account** asks for:

- a **username**: how everyone sees you, unique, letters, numbers, `-` and `_`;
- your **email**, and a **password** of at least 10 characters that isn't a known leaked one;
- a quick check that you're not a script (Cloudflare Turnstile);
- that you're **13 or older** and agree to the **Terms** and **Privacy Policy**.

Phosphor then emails you a link to confirm your address. Until you do, you can watch but not chat
or start a room, and the lobby offers to send the link again.

Discord and GitHub make an account the first time you use them; you then pick a username (it
starts from the name on that account) and agree to the same terms.

**Forgot your password?** emails you a link that opens Phosphor to set a new one. Setting it signs
you out everywhere else.

## Your account

**Account** shows:

- **Username**, which you can change once every 30 days. Your color in the lobby and chat comes
  from your username.
- **Ways to sign in**: email and password, Discord and GitHub; connect or disconnect each, keeping
  at least one.
- **Two-factor**: a code from an authenticator app at sign-in, if you turn it on.
- **Blocked**: everyone you've blocked, with **Unblock**.
- **Delete account**: asks for your password (or Discord or GitHub again), then removes your
  account, your username and your blocks.

## Starting a room

**Start a room** needs some art open in Phosphor: it's the art you share. The page shows what
watchers will see (your art in ANSI as it is now), and asks for:

- **Room name**.
- **Welcome message**: a few lines (up to 200 characters) on what you're working on and what you'd
  like from people, pinned at the top of the chat for everyone who joins. You can edit it while
  you're live.
- **Who can join**: *Anyone, in the lobby* (a public room) or *Only with the link* (a private
  room, which also asks for a **password**).
- **Allow guests**: whether people who haven't signed in can watch. Guests can only watch, so you
  can't remove one; turn this off if you'd rather have members only.
- **Most watchers**: each watcher uses some of your upload speed. 12 suits most home
  connections.

**Go live** shares the art you have open; **Cancel** goes back to the lobby. You keep drawing in
the ANSI tab as usual, and watchers see each change as you make it.

While you're live, **Room settings** changes the welcome message, Allow guests and Most watchers.
Whether the room is public or private, and its password, stay as they were set.

## Hosting

While you host, the SOCIAL tab shows your room instead of the lobby: its name, how many are
watching, a link to copy, and who's watching. Send the link to anyone you want in a private room,
along with its password. The SOCIAL tab carries a dot while you're in a room, hosting or watching.

Each watcher shows whether they're following you or looking around on their own. Point at a
member who's watching for:

- **Remove**: they leave the room now, and can't come back until the room ends.
- **Block**: they can't join any room you host again, and your rooms no longer show in their lobby.
  They aren't told; your rooms simply aren't there for them, and a link to one says "This room
  isn't available".

**End room** ends it for everyone. Closing or reloading the tab ends it too, so Phosphor asks
first; signing out while you host ends the room as well.

## Watching

**Join** opens the room right in the SOCIAL tab, in place of the lobby. You're in one room at a
time; **Leave** brings the lobby back.

The art is view only. A pink box shows where the host is looking. With **Following** on, your view
follows theirs; scroll away to look around on your own, and the button becomes **Follow** with the
host's name, to bring you back.

You can go back to your own art in PIXEL or ANSI while you watch: the room keeps running in the
SOCIAL tab, and the chat stays open beside your work. Watching never changes your own art.

When the host ends the room, it ends for you too. The art goes with it: Phosphor doesn't keep a
copy.

## Chat

When you're in a room, hosting or watching, a chat panel sits on the right of the whole workspace,
with the host's welcome message pinned at the top. It stays open as you move between tabs, so you can work on your own piece and keep talking. **»**
collapses it to a thin rail that counts new messages; **«** opens it again.

Guests can read the chat; signing in (with your email confirmed) lets you write in it. Chat goes from browser to browser
through the host, like the art, and nobody keeps it: when the room ends, so does its chat.

### Blocking and reporting

If someone you've blocked is in a room you're about to join, the lobby tells you quietly, and you
decide whether to go in. Your block doesn't keep them out of other people's rooms. Inside the room,
their messages show as **Message from someone you blocked**, with **Show** if you want to read it.
Nobody else sees any difference, and they aren't told.

Signed in, you can **Report** any message or person in a room, and **Report room** for what a
room is drawing: on its card in the lobby or at the top of the room. Nobody is told who reported them.

## When something goes wrong

- **No public rooms right now**: start one, and you'll be the first thing people see.
- **Rooms are unavailable right now**: the lobby can't be reached. The editor works as usual, and
  rooms that are already running carry on.
- **Reconnecting…**: the lobby lost its connection for a moment (a new server version, Wi-Fi). The
  rooms stay, dimmed, until it's back with the current ones.
- **This browser can't sign you in to SOCIAL yet**: it lacks the signing SOCIAL uses (older Safari,
  for one). The rest of Phosphor works as usual.
- **Couldn't reach this host**: rooms connect your browser straight to the host's, and some
  networks (offices and schools, often) block that.
- **Room is full**: the host's watcher limit is reached.
- **The host ended the room** / **The host removed you**: back to the lobby.
- **Confirm your email to chat and start rooms**: with **Send the link again**.
- **You're muted until 9:40 pm**: in place of the message box.
- **This account is suspended**: at sign-in, with until when, if it isn't for good.

## Not in this version

- Phones: the SOCIAL tab is desktop only.
- Drawing together: only the host draws.
- Keeping a copy of someone else's art.
