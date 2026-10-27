# Social

> **Partly built.** This page describes how Phosphor's social side is meant to work.
>
> **Works today:** the SOCIAL tab, signing in, creating an account, the Account page, the lobby
> with its Join counts and reasons, signals and who's here, starting and hosting a room, and
> watching one. **Comes next:** chat, and reporting. **Chat**
> through **Blocking and reporting** describe what's coming, as do the chat beside your work under
> **Watching**. Removing and blocking from a room work today (under **Hosting**). Until the chat is there, watchers see the
> welcome message under the room's name.

Phosphor's **SOCIAL** tab is where you meet other people: you can watch someone draw, or let others
watch you. It sits beside PIXEL, ANSI and SAUCE and is there even before you've opened any art. It's
for desktop browsers: on phones and other narrow screens the tab isn't shown.

## The lobby

The SOCIAL tab opens on the lobby: a gallery of the **public rooms** that are live right now. Each
room shows a small picture of what its host is looking at (the host's browser makes it soon after
going live, then again every few minutes when the art or the view has changed), its name, the host's username, how
long it's been live, the host's **signal**, and a **Join** button with how many are in the room
and how many it holds (*Join 4/12*). Private rooms are never listed.

When you can't join a room, its Join button is grayed out and says why beside it:

- **Room is full**: it's at the host's watcher limit.
- **Signed-in users only**: the room doesn't allow guests, and you haven't signed in.

Filters above the gallery (**All**, **Wants feedback**, **Open to chat**) narrow it to rooms whose
host wants feedback or is open to chat. When none match, it says **No rooms match this filter**.

If someone you've blocked is in a room, its card says **Someone you blocked is here**.

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
you sign in. In a room, a guest's chat panel shows **Sign in to chat** in place of the message box. It opens the sign-in page over the room (**Back to the room** returns), and
once you're signed in, by password, Discord, GitHub or a two-factor code, you're back in the same room as
yourself. A private room asks for its password again: Phosphor never keeps it.

## Signing in and creating an account

**Sign in** offers **Continue with Discord**, **Continue with GitHub**, or your email or username
and password, with **Forgot your password?** below.

**Create an account** asks for:

- a **username**: how everyone sees you, unique, letters, numbers, `-` and `_`;
- your **email**, and a **password** of at least 10 characters that isn't a known leaked one;
- a quick check that you're not a script (Cloudflare Turnstile);
- that you're **13 or older** and agree to the **Terms** and **Privacy Policy**.

Phosphor then emails you a link to confirm your address. Until you do, you can watch but not chat
or start a room. The lobby says **Confirm your email to start a room**, with **Resend** to send the
link again.

Discord and GitHub make an account the first time you use them; you then pick a username (it
starts from the name on that account) and agree to the same terms, or **Cancel and sign out** to
go back to the lobby as a guest.

**Forgot your password?** emails you a link that opens Phosphor to set a new one. Setting it signs
you out everywhere else.

## Your account

**Account** shows:

- **Username**, which you can change once every 30 days. Your color in the lobby and chat comes
  from your username.
- **Ways to sign in**: email and password (**Send a reset link** opens **Forgot your password?**
  with your email filled in, to change the password), Discord and GitHub; connect or disconnect
  each, keeping at least one.
- **Two-factor**: once it's on, every sign-in asks for a code from your authenticator app, Discord
  and GitHub included. **Trust this computer for 30 days** skips the code on that computer. A backup
  code stands in for the phone (**Use a backup code instead**), once each.
  - **Turn on** asks for your password (an account without one needs a sign-in in the last 5
    minutes), then shows a QR code to scan with an authenticator app, and the key to type in
    instead. It's on once you enter the app's 6-digit code; **Cancel** before that leaves it off,
    and **Turn on** starts again with a new key.
  - Then you get 10 **backup codes**, shown this once: save them somewhere safe. **New backup
    codes** (it asks for your password) replaces them, and **Turn off** (the same) ends two-factor.
  - If you lose the phone and the backup codes, there is no way back in from the app: an admin
    turns two-factor off for the account.
- **Blocked**: everyone you've blocked, with **Unblock**.
- **Delete account**: asks for your password, then (**Delete for good**) removes your account, your
  username and your blocks. An account with no password needs you to have signed in with Discord or
  GitHub in the last 5 minutes.

## Starting a room

**Start a room** needs some art open in Phosphor: it's the art you share. The page shows what
watchers will see (your art in ANSI as it is now), and asks for:

- **Room name**: up to 60 characters.
- **Welcome message**: a few lines (up to 200 characters) on what you're working on and what you'd
  like from people. Watchers see it under the room's name, and once there's a chat it's pinned at the
  top of it. You can edit it while you're live.
- **Who can join**: *Anyone, in the lobby* (a public room) or *Only with the link* (a private
  room, which also asks for a **password**).
- **Allow guests**: whether people who haven't signed in can watch. Guests can only watch, so you
  can't remove one; turn this off if you'd rather have members only.
- **Most watchers**: from 1 to 24 (12 to begin with). Each watcher uses some of your upload speed,
  and 12 suits most home connections.

