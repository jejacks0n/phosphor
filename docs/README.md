# Phosphor Documentation

Learn how to create art, edit layers, and animate in Phosphor.

## User Guides

- [Layers](layers.md) — Manage layers (selecting, hiding, and renaming), understand the base layer (your image, converted to cells) and the drawing layers, merge layers up and down, erase, and use the selection tools.
- [Characters](characters.md) — Learn what a cell can hold, work with single-column and two-column characters (CJK and emoji), see how the converter picks characters, choose a display font, type any script, paste text, and save as `.utf8ans`, `.ans`, `.xb`, or `.png`, with bitmap fonts of your own.
- [Vector Shapes](vector.md) — Use the VECTOR tab to draw, move, scale, rotate, and style vector paths and shapes that stay editable over the art and convert with it into text art.
- [Animation](animation.md) — Create frame-by-frame animations, see what carries from one frame to the next, use onion skinning (ghosting), set frame timing, and export to animated `.ans`, `.cast`, `.gif`, or video (`.mp4`).
- [Rulers and Guides](rulers.md) — Measure character columns and rows, drag guide lines from rulers, set origin points, and see what's kept with each drawing.
- [Social Rooms](social.md) — Use SOCIAL in the side panel: the lobby, accounts and guests, hosting a room or watching someone draw, drawing together, chat, and blocking and reporting.
- [Plugins](plugins.md) — Install a plugin from a folder, a .zip or its manifest file, switch it on or off, remove it, pick the themes it adds, start with plugins off, and write a plugin of your own, a theme or a solver that chooses characters, and try it as you go.
- [The .pho File](pho.md) — What a saved project is for anyone reading one: a PNG of the drawing with the project inside, where the project sits, and what the picture shows.
- [The Desktop App](desktop.md) — Download Phosphor for macOS, Windows, or Linux, host a room on your computer and share its address, join a room by address, let people in, and change hosts. No account needed, and nothing is sent to Phosphor on its own.

## Interface Basics

### Your Tools and Colors
Your foreground and background colors, what the Color Picker picks, the tool on each tab (PIXEL, ANSI and VECTOR) and each tool's options (sizes, matching, the shape, the vector style, and the rest) are kept in your browser as you change them. A reload or a crash brings them back as you left them, and **New project** or opening a file leaves them as they are. They're yours, not the drawing's, so a saved project (`.pho`) and autosave don't keep them. With Phosphor open in two tabs, the one you changed last is what the next reload brings back. A plugin brush whose plugin is off or gone is the Brush until it's back.

### Color Theme
You can choose a color theme using the theme selector at the bottom of the settings panel (a moon, a sun, and a computer display, next to the language option):
- **Dark** (default): Uses dark backgrounds.
- **Light**: Uses light backgrounds.
- **System**: Matches your computer's theme setting, and changes when it does.

Your theme choice is saved in your browser. Plugins can add themes of their own, picked in a select under the icons ([Plugins](plugins.md#picking-a-plugins-theme)).

### Betas and Reporting an Issue
A beta or an alpha version of Phosphor says so under the logo at the top of the settings panel: **BETA** (or **ALPHA**), with **Report an issue** beside it. A version is one when its number ends in `-beta` or `-alpha` (About, opened from the logo, shows the number), and next.phosphor.work, where each change lands before it's released, is always a beta. A released version shows nothing there.

**Report an issue** opens a short form for telling Phosphor's developer about a bug. You don't need a GitHub account.
- **What were you doing?** and **What went wrong?**: The second is required. Each counts what you've written and stops at its most, 2,000 and 4,000 characters.
- **Send my drawing and this session's steps**: Ticked to begin with. The line under it says exactly what goes: your drawing's file name and size and how many steps, as in "sky.pho, 1.2 MB · 340 steps". The steps are the tools and commands you've used since the page loaded, with the names of your files and layers. Nothing you typed into SOCIAL is in them: no password, email address, code, room password or chat. With no drawing open, only the steps go. A drawing too big for a report (a report holds 25 MB) isn't sent, and the line says so. In a room you host or draw in, the drawing open is the room's, and the line says "This room's drawing". Unticked, only what you wrote goes.
- **Send**: Nothing of the report is sent before it. (On the web, opening the form loads Cloudflare's Turnstile, the check that a person is sending it, which shows only if it needs you.) **Cancel** while it's sending stops waiting, and keeps what you wrote.

What you write becomes a public issue on Phosphor's GitHub, with your version of Phosphor and your browser and system (the line above Send shows them), so leave out anything private. Your drawing and steps are never published: only Phosphor's developer sees them, and they're kept for 90 days. Sent, the form thanks you and says which issue it became, with a link; when the issue takes longer to open, it only thanks you. A report that can't be sent says why and keeps what you wrote, and so does closing the form, until the page is reloaded.

The desktop app's beta and alpha versions have the same line and form ([The Desktop App](desktop.md#what-the-app-connects-to)). This isn't how you report a person or a room in SOCIAL: that's [Social](social.md)'s own **Report**.

### Navigation and URLs
The browser address bar updates to reflect your current workspace tab and, on SOCIAL, its page, so Back and Forward move between them and a reload comes back to the same place:
- **Start screen**: With nothing open, you are on the start screen, not a tab. The art tabs wait for something to show, none is selected, and the address is plain (`/`). A dashed line runs around the canvas: drop a file anywhere inside it, or use **Choose a file** or **Start with a blank canvas** in its middle. On a phone there is no line, only the two buttons.
- **Opening**: Opening an image, project file, ANSI or text file, or blank canvas opens the **ANSI** view. An SVG opened from the start screen opens on **VECTOR**.
- **Back from what you opened**: A file, a blank canvas or a drawing resumed from **Pick up where you left off**, opened from the start screen, is a step: Back past its first tab closes it and shows the start screen again, as **New project** does, asking first when it has unsaved changes. It stays under **Pick up where you left off**.
- **Tabs**: The top tabs follow the layer picked in LAYERS: a drawing layer or the base shows **PIXEL** and **ANSI** (labeled **ASCII** in the ASCII styles), a vector layer shows **VECTOR**, and **SAUCE** is always there ([Layers](layers.md#the-layers-list)).
- **Back to the start screen**: While you watch a room on the **ROOM** tab with nothing of your own open, any art tab takes you back to the start screen.
- **Narrow windows**: The side panel (LAYERS and SOCIAL) comes in over the art from the right, opened by the unfold button at the right end of the tab bar.
- For details on room URLs, see [Social](social.md).

---

## Developer Guides

- [Testing](testing.md) — Learn about the three test layers (unit, browser, and end-to-end), which one a new test belongs in, reference files, and turning a bug report into a test.
