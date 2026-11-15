# The desktop app

Phosphor also comes as an app for macOS, Windows and Linux. Drawing in it works as it does in the browser. What's
different is **SOCIAL**: there's no lobby, account or sign-in. You host a room on your own computer and give people its
address, or you join someone's room by the address they give you. Nothing in the app goes through a Phosphor server.

Rooms otherwise work as they do on the web: watching, chat, drawing together, cursors, following, **Remove**, **Make
host** and the host's reload (see [Social](social.md)). This page covers what's different.

## Downloading

The app is on Phosphor's [GitHub Releases](https://github.com/jejacks0n/phosphor/releases) page. Releases marked
**Pre-release** (a version like `v1.2.0-beta`) are betas to try before the release they lead to.

- **macOS**: the `.dmg` (or the `.zip`), for Apple silicon (`arm64`) or Intel (`x64`). It's signed and notarized, so
  macOS opens it without a warning.
- **Windows**: the installer (`.exe`), one for both x64 and Arm. It's signed.
- **Linux**: the `.AppImage` or the `.deb`. These aren't signed. On Ubuntu 24.04 and later the AppImage may not start,
  because Ubuntu restricts the unprivileged user namespaces the app's sandbox needs. Use the `.deb` there: it sets the
  sandbox up when it installs.

The app doesn't update itself. **Check for Updates…** (in the Phosphor menu on macOS, in Help elsewhere) asks GitHub
for the releases and offers the newest one's download page, or says yours is the newest. Someone on a beta (a version
like `1.2.0-beta`) is offered betas too; everyone else only releases. It asks only when you choose it. In a room,
someone on a different version is told so: "They're on a newer Phosphor. Update to join." (with **Check for updates**
beside it) or "They're on an older Phosphor. They need to update before you can join."

## The menu bar

The app's own menus, in the language Phosphor shows:

- **File**: New, New Window (Cmd/Ctrl+Shift+N), Open… (Cmd/Ctrl+O), Open Recent, Save (Cmd/Ctrl+S), Save As… (Cmd/Ctrl+Shift+S), Export…
  (Cmd/Ctrl+E) and Versions…, as the buttons under the settings do.
- **Edit**: Undo and Redo (the drawing's, or a text field's while you type in one), Cut, Copy, Paste and Select All.
- **Room**: Start a Room… and Join a Room… open the Social tab; Copy Room Address copies the first address others can
  join at, while you host; Leave Room (End Room… for a host, which asks first).
- **View**: Actual Size, Zoom In and Zoom Out (the whole window, as a browser's zoom) and Full Screen.
- **Help**: Keyboard Shortcuts, Phosphor on GitHub, the Release Notes for your version, and Report an Issue…, which
  opens a new GitHub issue with your Phosphor version and system written in. Troubleshooting has the developer tools,
  for when someone helping you asks what they say.

## Windows

**File > New Window** (Cmd/Ctrl+Shift+N) opens another window on the start screen, a little down and to the right of
the one you're in. Each window is its own drawing, so you can keep a reference open beside the one you're working on.
A window's title is its drawing's name ("Phosphor" on the start screen), and the menu bar is the front window's: Save,
for one, is on only when that window has a drawing.

Opening a file never replaces your drawing. Open…, Open Recent, a double-click and a file dropped on the Dock open it
in the window you're in when that window is on the start screen, and in a new window when it has a drawing. Several
files at once get a window each. A project that's already open in a window brings that window to the front instead of
opening a second copy. On the start screen, a recent drawing that's open in another window says **Open in another
window**, and can't be opened again until that window closes it.

A file dropped on a window with a drawing asks what to do with it: **Add to this drawing**, or **Open in a new
window**, which leaves your drawing as it was. Open in a new window is offered in a room too, even while you're
drawing in someone else's. A project dropped on a drawing goes to a new window without asking, and so does a picture
dropped where adding one isn't offered (on an animation, or a drawing shared with a room).

Closing a window closes that window alone. When it has unsaved changes it asks **Close this window?** first, and
**Stay** keeps it open as it was. A window hosting a room hands the room on before it closes, as quitting does (see
**Quitting the app while hosting**). On macOS, closing the last one leaves Phosphor running with its menu bar: New
Window, Open… or a click on its Dock icon opens a window again. On Windows and Linux, closing the last window quits.

Quitting asks every window with unsaved changes **Leave Phosphor?**, one window at a time, before anything closes or
any room is handed on. **Stay** in any of them calls off the whole quit: every window stays open, and every room
carries on.

### A room per window

Each window can be in a room of its own: one can host while another watches or draws in someone else's room, and two
can host a room each. Every window has its own room service, which stops when the window closes. A second window
hosting takes the next free port, so with the first on 31337 the second's room is at 31338. A window drawing in
someone's room keeps its service ready to be made host on a port 20 above the one you last hosted on (31357 to begin
with), so it never takes the port your own room is reached at when someone leaves the port off. Made host, it keeps
the room on that port.

