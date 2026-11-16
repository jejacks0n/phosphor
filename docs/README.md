# Phosphor Documentation

Learn how to create art, edit layers, and animate in Phosphor.

## User Guides

- [Layers](layers.md) — Manage layers (selecting, hiding, and renaming), understand the base layer (your image, converted to cells) and the drawing layers, merge layers up and down, erase, and use the selection tools.
- [Characters](characters.md) — Learn what a cell can hold, work with single-column and two-column characters (CJK and emoji), see how the converter picks characters, choose a display font, type any script, paste text, and save as `.utf8ans`, `.ans`, or `.png`.
- [Vector Shapes](vector.md) — Use the VECTOR tab to draw, move, scale, rotate, and style vector paths and shapes that stay editable over the art and convert with it into text art.
- [Animation](animation.md) — Create frame-by-frame animations, see what carries from one frame to the next, use onion skinning (ghosting), set frame timing, and export to animated `.ans`, `.cast`, `.gif`, or video (`.mp4`).
- [Rulers and Guides](rulers.md) — Measure character columns and rows, drag guide lines from rulers, set origin points, and see what's kept with each drawing.
- [Social Rooms](social.md) — Use SOCIAL in the side panel: the lobby, accounts and guests, hosting a room or watching someone draw, drawing together, chat, and blocking and reporting.
- [The Desktop App](desktop.md) — Download Phosphor for macOS, Windows, or Linux, host a room on your computer and share its address, join a room by address, let people in, and change hosts. No account needed, and nothing is sent to Phosphor.

## Interface Basics

### Color Theme
You can choose a color theme using the theme selector at the bottom of the settings panel (a moon, a sun, and a computer display, next to the language option):
- **Dark** (default): Uses dark backgrounds.
- **Light**: Uses light backgrounds.
- **System**: Matches your computer's theme setting, and changes when it does.

Your theme choice is saved in your browser.

### Navigation and URLs
The browser address bar updates to reflect your current workspace tab and, on SOCIAL, its page, so Back and Forward move between them and a reload comes back to the same place:
- **Start screen**: With nothing open, you are on the start screen, not a tab. The art tabs wait for something to show, none is selected, and the address is plain (`/`).
- **Opening**: Opening an image, project file, ANSI or text file, or blank canvas opens the **ANSI** view. An SVG opened from the start screen opens on **VECTOR**.
- **Tabs**: The top tabs follow the layer picked in LAYERS: a drawing layer or the base shows **PIXEL** and **ANSI** (labeled **ASCII** in the ASCII styles), a vector layer shows **VECTOR**, and **SAUCE** is always there ([Layers](layers.md#the-layers-list)).
- **Back to the start screen**: While you watch a room on the **ROOM** tab with nothing of your own open, any art tab takes you back to the start screen.
- **Narrow windows**: The side panel (LAYERS and SOCIAL) comes in over the art from the right, opened by **«** at the right end of the tab bar.
- For details on room URLs, see [Social](social.md).

---

## Developer Guides

- [Testing](testing.md) — Learn about the three test layers (unit, browser, and end-to-end), which one a new test belongs in, reference files, and turning a bug report into a test.
