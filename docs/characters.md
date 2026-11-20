# Characters

In Phosphor, each grid cell holds one character. Phosphor arranges text the same way modern UTF-8 terminals do, so exported `.utf8ans` files look the same in a terminal as they do in the editor. You can use any letter, symbol, or emoji supported by modern terminals, in addition to classic DOS ANSI characters (CP437).

## Single-Column and Two-Column Characters

Every character occupies either one or two columns on the grid, following standard Unicode terminal rules:

### One Column Wide
- English letters, numbers, and standard punctuation.
- Box-drawing characters (such as `╬`).
- Block elements (such as `▀`, `▄`, `█`, `░`, `▒`, `▓`).
- Most symbols (such as `★`, `☺`, `♥`).
- Half-width katakana (such as `ｱ`).
- Characters that draw wider than their column (such as `﷽`): A terminal gives `﷽` one column, then draws its full shape over the cells after it, to the end of the row. Phosphor draws it the same way: the row keeps its columns, and the shape covers what follows. Phosphor measures how far it reaches in your display font (and the browser's fallback fonts), so a terminal using other fonts can draw it a little wider or narrower.

### Two Columns Wide
- Chinese, Japanese, and Korean (CJK) characters (such as `漢`, `か`, `가`).
- Full-width letters and symbols (such as `Ａ`).
- Emoji (such as `👍🏽`, `🇯🇵`). Emoji draw in their own colors, as a terminal shows them: the cell's foreground color doesn't change them, and its background color shows around them.

A character can be more than one code point: a letter with a combining accent, a skin-tone emoji such as `👍🏽`, or a flag is still one character in one cell.

---

## Two-Column Characters

A two-column character starts in its own cell and covers the cell to its right, whatever that cell holds, just as a terminal draws it:

- **Last column**: The last column has no room for a two-column character. One that ends up there shows (and exports) as a space. Typing one in the last column does nothing, and Phosphor tells you why.
- **Typing**: Typing a two-column character moves the text cursor two columns. In Insert and Partial mode, the rest of the row shifts right by two.
- **Overwriting**: Writing over either half of a two-column character turns the other half into a space, the way a terminal does.
- **Deleting**: **Backspace** over a two-column character, or **Delete** on one, removes the whole character.
- **Cursor movement**: The text cursor never stops on the covered right half. Moving right skips it, and clicking it puts the cursor on the character.
- **Erasing**: In the ANSI view, the Eraser erases the whole character from either half.
- **Selections**: Selections act on cells, and a two-column character belongs to the cell it starts in. A selection that includes that cell copies the whole character, even when the selection's right edge cuts it in half, and once pasted it still covers one cell past the paste.
- **Drawing tools**: Shapes, the Paint Bucket, and the F-key characters can draw with a two-column character. Each cell gets it and every other cell ends up covered, so a row of them reads as a row of characters.

---

## Converting Images to Characters

When converting an image to text, Phosphor uses only single-column characters. Any two-column characters in your **Characters** set are skipped during conversion, so the cells it fills never overlap.

### How the Converter Picks Characters

In the left panel's **Characters** section, the **Choose characters** dropdown (above the **Characters** field) sets how the converter picks each cell's character from your set. The section belongs to the layer picked in **LAYERS**, and its title shows that layer's name. Opening a picture picks **Base**, the picture's own layer; to change how the picture converts while another layer is picked, pick **Base** in LAYERS ([Layers](layers.md#the-left-column)).

Each **Art style** offers its own modes:

| Art Style | Available Modes |
| :--- | :--- |
| **ANSI** | Random, Best match, By shape |
| **Color ASCII** | By intensity, By shape |
| **Monochrome ASCII** | By brightness, By shape |

ANSI and the ASCII styles keep separate character sets.

- **Random** (ANSI): Picks characters from your set at random, using the **Character seed**. The same seed produces the same pattern, and the dice button generates a new one. Repeating a character in your set makes it appear more often. The seed shows only with Random, and only when your set has more than one character.
- **By intensity** (Color ASCII) and **By brightness** (Monochrome ASCII): Picks characters by how bright or strong each cell is. Darker cells get characters from the start of your set, and brighter cells get characters from the end.
- **Best match** (ANSI): For each cell, finds the character and the foreground and background colors that come closest to the picture, with both colors taken from the palette. Each character counts by how much ink it has in its top half and its bottom half, so `▄` shows one color above and another below, and `░`, `▒`, and `▓` show one flat mix of their two colors. With **Blocks & shades** (`▄░▒▓█`) and the CGA or VGA palette, it draws gradients with shades of the palette's colors. Without a palette (Full color), it mostly gives `▄` or solid cells, since it has no colors to mix.
- **By shape** (all styles): Samples each cell at a finer grid of 4 × 8 points and compares it with the shape of each character in your set; the closest wins. In ANSI it picks the character and both colors; in Color ASCII, the character and its ink color, on black; in Monochrome ASCII, the character alone, white on black. **Smoothing** doesn't change these samples: they're always averaged.

Best match and By shape ignore repeated characters in your set.

### Tuning Best Match and By Shape

- **Solids** (ANSI): Adjusts how strongly a plain solid cell (one color, whatever the character) is preferred over a shaded block or a half-block. At 0%, every cell gets whatever matches best; higher values give more flat cells and cleaner color regions. It isn't offered in the ASCII styles, where the background is always black.
- **Pattern light** (all styles): Controls how a character's foreground and background colors blend. At 0%, colors blend by simple average. At 100%, colors blend like light on a screen, so shaded blocks read lighter than the average.

### Dither

**Dither style** and **Dither** appear in the Characters section when a color palette is selected, for the base and vector layers (paint is never dithered):

- With **Random**, **By intensity**, and **By brightness**, Dither works on the picture's pixels, as described in [Layers](layers.md).
- With **Best match** or **By shape**, **Floyd–Steinberg** carries each cell's error on to the cells after it, and **Ordered (Bayer)** nudges each cell by its place in the grid. Floyd–Steinberg can lag on very large documents. While you edit the base layer, the cells under the edit settle when you let go.

### Each Layer's Own Character Settings

Each layer has its own **Choose characters**, **Characters** set, **Character seed**, **Solids**, **Pattern light**, and (for the base and vector layers, with a palette) **Dither style** and **Dither**. A change in the Characters section changes only how the picked layer's paint, picture, or shapes become characters. The **Art style** and the **Color palette** belong to the whole drawing ([Layers](layers.md#the-left-column)).

- **New layers** start with the picked layer's settings. A drawing saved before layers had their own settings gives every layer the settings it had, so it looks the same.
- **Seams**: Where a layer's settings differ from the base's, a seam can show where its cells meet the ones under it.
- **Best match and By shape on other layers** pick the way they do on the base. By shape samples a vector layer's shapes inside each cell over what's under them, so a circle's edge gets the same characters on its own layer as on the base. Best match mixes a layer's colors before the palette, so a soft edge can get a shade. By shape samples a drawing layer's paint inside each cell too: brush strokes cover whole half cells, but a picture added to the layer (dropped on the drawing, then **Add to this drawing**) gets the characters its edges would get on the base.
- **Dither on other layers**: On a layer using Best match or By shape, its own **Ordered (Bayer)** dither nudges each cell by its place, as on the base. Its own **Floyd–Steinberg** does nothing there, because those cells are matched one at a time over what's under them.

### Typed Cells, Pinned Characters, and Paint

- **Typed cells** are never changed by the converter, and a pinned character stays pinned.
- **With Random and Best match**, paint colors a cell's halves through its character (or makes a `▄` over a solid cell).
- **On the base under Best match and By shape**, paint goes into the base's pixels and the cell is matched again from them, with no `▄` (except over a pinned space), so switching between the two picks its character afresh.
- **On a layer under Best match and By shape**, a cell is matched again with the paint over it the same way, with no `▄` kept. A layer whose settings differ from the base's draws its paint with them: on a layer set to Random, strokes over a flat canvas come out in Random's characters, not half-blocks. The base's Random is the same: a stroke on a blank canvas, on the base or on a layer that shares its settings, comes out in Random's characters, with no `▄` made of a blank cell (Half-block draws `▄`).
- **With By shape**, a cell with paint in it is matched again with the paint over the picture, so it gets the character and colors it would have once merged down. White paint on black shows as characters in Monochrome ASCII, and a stroke over part of a cell gets the shape that fits it. Erase the paint, and the cell goes back to the picture's.
- **Paint covers whole half cells**, so on its own a stroke gives `▀`, `▄`, `█` and the like. The finer characters (quadrants, `▐`, `▌`, the rising blocks) come only where paint and the picture share a cell; detail finer than half a cell comes from the picture.
- **Floyd–Steinberg's error** doesn't pass through painted cells until they're merged down.

### What the PIXEL Tab Shows

In ANSI with a palette, the PIXEL tab shows the cells Best match or By shape chose. Each half blends its two colors by how much of it the character covers (as typed and drawn characters show there), so a `▒` of black and white shows as gray even when the palette has no such gray, and the Paint Bucket and Magic Wand go by what you see. Without a palette, and in the ASCII styles, the PIXEL tab shows the picture.

With the CGA or VGA palette, **Bake** bakes exactly, without asking how to keep the colors, when Dither is on or the characters come from Best match or By shape.

### Characters Are Measured in IBM VGA

Best match and By shape measure characters in IBM VGA, whichever font you view the art in, so the font never changes which characters are chosen: changing it changes how the cells look, not which characters they hold. Where two choices come out almost exactly as close, another computer (its graphics card) can occasionally pick the other one, in a cell here and there.

---

## The Font

In the **Drawing** section of the left panel, the **Font** dropdown sets the font the art is drawn in, in both views, and the size field beside it sets its size (6 to 64 px). A size typed takes effect on **Enter** or leaving the field; **Escape** puts back the one in use. Phosphor has four built-in fonts:

- **JetBrains Mono** (default): A clean, modern monospaced font.
- **IBM VGA**: The VGA font of vintage PC screens, with Unscii for the characters it lacks.
- **Unscii**: An 8-bit style font with wide coverage, including Symbols for Legacy Computing.
- **Unifont**: GNU Unifont, which covers almost every Unicode character in its own plain style.

IBM VGA, Unscii, and Unifont are 8×16 pixel fonts that share one cell, so box drawing and blocks line up whichever of them draws a character. Pixel fonts look sharpest at their own size or a whole multiple of it (16 or 32). Wide characters (Chinese, Japanese, Korean) and emoji come from your system's fonts.

- **Blocks and shades**: In the canvas view, block elements (`█`, `▀`, `▄`, `▌`, `▐`, and the quadrants) and shade blocks (`░`, `▒`, `▓`) aren't drawn from the font. Phosphor draws them itself, as most terminals do, so they fill their cells exactly and the shades' dots line up from cell to cell, in any font (a dot is a sixteenth of the cell's height, the VGA's own pixel).
- **Smooth text**: Everything else is drawn from the font, either smoothed (anti-aliased) or pixel-sharp. Toggle **Smooth** in the ANSI view's status bar; it applies in both views.

### Custom Fonts

Click **Load font** (beside the Font label) to load a TrueType (`.ttf`), OpenType (`.otf`), or WOFF (`.woff`, `.woff2`) font from your computer:

- **Monospaced only**: Every character must share the same width, as in a terminal. Phosphor checks ten characters (`il.' MWm@0`) and tells you when their widths differ.
- **Size and height**: A loaded font starts at 16px and keeps its own line height, so a full block fills its cell.
- **Stored in your browser**: Loaded fonts stay in this browser until you remove them (click **Remove**, shown while the loaded font is in use). They're never uploaded anywhere.

### What the Font Changes

The font changes how the art looks in Phosphor. It also changes how the characters you draw look in the PIXEL tab, and in the image when you merge them into it: each cell blends its colors by how much of it the character covers, measured in the font you see.

It doesn't change how an image converts, or what's saved or exported; a terminal or viewer draws the file in its own font. The font and its size are kept in this browser, not in the project.

### Fonts in Shared Rooms

While you draw in someone's room, the art is drawn in the host's font and size, and follows them when they change it. The Font field shows the host's font, turned off, and yours comes back when you stop. A font the host loaded from their computer can't be sent, so the room sees JetBrains Mono instead.

---

## Typing Text Directly

With the **Edit Mode** tool (**T**) selected, you can type characters, symbols, and emoji directly onto the canvas:

- **Input methods**: Type with your system's input method (Japanese, Chinese, Korean...), dead keys and accents, and the emoji picker, the same as in any text field.
- **Spaces**: A space has nothing to draw in the foreground color, so typing one (or the space **Backspace** leaves in Overwrite mode) sets the cell's background and leaves its foreground as it was. On the base, a cell's foreground is its lower half in the PIXEL view, so a typed space puts no stripe of your foreground color there.
- **Undo**: A run of typing is one undo step. It ends when you pause for a second, move the cursor (a click, the arrow keys, **Enter**, **Home**, **End**), or paste.
- **Overwrite, Insert and Partial**: Press **Insert**, or **Alt+Enter** (**Option+Enter** on a Mac, whose keyboards have no Insert key), or click the mode's button in the ANSI view's status bar, to go from one typing mode to the next:
  - **Overwrite** (the default) replaces the cell under the cursor and moves nothing.
  - **Insert** pushes the rest of the row right first, its characters and its paint together, so a row moves as one thing.
  - **Partial** pushes the row's characters right and leaves its paint where it is: text slides along over what's painted under it.

  **Backspace** and **Delete** follow the mode: in Insert they pull the rest of the row left, paint and all, and in Partial its characters alone. In Overwrite, Backspace leaves a space and Delete pulls the characters left. Only the layer you're typing on moves. On the base layer the modes work the same way ([Drawing on the base](layers.md#drawing-on-the-base)).
- **Past the row's end**: What Insert or Partial pushes off the right edge of the canvas isn't lost. Whatever pulls the row left again (**Backspace** in Insert or Partial, or **Delete**) brings it back in, in order, gaps and all, also after you've paused or typed on another row. Insert brings back each cell as it was, its paint too; Partial, and Delete in Overwrite, bring back the characters alone. It works on the base as on a layer. Undo and redo keep it in step. It's remembered while the drawing is open at that width, per layer, row and frame, until the layer is cleared or merged; it isn't saved with the project or sent to a room, and widening the canvas doesn't show it.
- **Settings while you type**: Change a setting with the mouse (the **Font**, a slider, a checkbox) and you're still typing: the next key goes to the canvas. A field you type in (a size, the **Characters** set) keeps the keyboard until **Escape**, which puts its value back and returns you to typing, the cursor where you left it. A menu or slider you reached with **Tab** keeps the keyboard for its arrow keys, until **Escape** too.
- **Pasting text**: Pasted text types from the cursor. Each new line starts on the next row, at the column where the paste began. Once a row is full, the rest of that line is dropped, and lines past the last row are dropped too. Characters a cell can't hold (tabs, invisible characters, an accent on its own) are skipped. A paste is one undo step.
- **What Cmd/Ctrl+V pastes**: Whatever you copied last: a Select-tool block copied in Phosphor (in this tab or another), a block copied in Moebius, or text copied anywhere else, such as PabloDraw, which gives other apps only its characters ([Layers](layers.md#the-select-tool)).

---

## Saving and Exporting

- **Save project** (**Cmd/Ctrl+S**) saves a `.phosphor` file: the picture, every layer, animation frames, vector shapes, and the settings, SAUCE included. The display font and the rulers' guides aren't part of it; they stay in your browser.
- **Export…** (**Cmd/Ctrl+E**) opens the Export dialog, which lists the **Still** formats (`.ans`, `.utf8ans`, `.png`) and, once Animate is on with more than one frame, the **Animated** ones ([Animation](animation.md)).
- **Share** (PNG, GIF and video, where the browser has a share sheet that takes the file: phones, Safari, and Chrome and Edge on most computers): Sends the file to your system's share sheet instead of downloading it, to post it, message it, or put it in your photos. A long GIF or video can take longer to write than the browser allows after a tap; it waits, and **Share now** opens the sheet with your next tap.
- **Saving over the file** (Chrome, Edge and other Chromium browsers): Save writes a project straight back to its file. A `.phosphor` file opened with Choose a file, Cmd/Ctrl+O, dropped on the page or opened from your computer (below) saves back over itself; a drawing that has never been saved, or **Save As** (**Shift+Cmd/Ctrl+S**), asks where with the browser's own save box, and Save writes over that file after. Before Phosphor first writes over a file you opened, and again after a reload, the browser asks whether it may. The file stays the drawing's after a reload; a duplicated tab's copy has none until it's saved. A save is written whole: if it fails, the file is left as it was. Exports are still downloads, or go to the share sheet. In Safari and Firefox every save is a download, named in the save dialog, as below.
- **Opening files from your computer** (Phosphor installed from Chrome or Edge on a computer, with **Install** in the address bar or the browser's menu): Phosphor is offered under **Open With** for `.phosphor` projects, ANSI and text art (`.ans`, `.utf8ans`, `.asc`, `.nfo`, `.diz`, `.txt`), SVGs and pictures. The browser asks the first time whether Phosphor may open them. Each file opens in a window of its own, the way a file chosen on the start screen opens, and a project saves back over its file. The [desktop app](desktop.md) does the same without a browser.
- **File names**: Both dialogs offer the document's name with the date and time (`art-20261030-131405`), so each save is a new file; type over it for any other name. The name you give becomes the document's name, so the next save starts from it, with a new time. Every browser saves the file as a download with that name, Safari included.

### Saving .utf8ans and .ans

- **`.utf8ans`**: Modern Unicode ANSI. Keeps every character. A two-column character is written once and the terminal moves two columns for it, so the rows line up.
- **`.ans`**: Classic DOS CP437, which can't hold most Unicode characters. Each character it lacks is written as its closest lookalike, or `?`. Before you export, the Export dialog lists every one, what it becomes, and how many cells use it. A two-column character becomes its stand-in plus a space, so the grid still lines up.
- **Colors** are written as the **Color palette** says: CGA as the 16 classic colors, VGA as 256-color codes (`38;5`), and everything else as 24-bit codes (`38;2`). A file you opened keeps the palette it came with ([Opening a file](layers.md#opening-ansi-and-text-files)), so it comes out in the same kind of codes.

#### Fixed Black and White (VGA)

In 256 colors, 16 and 231 are a terminal's fixed black and white, while 0 and 15 follow the terminal's theme. Phosphor shows them alike but keeps their codes apart:

- An opened file's 16 and 231 stay 16 and 231, opened with **Edit artwork** or **Draw on top**, and when they're moved, copied (into another tab too), rotated, merged down (onto the base too), merged exactly into the image, flattened, undone, or saved in a project.
- The color picker's VGA swatches include 16 and 231 as swatches of their own, and the Eyedropper picks them as they are. The recent colors keep them too: 16's black and 0's are two recent colors. What you type, fill, draw with Shapes, or set with **Set FG** and **Set BG** in them comes out as 16 or 231, and **Alt+↑** and **Alt+↓** step through them in order.
- The Brush paints pixels, so its black and white are always 0 and 15, and so is a 16 or 231 cell painted over.

### SAUCE Metadata

Exported `.ans` and `.utf8ans` files, animated ones too, end with a SAUCE metadata record, which holds what's on the **SAUCE** tab: title, author, group, date, comments, font name, and letter spacing.

- **Include SAUCE**: The Export dialog's checkbox for the ANSI formats, checked each time the dialog opens. Unchecked, the file ends with the art: no record, no comments, and no end-of-file byte before them. The dialog then says what other viewers lose without it: the title, author, width, and font, and some show bright backgrounds blinking. Phosphor opens such a file with an empty SAUCE tab ([Opening a file](layers.md#opening-ansi-and-text-files)).

- **A new drawing** starts with an empty SAUCE tab: a picture, an SVG, or a blank canvas keeps nothing from the drawing before it (no title, author, group, date, or comments, the font name back to IBM VGA, and letter spacing to 8px).
- **A converted image or a blank canvas** gets Phosphor's own comment lines first (Created with Phosphor, and the settings it was converted with), then a blank line and yours. An empty date is the day you export, the font name is IBM VGA, and the letter spacing is 8px.
- **A file you opened** gets none of them: its record comes out as it went in, with its date, flags (iCE colors, letter spacing), font name, size, and comments changed only where you changed them on the SAUCE tab. An empty date or font name stays empty, and its field says so. Letter spacing changes only its own bits of the flags. A resize changes the size it gives.
- **Widths**: Title holds 35 characters; Author, Group, and Font name hold 20 each. They're counted as the record counts them (one per character, an emoji too), with a count beside each field. A field stops at its width, and when a paste or a key goes past the end, a line under it says how many characters fit, until the field next changes.
- **Date** is YYYYMMDD and takes digits. A date that isn't a real day gets a note under the field, and is written as typed.
- **Comments** are lines of up to 64 characters: a longer line breaks at a space, and only a word longer than 64 characters is split. The record holds at most 255 lines. Under Comments, the SAUCE tab counts the lines the record would take ("128 of 255 SAUCE lines"), saying how many are Phosphor's own, and past 255 says from which line comments won't be in the file; the Export dialog says it again before you export. The field keeps everything you paste, so trimming is up to you.
- **Font name and Letter spacing** (Not set, 8px, or 9px) tell other viewers how to show the file. Phosphor's view keeps your display font.
- **CP437**: The record is CP437 in `.ans` and `.utf8ans` alike. A character it lacks is written as its lookalike, or `?`, and the Export dialog lists those too, for every ANSI format, with the fields each is in. Only what reaches the record is listed.
- **Control characters** (tab, ESC, and the like), which a terminal printing the file would act on, can't be in SAUCE. Typed or pasted, they're left out and the line under the field says so, and an export leaves out any that a project or an opened file still has. A comment's line breaks stay, since they make its lines.

### Exporting .png

A `.png` is a picture of the art as the ANSI view draws it, in your display font, at one pixel per font pixel: the frame that's showing, with or without Animate.

- **With Smooth text off** (the status bar's **Smooth**), every pixel is one of the art's colors and the file is small.
- **With Smooth text on**, the Export dialog offers a **Text rendering** choice: **Smooth** (picked first) keeps the anti-aliased edges, which add colors and make the file a few times bigger, and **Hard-edged** draws the text crisp, as with Smooth text off. The choice doesn't change the Smooth setting, and isn't remembered.

### Automatic Browser Backups

Phosphor keeps your work in your browser as you go:

- **Reloading** brings it back, with an empty undo history, and a new tab offers your recent work to pick up.
- **Pick up where you left off**: The start screen lists your last five drawings, newest first, in the middle of the canvas under **Choose a file** and **Start with a blank canvas** (which shrink to a band over the list while there is one). Each row is two lines: its name with the extension of the file it came from or last went to (`.phosphor`, `.ans`), and under it when you last changed it (with the seconds when two of the same name share a minute) and whether it's **Unchanged** since it opened, **Changed**, or **Saved** to a file since its last change. A drawing saved as a project keeps its project's name through exports, so it doesn't read as an export you opened. Click anywhere on a row to pick it up (**Resume ›**). A name too long for its line ends in "…", and hovering the row shows it whole. A drawing open in another tab is dimmed and reads **In another tab**. Each file you open is a drawing of its own there, so a file opened twice is listed twice.
- **Versions** lists snapshots taken at most every 5 minutes while you work (the last 20). Restoring one keeps what you had in the list, as "Before restore" if it isn't there already.
- **As opened**: A file you open (a picture, a `.phosphor` project, an ANSI or text file, or an SVG) is kept as "As opened" once you first change it, even after a reload. It stays among the 20 however many versions come after, so Versions can always take it back to how it opened.
- **Unsaved changes**: New project, or a project file or picture opening in place of a drawing with unsaved changes, asks first: **Save project first** (the save dialog, then it goes on; canceling the save stays), **Start without saving** or **Open without saving** (the drawing stays in this browser, under Pick up where you left off), or **Cancel**. An export isn't a save, so it still asks after one. A file whose own question offers to open it in the drawing's place (an art file, an SVG, a picture) says so on those choices instead of asking twice. A drawing picked up from Pick up where you left off still says **Changed** there if it was, but asks nothing until you change it again: leaving it loses nothing new.
- **Leaving the page**: Once the art has been saved to a file or opened from one, leaving the page no longer asks, unless the latest edits haven't been written yet. A room you host always asks.

Saving a file to your computer is the real backup. Clearing site data deletes what's kept in the browser, Safari can also delete it after seven days of browser use without a visit, and a private window's kept work is gone when the window closes.

Opening a file, picking up where you left off, the art of a room you draw in arriving, saving and exporting say what they're doing at the bottom of the screen ("Opening long.ans…", "Saving night.phosphor…") when they take more than half a second, and the note goes when they're done.

---

## When Art Looks Wrong in Someone's Terminal

- **Ambiguous width**: Some characters, including the block elements, are "ambiguous width" in Unicode. Most terminals show them one column wide, and so does Phosphor. A terminal set to show ambiguous characters as wide (an option in many terminals, and sometimes the default for Chinese, Japanese, or Korean setups) draws them two columns wide, and block art falls apart there. That's the viewer's setting, not the file.
- **Newer emoji**: Terminals also differ on some newer emoji. Phosphor follows current Unicode, as recent terminals do.