**Go live** shares the art you have open; **Cancel** goes back to the lobby. You keep drawing in
the ANSI tab as usual, and watchers see each change as you make it, with a pink box for where your
view is. Open other art while you're live and watchers see that instead.

While you're live, **Room settings** changes the welcome message, Allow guests and Most watchers.
Whether the room is public or private, and its password, stay as they were set.

## Hosting

While you host, the SOCIAL tab shows your room instead of the lobby: its name, how many are
watching (counted once they're connected), its link (**Copy link**), who's watching, **Room
settings** and **End room**. Send the link to anyone you want in a private room, along with its
password. The SOCIAL tab carries a dot while you're in a room, hosting or watching.

Each watcher shows whether they're following you or looking around on their own (or still
connecting). A member's row has a **⋯** button (guests have none) with:

- **Remove for this session**: they leave the room now, and can't come back until the room ends.
- **Block from my rooms**: asks first (**Block** or **Cancel**), then they can't join any room you host again, and your rooms no longer show in their lobby.
  They aren't told; your rooms simply aren't there for them, and a link to one says "This room
  isn't available".

**End room** ends it for everyone, and tells watchers at once. Closing or reloading the tab ends it
too, so Phosphor asks first; signing out while you host ends the room as well.

Watchers connect straight to your browser, so the room is as fast as your connection. A direct
connection shows each side's IP address to the other (a VPN hides yours). If your connection to the
room drops for a moment, the page says **Reconnecting…**; a change to Room
settings made meanwhile goes once you're back.

## Watching

**Join** on a room's card, or a link to it, opens the room right in the SOCIAL tab, in place of the
lobby. You're in one room at a time; **Leave** brings the lobby back. A private room asks for its
password first.

The room's name, its host and the welcome message are at the top. The art is view only, in the
host's font. A pink box shows where the host is looking. With **Following** on, your view
follows theirs; scroll away to look around on your own, and the button becomes **Follow** with the
host's name, to bring you back. If the connection to the host is lost, the art dims and the page says
**Waiting for the host…** until it's back.

Your browser connects straight to the host's, which shows each of you the other's IP address (a VPN
hides yours).

You can go back to your own art in PIXEL or ANSI while you watch: the room keeps running in the
SOCIAL tab, and, once there's a chat, it stays open beside your work. Watching never changes your
own art.

When the host ends the room, it ends for you too. The art goes with it: Phosphor doesn't keep a
copy.

## Chat

When you're in a room, hosting or watching, a chat panel sits on the right of the whole workspace,
with the host's welcome message pinned at the top. It stays open as you move between tabs, so you can work on your own piece and keep talking. **»**
collapses it to a thin rail that counts new messages; **«** opens it again.

Guests can read the chat; signing in (with your email confirmed) lets you write in it. Chat goes from browser to browser
through the host, like the art, and nobody keeps it: when the room ends, so does its chat.

### Blocking and reporting

If someone you've blocked is in a room you're about to join, its card in the lobby tells you quietly
(**Someone you blocked is here**), and you decide whether to go in. Your block doesn't keep them out of other people's rooms. Inside the room,
their messages show as **Message from someone you blocked**, with **Show** if you want to read it.
Nobody else sees any difference, and they aren't told.

Signed in, you can **Report** any message or person in a room, and **Report room** for what a
room is drawing: on its card in the lobby or at the top of the room. Nobody is told who reported them.

## When something goes wrong

- **No public rooms right now**: start one, and you'll be the first thing people see here.
- **Rooms are unavailable right now**: the lobby can't be reached. The editor works as usual, and
  rooms that are already running carry on. If the lobby turned this browser away twice, it adds
  **If your computer's clock is wrong, fix it and reload.**
- **Reconnecting…**: the lobby lost its connection for a moment (a new server version, Wi-Fi). The
  rooms stay, dimmed, until it's back with the current ones. On your own room's page it means the
  same for the room's connection.
- **This browser can't sign you in to SOCIAL yet**: it lacks the signing SOCIAL uses (older Safari,
  for one). The rest of Phosphor works as usual.
- **Couldn't reach this host**: rooms connect your browser straight to the host's (there's no relay
  server), and some networks (offices and schools, often) block that. Try another network.
- **This room needs a password** / **Wrong password**: a private room asks before you join.
- **Room is full**: the host's watcher limit is reached.
- **The host ended the room** / **The host removed you**: back to the lobby.
- **You're watching this room in another tab**: you joined the same room again, from another tab or
  computer; the newer one watches, and this one goes back to the lobby.
- **Couldn't copy the link**: the browser didn't let Phosphor copy the room's link. Select it and copy
  it yourself.
- **Confirm your email to start a room**: in the lobby, with **Resend**.
- **You're muted until 9:40 pm**: in place of the message box.
- **This account is suspended**: at sign-in, with until when, if it isn't for good.
- **Couldn't reach Phosphor's server**: signing in or creating an account couldn't connect.

## Not in this version

- Phones: the SOCIAL tab is desktop only. A link from one of Phosphor's emails opened on a phone
  does nothing there; open it on a computer.
- Drawing together: only the host draws.
- Keeping a copy of someone else's art.