You can join your own room from another window, by its address (`127.0.0.1:31337`, say). You're asked in like anyone
else, and since both windows go by your name, the one joining shows with its fingerprint: "ann #3f9a wants to join".
Only one window at a time holds this computer's key, the one rooms know you by; each other window that goes into a
room makes a key of its own, kept while that window is open, through its reloads.

## Opening and saving

Open… is your system's own file chooser, and Save writes a project straight back to its file: the first Save of a
drawing asks where (as Save As… always does), and after that Save writes over that `.phosphor` file without asking. A
project opened with Open…, Open Recent, a double-click or dropped on a drawing (it opens in a new window) saves back
to where it came from; one dropped on the start screen asks where the first time. A save is written whole: if it
fails, the file it would have replaced is left as it was. Exports still ask where each time.

Double-clicking a `.phosphor` file opens it in Phosphor. With Phosphor already open, the file opens there: in the
window you're in when it's on the start screen, and in a new window when it shows a drawing. The rest
of what Phosphor opens is offered under **Open With**, and you can make Phosphor the default for any of them:

- **`.ans`, `.utf8ans` and `.diz`**: on every system. On Windows, installing Phosphor makes it their default.
- **`.asc`, `.nfo`, `.txt` and pictures** (PNG, JPEG, GIF, WebP, BMP, AVIF and SVG): on macOS, and on Linux except
  `.asc`. On Windows, open them with Open… or by dropping them on the window: other apps own them there (`.nfo` is
  Windows' System Information file), so installing Phosphor doesn't claim them.

## Your name

Out of a room, the **Social** tab in the side panel starts with **Your name**: the name others see in a room you host
or join. It's kept on this computer, and you can change it there any time. Until there's one, **Join** and **Start a
room** are off and say "Pick a name others will see first."

Names aren't unique, since there are no accounts. When two people in a room go by the same name, each is followed
by the start of their key's fingerprint, such as `ann #3f9a`, in the chat, the list of who's here and a join asking
to be let in.

## Hosting

Under **Host a room**, **Start a room** opens **Set up your room**, with:

- **Room name** and **Welcome message**, as on the web.
- **Password (optional)**: "Everyone joining types it in, and you still let each one in."
- **Max watchers**: "Rooms stream directly from this computer. Up to 12 watchers suits most home connections."
- **Port**: where others connect, **31337** to begin with. "Others join at this port. If it's taken, the next free
  one is used." (the port you chose or one of the 19 above it). The port you last hosted on is kept for next time.

There's no public or link-only choice and no guests: a room is reached only by its address, and everyone in it chose a
name. **Go live** opens the room on this computer. If it can't, you see "The room couldn't start on this computer.
Try another port."

### The addresses

While you host, **Settings and stats** (in the room menu of the chat panel) lists the addresses others can join at,
each with **Copy**: this computer's network addresses with the port, such as `192.168.1.20:31337`. Home and office
network addresses come first, and Tailscale's last, marked **Tailscale**. With no network, it shows `127.0.0.1` and the port, and says "Only this computer can join.
Connect to a network to share an address." Under them:

- "Anyone who can reach this address can ask to join."
- "Over the internet, forward port 31337 on your router." (with your room's port)
- "The connection isn't encrypted."

Which address to give:

- **On the same network** (home, office, the same Wi-Fi): the first address listed.
- **On Tailscale**: the address marked **Tailscale**, for anyone on your tailnet, wherever they are.
- **Over the internet**: your router's public address and the port, after forwarding that port on your router to this
  computer. Phosphor can't do this for you, and some networks don't allow it.

### What your computer asks

- **macOS** asks the first time Phosphor connects to another computer on your local network whether it may find and
  connect to devices there, with Phosphor's reason: "Phosphor connects to rooms on your local network." Choose
  **Allow**. If you didn't, turn Phosphor on in System Settings, Privacy & Security, Local Network.
- **macOS's firewall**, when it's on, asks the first time you host whether Phosphor may accept incoming network
  connections. Choose **Allow**, or no one else can reach your room.
- **Windows** may ask the same in a Windows Security window the first time you host. Allow it on private networks.

## Joining

Under **Join a room**, type the **Address** the host gave you and press **Join**. It's the host's address with
the port, such as `192.168.1.20:31337`, `my-mac.local` or a Tailscale address. Leave the port off when it's 31337.
Before connecting, a typo is caught:

- "Type the host's address."
- "The port must be a number from 1 to 65535."
- "An address looks like 192.168.1.20 or my-mac.local, with :port after it if the host chose one."

And once it has tried:

- "No Phosphor room answered at that address. Check it, and that the host's room is open."
- "That isn't a Phosphor room." (something else answered there)
- "Phosphor is there, but no room is open right now."

A room with a password says "This room needs a password" and adds a **Password** field. Type it and press **Join**
again. A wrong one is asked for again.

### The host lets you in

Every join is asked of the host. While they decide, you see "Waiting for the host to let you in." Once you're let in,
it says "Waiting for the host…" until their art arrives. The host sees "ann wants to join" with **Turn away** and
**Let in**, in the chat panel under who's here, and in **Settings and stats**. It counts as unread while the chat
isn't showing, so a host on **LAYERS** or with the panel folded sees it too.

- **Let in**: you're in. You stay let in for as long as the room lasts, so a reload or a dropped connection doesn't
  ask the host again.
- **Turn away**: "The host didn't let you in."
- At most five people wait at once. Past that: "The host has too many people waiting. Try again in a moment."
- **Max watchers** still applies.

## The connection isn't encrypted

Everything in a room (the art, the chat, the password) goes between the computers as it is, not encrypted. Someone who
can watch the network between you could read it. On a home network you trust that matters little. On a shared one
(a café, an office, the internet), it does. Tailscale encrypts what goes over it, so a Tailscale address is the
safer one to share.

The people you connect with see your IP address, and you see theirs. Host and Join both say so.

## Changing hosts

**Make host** works as on the web (see **When the host changes** in [Social](social.md)), with one more condition:
when someone starts drawing, their app opens its own room service and the host's app checks it can reach it. Only an
artist it reached can be made host, so **Make host** shows for them alone. Everyone then moves to the new host's
address on their own. Anyone still waiting to be let in sees "The room moved to a new host before you were let in."
Someone who can't reach the new host's address is told "The room moved to ann, and their
address couldn't be reached." The host's app only checked that *it* could reach the new host: on one network or on
Tailscale that holds for everyone; over the internet it may not.

**Quitting the app while hosting**, or closing the window that hosts, hands the room to the first connected artist
who can be host, as **Make host** does, and waits for them to take it, up to about 16 seconds. With no one to hand it
to, or no answer in time, the room ends. **End room** always ends it for everyone.

## When the host goes away

A room needs its host's app. If the host's computer sleeps, loses its network or the app stops, everyone waits about
a minute for the host's address to answer again. If it does, the room carries on. If not, the room is over: "The host
went away. You can try joining again later." No one takes over, since there's no server to decide who should.

A reload of the host's window picks up where it was, as on the web. Quitting and opening the app again isn't a reload:
the room is over, and people join the new one when the host starts it.

## No Block and no reports

There's no **Block** in the desktop app. Anyone can make a new name and key in a moment, so blocking one would stop
no one. Letting people in is the gate instead: **Remove** takes someone out and forgets that you let them in, so
coming back means asking you again, and you can **Turn away**.

There's nothing to report to either: no one at Phosphor sees a desktop room.

## Nothing goes to Phosphor

The app has no account and no sign-in, and sends nothing to Phosphor: no lobby, no room list, no reports, no usage.
It connects only to the rooms you host or join, at the addresses you give it, and to GitHub when you choose Check for
Updates. Its Privacy page says so: "This app sends nothing to Phosphor. In a room, the people you connect with see
your IP address. When you choose Check for Updates, it asks GitHub for Phosphor's releases, and GitHub sees your IP
address." Your drawings, name and settings stay on your computer.

## Not in this version

- Joining a desktop room from a browser, or a web room from the app.
- Rooms without an address someone can reach: there's no relay, so behind a network that won't let connections in,
  use Tailscale or forward the port.
- A narrow window: rooms need a wider one, as on the web ("Rooms need a wider screen."). Widen the window.
- Updating itself: Check for Updates finds the next release, and you download it.
