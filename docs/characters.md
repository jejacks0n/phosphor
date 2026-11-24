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

- **A plugin's solver**: a plugin that adds one puts it in the list after the built-ins, under its own name
  ([Plugin solvers](#plugin-solvers)).

Best match and By shape ignore repeated characters in your set.

### Tuning Best Match and By Shape

- **Solids** (ANSI): Adjusts how strongly a plain solid cell (one color, whatever the character) is preferred over a shaded block or a half-block. At 0%, every cell gets whatever matches best; higher values give more flat cells and cleaner color regions. It isn't offered in the ASCII styles, where the background is always black.
- **Pattern light** (all styles): Controls how a character's foreground and background colors blend. At 0%, colors blend by simple average. At 100%, colors blend like light on a screen, so shaded blocks read lighter than the average.

### Dither

**Dither style** and **Dither** appear in the Characters section when a color palette is selected, for the base and vector layers (paint is never dithered):

- With **Random**, **By intensity**, and **By brightness**, Dither works on the picture's pixels, as described in [Layers](layers.md).
- With **Best match** or **By shape**, **Floyd–Steinberg** carries each cell's error on to the cells after it, and **Ordered (Bayer)** nudges each cell by its place in the grid. Floyd–Steinberg can lag on very large documents. While you edit the base layer, the cells under the edit settle when you let go.

### Plugin solvers

A [plugin](plugins.md) with a script can add ways to choose characters. They're listed in **Choose characters** after the
built-ins, by the plugin's names, and only the ones that do the drawing's Art style. A plugin solver is a kind of By
shape: it sees each cell as By shape does, and it holds to the layer's set (and the characters it adds itself), the
palette and the style, so a cell it draws can never be outside them. Its options show under it, in the plugin's own words:
sliders, checkboxes, choices and colors. Each option change is one undo step, and the choice and the options are kept
for each layer and saved with the drawing. Choosing one, or changing an option, works out the whole drawing again, which for a
large one takes a moment ("Working out the characters…" shows while it does).

Over the picture, a plugin solver may look at the cells around a cell (as far as its own reach). Where paint is drawn
over the picture, and on layers above, it sees only that cell, and what it draws there is what the drawing shows once
those layers are merged down ([Cells and paint](model.md), R12). With **Floyd–Steinberg** dither, the cells
within reach of a stroke you're drawing lose their dither until you let go, as By shape's edited cells do, over a wider
area.

**When the solver isn't there**, the layer shows By shape in its place, with a note under **Choose characters**, and a ⚠
beside the layer's name in LAYERS. The note says why:

- "Outlines isn't installed. Showing By shape." The plugin was removed, or this browser never had it. When the plugin is gone its name isn't known, so the note uses the solver's id.
- "Outlines is off. Showing By shape." The plugin is switched off.
- "Plugins are off for this visit. Showing By shape." The page was loaded with `plugins=off`.
- "Outlines doesn't do ASCII. Showing By shape." The solver doesn't do the drawing's Art style.
- "Outlines failed: … Showing By shape." The script threw; the message is its own.
- "Plugin solvers aren't used in rooms. Showing By shape." In a room, everyone sees By shape.

The file keeps the choice and its options, so installing the plugin, or switching it on, brings the look back. Exports
use By shape for those layers, and the export dialog names them ("Base shows By shape in
place of its plugin solver."). Hosting a room is refused while a layer uses a plugin solver (a stand-in counts), and says
which layer: choose a built-in solver for it, or Flatten the drawing first.

### Each Layer's Own Character Settings

Each layer has its own **Choose characters**, **Characters** set, **Character seed**, **Solids**, **Pattern light**, and (for the base and vector layers, with a palette) **Dither style** and **Dither**. A change in the Characters section changes only how the picked layer's paint, picture, or shapes become characters. The **Art style** and the **Color palette** belong to the whole drawing ([Layers](layers.md#the-left-column)).

- **New layers** start with the picked layer's settings. A drawing saved before layers had their own settings gives every layer the settings it had, so it looks the same.
- **Seams**: Where a layer's settings differ from the base's, a seam can show where its cells meet the ones under it.
- **Best match, By shape and plugin solvers on other layers** pick the way they do on the base (a plugin solver sees only its own cell there, [Plugin solvers](#plugin-solvers)). By shape samples a vector layer's shapes inside each cell over what's under them, so a circle's edge gets the same characters on its own layer as on the base. Best match mixes a layer's colors before the palette, so a soft edge can get a shade. By shape samples a drawing layer's paint inside each cell too: brush strokes cover whole half cells, but a picture added to the layer (dropped on the drawing, then **Add to this drawing**) gets the characters its edges would get on the base.
- **Dither on other layers**: On a layer using Best match or By shape, its own **Ordered (Bayer)** dither nudges each cell by its place, as on the base. Its own **Floyd–Steinberg** does nothing there, because those cells are matched one at a time over what's under them.

### Typed Cells, Pinned Characters, and Paint

- **Typed cells** are never changed by the converter, and a pinned character stays pinned, except under paint on the base in Monochrome ASCII, which can't show a pinned character's colors: the paint takes the pin, and the cell is converted from the paint ([Layers](layers.md)).
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

Best match and By shape measure characters in IBM VGA, whichever font you view the art in (a drawing's own bitmap font is the exception: [Bitmap Fonts](#bitmap-fonts)), so the font never changes which characters are chosen: changing it changes how the cells look, not which characters they hold. Where two choices come out almost exactly as close, another computer (its graphics card) can occasionally pick the other one, in a cell here and there.

---

## The Font

In the **Drawing** section of the left panel, the **Font** dropdown sets the font the art is drawn in, in both views, and the size field beside it sets its size (6 to 64 px); **Manage** beside it opens the Fonts page ([Managing Fonts](#managing-fonts)). A size typed takes effect on **Enter** or leaving the field; **Escape** puts back the one in use. Phosphor has four built-in fonts, and can load fonts of your own ([Managing Fonts](#managing-fonts), [Bitmap Fonts](#bitmap-fonts)):

- **IBM VGA** (default): The VGA font of vintage PC screens, with Unscii for the characters it lacks. A browser that already had a font picked keeps it.
- **JetBrains Mono**: A clean, modern monospaced font.
- **Unscii**: An 8-bit style font with wide coverage, including Symbols for Legacy Computing.
- **Unifont**: GNU Unifont, which covers almost every Unicode character in its own plain style.

IBM VGA, Unscii, and Unifont are 8×16 pixel fonts that share one cell, so box drawing and blocks line up whichever of them draws a character. Pixel fonts look sharpest at their own size or a whole multiple of it (16 or 32). Wide characters (Chinese, Japanese, Korean) and emoji come from your system's fonts.

- **Blocks and shades**: In the canvas view, block elements (`█`, `▀`, `▄`, `▌`, `▐`, and the quadrants) and shade blocks (`░`, `▒`, `▓`) aren't drawn from the font. Phosphor draws them itself, as most terminals do, so they fill their cells exactly and the shades' dots line up from cell to cell, in any font (a dot is a sixteenth of the cell's height, the VGA's own pixel).
- **Smooth text**: Everything else is drawn from the font, either smoothed (anti-aliased) or pixel-sharp. Toggle **Smooth** in the ANSI view's status bar; it applies in both views.

### Managing Fonts

The Font dropdown chooses the font; loading, saving and removing fonts happen on the **Fonts** page of the character palette layer. Click **Manage** beside the Font field to open it. It opens with any tool in hand (from the SAUCE tab it switches to ANSI first), and on the start screen before any drawing is open. A bitmap font chosen there, or in use when you start a blank canvas, is the new drawing's font; the font you pick stays until you pick another. Opening an ANSI, BinaryText (`.bin`) or text file, or a project with no bitmap font, keeps it (unless its SAUCE names a library font); an XBin brings its own font, or IBM VGA when it holds none, and a project with a bitmap font brings that one. A reload keeps it too. Switching from **Fonts** to **Palettes** (or **Palettes**) opens the palette editor, so the layer keeps its width; **Escape** there closes the layer. The palette editor and the Fonts page float under the toolbar on a big window; on a smaller one (under 1000px wide, or 520px tall) they open as a dialog over the dimmed page, and on a phone's width (under 700px) they take the whole window. Wider than a phone, the full screen button at the layer's top right makes them take the whole window, the list still beside the editor, until you press it again or the layer closes. Close the layer with **Escape**, a click outside it, the Type tool's palette button, or, as a dialog or the whole window, the **×** at its top right. Resizing the side panel leaves it open.

In someone else's room, and while you're inside an art layer, the Font field's **Manage** is off with the rest of the Drawing settings. There, reach the Fonts page through the Type tool's palette button and the layer's **Fonts** tab ([Fonts in Shared Rooms](#fonts-in-shared-rooms)).

The character palette layer has two tabs at the top, **Palettes** and **Fonts**. **Palettes** is the palette editor ([Palettes That Belong to a Font](#palettes-that-belong-to-a-font)).

### The Fonts Page

The page has a filter and **+ Load**, which loads and uses a bitmap font (`.F01` to `.F32`, the number being the height of a character in pixels, or a PNG sheet of one, 16 characters across and 16 down, 256 in all) or a monospaced TrueType (`.ttf`), OpenType (`.otf`) or WOFF (`.woff`, `.woff2`) font from your computer. Below are three groups: **In use** (the font the art is drawn in, bitmap or TrueType: a bitmap font is the drawing's own, saved with it, or the next drawing's on the start screen; a TrueType font is only what you view in), **Favorites** (the other fonts kept in this browser) and **Built-in** (Phosphor's four, with **Use this font** and nothing to save or remove). Each row has the font's name, its size (a bitmap font's width as it's drawn: the drawing's at its width now, another at its remembered width, else its own, so CM-7X7 reads 7×7) and a sample of text drawn in that font (a bitmap font's from the same slots as the library's samples, so where a font has no shade or block it shows what the font has there, not a shade drawn from another font). Every group but **In use** folds on its title, which counts the fonts in it that match the search ("Built-in · 4"), so you can see what a folded group holds; the Up and Down arrow keys skip a folded group's rows, and the folds are remembered in this browser.

Choosing a row shows that font's name and size, **Use this font** when it isn't the one in use, a **…** menu with its other actions, and its 256 slots drawn in the font. Hover a slot to see its number, or click it to see its glyph large over the sheet, for a closer look; a second click, Escape, or a press elsewhere puts it away. (With a block or a line piece picked to set, a click sets its slot instead; press and hold the slot for the closer look then.) The Up and Down arrow keys choose the previous and next font in the list. Choosing a row only shows it; nothing changes in the drawing until you use it. Loading a file is different: the font you load is put to use at once (except in someone else's room), and **Use this font** is for fonts already loaded. It does what choosing the font in the Font dropdown does.

- **The drawing's font**: **Export palettes** and **Palettes** (which opens the Palettes page) in the **…** menu. If the same font is also kept in this browser, **Remove** is there too.
- **Another bitmap font**: **Use this font**, and **Export palettes** in the **…** menu, with **Remove** for a font you loaded from a file; a library font in Favorites has a lit **★ Favorite** beside **Use this font** instead, and pressing it forgets this browser's copy. **Use this font** gives the drawing that font, as one undo step; it's saved with the drawing.
- **A TrueType font** (a built-in one too): a sample of text, **Use this font**, **Export palettes**, **Palettes** once it's in use, and **Remove** (not for a built-in one). A TrueType font draws any character, so it has no slots, and it isn't saved in the drawing. **Use this font** takes the drawing's bitmap font away (one undo step) and draws in the TrueType font, for you only: it's kept in your browser, not in the drawing.
- **In someone else's room**: **Use this font** is off. Loading, saving, **Remove** and the palettes still work.
- **Remove**: forgets this browser's copy of the font. A drawing keeps its own font, and the palettes tied to the removed font stay ([For Fonts Not Loaded](#for-fonts-not-loaded)).

Loaded fonts stay in this browser until you remove them. They're never uploaded anywhere.

#### The font library

Under **Built-in** is a fourth group, **Library**: a few thousand bitmap fonts from VileR's VGA text mode fonts and Mœbius's XBin fonts, each row with its name, its size and machine (`8×16 · Amiga`; a font whose source doesn't say, like Mœbius's discmaster fonts, shows only its size) and a sample drawn in its own glyphs. The library is fetched when the Fonts page opens, not before; while it loads the group says so, and if it can't load it says "The font library couldn't load." with **Try again**. The other groups work either way. The group's label counts the fonts ("Library · 2,458 fonts", or "Library · N found" while you've narrowed it), and it shows 100 at a time: **Show 100 more** adds the next 100. FROGBLOCK is listed but isn't included: its row says "not included" and shows its credit instead of a sample. Choosing a library row selects it, as any other, and the Up and Down arrow keys walk through the library's rows too.

Choosing a library row shows its details on the right: its name, "8×16 · Library" (a font drawn narrower than 8 says its own width, like "7×7 · Library"), **Use this font** and **☆ Favorite**, its tags as chips (click one and it becomes the picked tag), its 256 slots (the font is fetched to show them, and its sheet is an empty frame while it loads; if it can't be fetched, its sample shows instead, drawn larger), and under them where it came from and its license. **Use this font** fetches the font (a few KB), keeps it in Favorites and makes it the drawing's font; **Favorite** keeps it without using it. A font already in Favorites (or already the drawing's font) is never fetched again and never listed twice: its details are those of the font in Favorites, with the same From and License lines. In someone else's room, **Use this font** keeps it in Favorites but doesn't apply it, as **+ Load** doesn't. If the font can't be fetched (offline, say), the page says under the list that Phosphor couldn't fetch it and to check your connection; if the file isn't the size a bitmap font is, it says that. Either way nothing changes.

Each font shows its source and license: **From** names the collection and links to it, and **License** reads **None given · credits in FONTS.TXT** for VileR's fonts (linking the credits file that ships with them; in the desktop app, its copy on GitHub), or **Unknown · Know it?** with a **Tell us** link that opens a new issue for that font. Fonts of yours whose bytes match a library font show the same lines, under their slots.

A linked font (FROGBLOCK) can't be included. Its details say "8×8 · Library · not included" and offer **Get it** (the author's page) and **+ Load**, with a **Credit** line and a link to its license. Load the file you got with **+ Load** and Phosphor recognizes it, whatever the file is called: it's named FROGBLOCK (in Favorites and in the Font field) and its credit shows under its name in the list. An XBin carrying its bytes opens with the font named FROGBLOCK too. While a drawing uses it, the credit also shows under the Font field in the settings panel.

The filter field is **Filter fonts…** (its **×** clears it). It matches a library font's name, machine and description, and the names in the other groups. Beside the list, the **Filters** column holds the library's tags in five groups (Machine, Shape, Characters, Collection and Other: Ready to paint), each with a header that folds it and says how many of its tags are picked, or how many it has. Machine names the computer a font comes from: IBM PC for PC fonts, Amiga, Commodore 64, Tandy, BBC Micro, Amstrad and the rest from what the collections say of each file, and PC clones for video cards' and BIOSes' fonts. It shows its ten biggest machines (picked ones first) and **+ N more** for the rest, and **Find a machine…** finds one by name. Shape lists the shapes by height, then width. Each tag shows how many library fonts carry it. Tags in one group widen (IBM PC and Amiga lists both machines' fonts), and tags in different groups narrow (IBM PC and 8×16 lists the IBM PC fonts that are 8×16). A picked tag is lit in the column; click it again to drop it, or **Clear all** in the column's head to drop them all (the search stays). The column starts folded away: the open button beside the search opens it, and a fold button in its place folds it again. Whether it's open is remembered, with its groups' folds. Full screen widens the column and the list. On a phone, that button opens them as a sheet over the page, with **Clear all** and **×** at its top; **Show N fonts** at its bottom (or **×**, or **Escape**) closes it. When nothing matches, the group says so and **Clear** puts back the whole library.

### Custom Fonts

A TrueType (`.ttf`), OpenType (`.otf`) or WOFF (`.woff`, `.woff2`) font loaded with **+ Load** shows in the Font dropdown under **Yours**:

- **Monospaced only**: Every character must share the same width, as in a terminal. Phosphor checks ten characters (`il.' MWm@0`) and tells you when their widths differ.
- **Size and height**: A loaded font starts at 16px and keeps its own line height, so a full block fills its cell.
- **Stored in your browser**: Loaded fonts stay in this browser until you remove them (**Remove** on the Fonts page). They're never uploaded anywhere.

### Bitmap Fonts

Use **+ Load** on the Fonts page to pick a raw bitmap font (`.F01` to `.F32`) or a PNG sheet of one. The drawing is drawn in it at once, the way old DOS art is (not in someone else's room). Later, **Use this font** gives the drawing any font you've loaded.

A bitmap font belongs to the drawing, not to your browser:

- **It's saved**: A project keeps it, and so does an XBin export ([Saving .xb](#saving-xb)). Opening an XBin that holds a font gives the drawing that font.
- **It's one undo step**: Setting it, and taking it off by choosing another font, are each a step you can undo. It's listed under **This drawing** in the Font dropdown; choosing any other font takes it away. **Remove** (on the Fonts page) only clears a loaded font from your browser; the drawing keeps its own.
- **Only its 256 characters**: A drawing with a bitmap font shows and exports only the font's 256 characters, in cells as wide as the font is drawn (8 pixels, 9 with Letter spacing 9px, or a narrow font's own width; see **Narrower than 8**) and as tall as the font. The **character palette** shows its 256 slots ([The Fonts Page](#the-fonts-page)). A character the font has no slot for shows as its nearest classic (CP437) stand-in when the font has a slot for that, and blank when it has neither (a ▄ in a font with no lower half, say). The character you typed is kept either way: choose another font and the original comes back.
- **Blocks and shades come from it**: Block elements and shades are drawn from the font's own pixels, so they look as the font draws them.
- **Its cells are the grid's shape**: A cell is as wide as the font is drawn and as tall as the font, in the ANSI and PIXEL views and in PNG and GIF exports. An 8×8 font's cells are square, and an odd height splits a cell's halves unevenly (an 8×11 font's are 5 and 6 pixels). Pictures convert in that shape and the aspect lock keeps it, so a 4:3 photo at 80 columns is 60 lines in an 8×8 font. The Brush, the Eraser, Retouch and the Paint Bucket's gradients are round on screen, and Shift's squares and circles, and Rotate, are square, round and true on screen too. In a font whose cells aren't 1:2, Blur, Sharpen and the other filters reach as many grid pixels down as across, so in an 8×8 font they reach half as far down on screen. A font size only scales the cell.
- **Another height**: Switching to a font of another height keeps the columns and changes the lines so the picture keeps its shape: going from 8×16 to 8×8 doubles the lines, and going back halves them. Typed characters and pins keep their places, so a drawing made in 8×16 has them in the top half of the 8×8 grid, and a pinned character keeps its colors as well as its place. Paint, the picture and vector shapes stretch with the lines, so a picture a Columns change cropped or left in a corner stays where it was under your characters. It's one undo step. It isn't possible in a drawing with frames, and near the size limits the columns give way. With nothing drawn yet, a switch is like changing **Columns** with the lock on, so **Columns** still refits the photo afterward.
- **Narrower than 8**: Some fonts are drawn narrower than 8 pixels (CM-7X7, from the library, is 7). When one becomes the drawing's font by your hand (the Font dropdown, **+ Load**, **Use this font**, or opening an `.ans` or XBin in it), it's drawn at its own width and a toast asks: "CM-7X7 is 7 pixels wide." with **Draw it 7 wide** and **Keep it 8 wide**. Your browser's copy of the font remembers the answer, so the font asks only once; a font not yet in **Favorites** is added there to keep it. **Keep it 8 wide** redraws the cells 8 pixels wide as one undo step, moving nothing, and sets the SAUCE tab's Letter spacing to 8px, except in a drawing whose Letter spacing is 9px (a file that opened at 9px, say): that one keeps 9px and is drawn 9 wide; undoing it takes the answer back, so the font asks again. Closing the toast without answering keeps the font at its own width and remembers nothing, so it asks the next time you choose it. A font with no lower half block asks nothing yet: the toast says to set up its blocks instead ([The Font's Blocks](#the-fonts-blocks)), the font stays at its own width, and it asks the next time you choose it once its blocks are set up. If your browser can't keep the font (its storage is full or blocked), the answer still sets the drawing's width, and a toast says it wasn't kept. A project or a restored drawing keeps the width it was saved with and asks nothing, and in someone else's room the host's width is used, unasked.
- **The Display width switch**: A bitmap font's details on the Fonts page have a **Display width** switch, on the line with **Use this font** and **Favorite**: the font's own width (when it's 4 to 7), **8** and **9**. On the drawing's font it redraws the cells at that width as one undo step, moving nothing, and sets the SAUCE tab's Letter spacing to match for 8 and 9 (undo takes both back). A narrow drawing's font that isn't in **Favorites** (one an XBin brought, say) is added there first, so the press is its remembered answer, as the question's is, and the question, if it's still showing, closes. Its size beside the name reads the width (7×7). Under 8, a warning beside the switch says only Phosphor supports that width and it will be exported as 8. On a font that's only in Favorites it offers its own width and 8, and pressing one is that font's remembered answer, so the next drawing it's chosen for draws that way; the drawing isn't touched. In someone else's room the switch is off.
- **9 pixels wide**: At 9, the ninth column repeats the eighth for the line and block characters (slots 192 to 223, the font's solid and half blocks █ ▀ ▄ ▌ ▐ wherever it keeps them, and the font's own line styles) so they still join, and is blank for every other character, the shades ░ ▒ ▓ among them, as on a VGA display. Other editors show a font at 8 or 9 by the file's Letter spacing flag; Phosphor writes it from the switch, and a file's flag sets the width it opens at.
- **The converter measures in it**: Best match and By shape compare each cell with the font's characters as they're drawn (at its own width, 8 or 9), so a photo converts into the shapes your font has.
- **The status bar shows the code**: In the ANSI view, after **Char** and its character, the status bar gives the character's code in decimal: its slot in the drawing's font, or its classic (CP437) byte when there's no bitmap font. A character with no code shows none. On a narrow bar the code gives way, with the FG and BG hex codes, before anything else does.
- **In a shared room**: Artists drawing with the host draw in the font, and watchers see the drawing in it, as does the room's picture in the lobby. Only the host can change the font ([Fonts in Shared Rooms](#fonts-in-shared-rooms)).

### The Font's Blocks

Paint, and the half-block and shade characters (`▄ ▀ █ ▌ ▐ ░ ▒ ▓`), need eight shapes from the font: Full, Lower, Upper, Left, Right, Light, Medium and Dark. A bitmap font can keep them in any of its 256 slots, so Phosphor finds them from the font's pixels when the font loads. Each solid block is judged by how much of each quarter of its glyph is lit, and CP437's own slot wins when its glyph fits. A shade is taken from CP437's slot only when that glyph looks like a shade; otherwise it's **none** until you set it.

On the Fonts page, a bitmap font's row has a **Blocks** row above its 256 slots (the character map): eight tiles sharing the row's width, each showing the slot that draws that block, or "none". A block the font is missing has its tile outlined in red. A note under the row says how to set one: "Pick a block, then click a character below, or drag one onto any block.", and while a block is picked, "Assigning to Lower — click a character below, or drag one onto any block." The sheet has a dashed outline then, the place to click. In someone else's room there's no note.

- **Change one**: Pick a tile, then click a slot in the sheet, or drag a slot from the sheet onto a tile (nothing stays picked after a drag). A slot can play several blocks: clicking a slot another block already has gives it to the picked block too, and both are drawn from it, so a font with a single shade can have Light, Medium and Dark all use it. Hover a shared slot and it names every block drawn from it. An XBin keeps only the slot, so reopened, a shared slot's characters all come back as one of them (the block whose CP437 home the slot is, else the first in the row): they look the same. **Find blocks again** is then in the **…** menu. On the drawing's own font each change is one undo step, and undo puts the drawing's blocks back, in this browser's copy of the font too when it's kept here, so an XBin in that font opened later gets the blocks the drawing shows. Its lines and sets undo the same way. A font that's only in this browser has no undo.
- **Find blocks again** (in the **…** menu): Forgets the slots you set and finds the blocks from the font's pixels again.
- **They're kept**: With the drawing, and with this browser's copy of the font. An XBin can't hold them, so opening one uses the blocks kept with your browser's copy of its font when that font is loaded here, and finds them again when it isn't.
- **Cells keep their characters**: A cell holds `▄`, not a slot, so after you change a block, paint drawn before draws in the new slot, and a block character you typed looks as the new slot does.
- **No lower half**: Paint is drawn in the lower half, so a drawing whose font has none can't hold paint. Pencil, Brush, Paint Bucket, Shapes, Gradient, and Retouch's Blur, Dodge and Burn are off, and say why in their tooltip. The Eraser, Text and Flip stay on. A picture still converts, with Best match.
  - **The toast that stays**: Whenever a drawing is open and its font has no lower half (you choose that font, open a drawing or an XBin in it, reload, or bring a drawing back), a toast says so: "This drawing's font, *name*, has no lower half block, so it can't be painted in yet." It has a **Set up its blocks** button and no timer. It closes when you click it or its button, or by itself once the font has a lower half, the drawing's font changes to one that has one, or the drawing closes (the start screen and SOCIAL show none, though the font stays as the next drawing's). Setting another block, finding them again, or undoing one doesn't bring it back once you've closed it.
  - **It comes back**: A click, or a tap on a phone or tablet, on one of those paint tools while it's off shows the toast again, button and all, as does a stroke started some other way (a key). A tap on any other button that's off, and whose tooltip says why, shows that reason; a swipe doesn't.
  - **Set up its blocks**: Opens the Fonts page on the drawing's font with **Lower** picked (or the first block it's missing), so one click on a slot in the sheet gives it one.
  - **Fixed**: Once Lower has a slot, the toast closes and a short one says "Lower half set to slot *n*. The paint tools are on." Undo takes the lower half away again, and the toast that stays comes back.
- **Other missing blocks**: A font loaded with **+ Load**, or opened with an XBin, that has its lower half but lacks other blocks says which, for a while: "This font has no Light, Medium, or Dark block, so those characters draw blank.", with the same **Set up its blocks** button. (A font with no lower half shows only the toast that stays.)
- **In a room**: Blocks can't change in a room. The toasts about the drawing's font have no button there, and add "Its blocks can't change in a room; set them once the room ends." A toast already up when a room starts loses its button, and gets it back when the room ends. A room can only start with all eight blocks set up, and in one you can only switch to a font that is ([Fonts in Shared Rooms](#fonts-in-shared-rooms)).

### The Font's Lines

Box-drawing lines are drawn from a font's own pieces. A bitmap font can carry line styles of its own, for a font whose lines aren't where CP437 puts them or that draws a second kind (a heavy one, say). A style is eleven pieces: ─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼. On the Fonts page, a bitmap font's row has **Lines** beside **Blocks** and **Sets**.

- **Make one**: **+ New line style** adds a style of eleven tiles, in equal columns across its card. Pick a tile, then click the slot in the sheet that draws it; the next piece that isn't set gets picked, so clicking eleven slots in order fills the style. Or drag a slot from the sheet onto a tile: it sets that piece, and what's picked stays as it was. The trash can beside the style's name deletes it. A style has a name you can change (left empty, it goes back to the one it was given, "Line 1" say), and until every piece is set it says so: "All line segments are required to draw with it. Pick a segment, then click a character below, or drag one onto any segment." Once all eleven are set it says nothing. Any slot can be a piece, a slot one of the font's blocks is drawn from too (the piece draws that block's character), except a slot another piece of the same style already has: that's refused, dragged or clicked, a note under the styles names that piece, and your tile stays picked. Two styles can share a slot.
- **Under Draw with**: Once all eleven pieces are set, the style is offered after **Double line**, set apart from it by a rule, in the Pencil's and Shapes' **Draw with** ([Draw With](layers.md#draw-with)), under the name you gave it. Until then it isn't offered.
- **It joins itself**: A style joins its own corners and tees. Where a line crosses a line of another style, the new line wins and the cell becomes its piece: styles don't join each other. **Single line** and **Double line** still join each other when both are offered.
- **Connect and Flip stay in a style**: **Connect** joins only the lines of the style being drawn, and flipping a selection turns a style's pieces into the same style's.
- **Single and Double**: Either one is offered only while every slot of its pieces still draws that piece; one whose slot a block is drawn from (Full set to slot 196, say) isn't, and says nothing about it. A font that doesn't draw one of them properly can **Hide** it, and **Show** brings it back. It leaves **Draw with** for that font only, and its characters in a selection or a file are left alone when you flip. A **Draw with** set to a style that isn't offered (hidden, deleted, or not in this font) draws, and shows, the first style that is; with none offered, the Pencil draws **Colors only** and Shapes **Half-block**.
- **Ellipses**: An ellipse set to any line style draws half-blocks, as it does for Single and Double.
- **They're kept**: With the drawing (saved, autosaved, and one undo step on the drawing's font) and with this browser's copy of the font, and they go to the artists drawing in a room. A font that's only in this browser has no undo, so deleting one of its styles shows "Deleted *name*." with an **Undo** button that puts the style back where it was; deleting a set does the same.
- **In a room**: Lines can't change in a room. Artists drawing with the host get the font's lines with its blocks, and draw in them; watchers see the drawing in the font ([Fonts in Shared Rooms](#fonts-in-shared-rooms)).

### The Font's Sets

A bitmap font can carry character sets of its own, for the characters it draws well. On the Fonts page, **Sets** has **+ New set**; a set has a name you can change (left empty, it goes back to the one it was given, "Set 1" say), its characters, and a trash can that deletes it.

- **Build one**: Click into the set's characters, then click slots on the sheet to add them in order. A slot can go in twice, and repeats are kept: a character in a set twice is picked twice as often by **Random**. Or type into the field: it takes the characters the font has, and leaves the others out. **Backspace** takes the last one off. What you type and take off in one visit to the field is one undo step, taken when you leave it.
- **Empty sets**: A set with no characters is kept, so you can fill it later, but isn't offered.
- **Under Characters**: The **Characters** field's menu lists the font's sets first, under the font's name, then the stock sets under **Stock**. Picking one puts its characters in the field. **Show stock sets for this font (e.g. “Blocks & shades”)** on the Fonts page is one switch for the font: off, the stock sets leave the menu. A font with no sets of its own shows the stock ones whatever it says.
- **They're kept**: Like lines, with the drawing and with this browser's copy of the font, and go to the artists drawing in a room.
- **In a room**: Sets can't change in a room. Artists drawing with the host get the font's sets, and watchers see the drawing in the font.

### What the Font Changes

The font changes how the art looks in Phosphor. It also changes how the characters you draw look in the PIXEL tab, and in the image when you merge them into it: each cell blends its colors by how much of it the character covers, measured in the font you see.

Those fonts (TrueType and the built-in ones) don't change how an image converts, or what's saved or exported; a terminal or viewer draws the file in its own font. Their font and size are kept in this browser, not in the project. A bitmap font is different: it's saved in the project and written into an XBin export, the converter measures in it, and its cell's shape is the grid's ([Bitmap Fonts](#bitmap-fonts)).

### Palettes That Belong to a Font

In a drawing with a bitmap font, a palette you make (or a built-in one you copy by editing it) belongs to that font. With a TrueType or built-in font in use, a palette you make is for any font until you tie it to that font with **Tie to <font>** in the editor's head. The Palettes page lists, in this order:

- **For <font>**: the palettes tied to the font in use, shown first while it's in use (for a TrueType or built-in font, once one is tied to it).
- **Built-in**.
- **Yours**, whose **…** menu has **New palette**, **Import** and **Export**.
- **For fonts not loaded**, folded at first ([For Fonts Not Loaded](#for-fonts-not-loaded)).

Each group's title counts the palettes in it that match the filter ("Built-in · 9"), and the filter's **×** clears it. Each group folds on its title, as the Fonts page's do, and the folds are remembered in this browser. A fold only tidies the list: the strip's previous and next palette buttons still go through a folded group's palettes.

Palettes tied to a font are hidden while another font is in use, and the one you had chosen comes back with its font (including when you undo **Use this font**). The editor's head says **For <font>** or **Any font**, each a menu; its menu has **Use with any font** or **Tie to <font>**. **Duplicate**, **Export** and, for your own palettes, **Delete** are in its **…** menu. In a font drawing the source tabs are the font's own (**All 256**), **In this drawing** and **Recent**; there's no Unicode tab. The sources are drawn as the Fonts page draws a font's slots, 16 to a row, a bitmap font under 12 pixels tall at twice its size; a click puts a character in the aimed slot, and pressing and holding one shows it large over the sheet without picking it (a press elsewhere, **Escape** or a scroll puts it away). Hovering one reads it under them: its code, its CP437 byte or UTF-8 only, the slot it's already on, or why it can't be used: it does not fit in one cell (an unassigned code point, say), or, in a font drawing, its slot's own character is a block drawn from another slot ("█ is drawn from slot 220, so this slot has no character of its own"). Those still read on hover, but a click or drag puts nothing in the palette. A character the font lacks can stay in a palette tied to it, marked as not fitting.

### For Fonts Not Loaded

Palettes tied to a font that isn't loaded in this browser (because you removed it, or they came in from a file) wait in a group folded at first, **For fonts not loaded**. Load that font and they show under its name.

### Palette Files

In the editor, **Export** writes one palette; under **Yours**, **Export** writes all your palettes, each keeping its font (it's off while you have none); and **Export palettes** on the Fonts page writes every palette tied to that font. Each is a `<name>.palettes.json` file, which keeps each palette's name, its empty slots and the font it's tied to. **Import** adds the palettes in such a file, under their own names (a name you already have gets " (custom)"). Where each goes depends on its font:

- A palette for any font goes under **Yours**.
- One for the font in use goes under **For <font>**.
- One for a font kept in this browser but not in use waits for that font, and Phosphor says "Added N palettes for <font>. Use that font to see them."
- One for a font that isn't loaded goes under **For fonts not loaded**, and Phosphor says "Added N palettes for <font>. Load that font to see them."

A character one cell can't hold (a word, a control character) comes in as an empty slot. A file that isn't a palette file is refused and nothing you keep changes.

### Fonts in Shared Rooms

While you draw in someone's room, the art is drawn in the host's font and size, and follows them when they change it. The Font field shows the host's font, turned off, and yours comes back when you stop. A TrueType font the host loaded from their computer can't be sent, so the room sees IBM VGA instead. A room needs a font that's set up, with a slot for each of the eight blocks, since a room can't change them: **Go live** is off while the drawing's font has one missing, with a button to set it up, and in a room you can't switch to a font that isn't (it's grayed out in the Font field, and **Use this font** is off, each saying what's missing). Opening an XBin or a project file whose font isn't set up is refused the same way. Set up its blocks first, outside the room. A bitmap font reaches everyone in the room. The people drawing with the host draw in it, with its blocks, lines and sets, none of which they can change. Watchers see the drawing in it too, as does the room's picture in the lobby.

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
- **Lines and columns**: As in Moebius, **Alt+↑** (**Option+↑** on a Mac) inserts a line at the cursor, pushing the lines below it down, and **Alt+↓** deletes the cursor's line, pulling the ones below up; **Alt+→** inserts a column at the cursor, pushing the rest of every row right, and **Alt+←** deletes the cursor's column. They move only the layer you're typing on (the base too), everything on it with its paint, and the canvas keeps its size: what's pushed past the bottom or right edge goes, and undo brings it back. Each press is one undo step, and the cursor stays where it is. What Insert typing pushed past a row's end (below) is forgotten once a line or column moves.
- **Colors and character palettes while you type**: **Ctrl+↑** and **Ctrl+↓** step the foreground color through the palette, **Ctrl+←** and **Ctrl+→** the background (on a Mac, which keeps Ctrl+arrows for Spaces, **Ctrl+Option+arrows**); **Ctrl+,** and **Ctrl+.** go to the previous and next character palette, as the strip's arrows do ([Color Keys](layers.md#color-keys)).
- **A cell's colors while you type**: **Alt+U** takes the colors of the cell under the cursor into the color pair, as the Eyedropper would, and **Shift+Alt+U** its character too, to draw with ([Color Keys](layers.md#color-keys)). For now they work while you type on Windows and Linux only: on a Mac, Option+U starts an umlaut (ü) and Shift+Option+U types ¨, so there the command list (**Cmd+K**) has them. **Alt+X** (**Option+X**, which then doesn't type ≈) swaps the cursor cell's two colors, as **Swap cell FG/BG** does, in the ANSI art style; it's one undo step.
- **Layers while you type**: **Alt+]** and **Alt+[** (**Option+]** and **Option+[** on a Mac, which then don't type ‘ and “) select the drawing layer or base above or below, passing vector layers, so you go on typing at the same cursor on the layer selected ([The Layers List](layers.md#the-layers-list)). **Shift+Alt+N** and **Shift+Alt+V** type, as Alt+letters do; press **Escape** first to add a layer.
- **Past the row's end**: What Insert or Partial pushes off the right edge of the canvas isn't lost. Whatever pulls the row left again (**Backspace** in Insert or Partial, or **Delete**) brings it back in, in order, gaps and all, also after you've paused or typed on another row. Insert brings back each cell as it was, its paint too; Partial, and Delete in Overwrite, bring back the characters alone. It works on the base as on a layer. Undo and redo keep it in step. It's remembered while the drawing is open at that width, per layer, row and frame, until the layer is cleared or merged; it isn't saved with the project or sent to a room, and widening the canvas doesn't show it.
- **Settings while you type**: Change a setting with the mouse (the **Font**, a slider, a checkbox) and you're still typing: the next key goes to the canvas. A field you type in (a size, the **Characters** set) keeps the keyboard until **Escape**, which puts its value back and returns you to typing, the cursor where you left it. A menu or slider you reached with **Tab** keeps the keyboard for its arrow keys, until **Escape** too.
- **Pasting text**: Pasted text types from the cursor. Each new line starts on the next row, at the column where the paste began. Once a row is full, the rest of that line is dropped, and lines past the last row are dropped too. Characters a cell can't hold (tabs, invisible characters, an accent on its own) are skipped. A paste is one undo step.
- **What Cmd/Ctrl+V pastes**: Whatever you copied last: a Select-tool block copied in Phosphor (in this tab or another), a block copied in Moebius, or text copied anywhere else, such as PabloDraw, which gives other apps only its characters ([Layers](layers.md#the-select-tool)).

---

## Saving and Exporting

- **Save project** (**Cmd/Ctrl+S**) saves a `.pho` file: a PNG picture of your drawing with the project inside it, the picture, every layer, animation frames, vector shapes, and the settings, SAUCE included. A bitmap font is part of it. The display font and the rulers' guides aren't; they stay in your browser. Any image viewer shows the picture, and Phosphor opens the file as the project ([The .pho file](pho.md)). Older `.phosphor` files still open, but older copies of Phosphor can't open a `.pho`.
- **Export…** (**Cmd/Ctrl+E**) opens the Export dialog, which lists the **Still** formats (`.ans`, `.utf8ans`, `.xb`, `.png`) and, once Animate is on with more than one frame, the **Animated** ones ([Animation](animation.md)).
- **Share** (PNG, GIF and video, where the browser has a share sheet that takes the file: phones, Safari, and Chrome and Edge on most computers): Sends the file to your system's share sheet instead of downloading it, to post it, message it, or put it in your photos. A long GIF or video can take longer to write than the browser allows after a tap; it waits, and **Share now** opens the sheet with your next tap.
- **Saving over the file** (Chrome, Edge and other Chromium browsers): Save writes a project straight back to its file. A `.pho` file opened with Choose a file, Cmd/Ctrl+O, dropped on the page or opened from your computer (below) saves back over itself. A drawing that has never been saved, an older `.phosphor` file (which is never written over or deleted), a project renamed to `.png` and **Save As** (**Shift+Cmd/Ctrl+S**) ask where with the browser's own save box, with `name.pho` suggested (in the folder of the file it came from, when it has one), and Save writes over that file after. Before Phosphor first writes over a file you opened, and again after a reload, the browser asks whether it may. The file stays the drawing's after a reload; a duplicated tab's copy has none until it's saved. A save is written whole: if it fails, the file is left as it was. Exports are still downloads, or go to the share sheet. In Safari and Firefox every save is a download, named in the save dialog, as below.
- **Opening files from your computer** (Phosphor installed from Chrome or Edge on a computer, with **Install** in the address bar or the browser's menu): Phosphor is offered under **Open With** for `.pho` and `.phosphor` projects, ANSI and text art (`.ans`, `.utf8ans`, `.xb`, `.bin`, `.asc`, `.nfo`, `.diz`, `.txt`), SVGs and pictures. The browser asks the first time whether Phosphor may open them. Each file opens in a window of its own, the way a file chosen on the start screen opens, and a `.pho` saves back over its file. The [desktop app](desktop.md) does the same without a browser.
- **File names**: Both dialogs offer the document's name with the date and time (`art-20261030-131405`), so each save is a new file; type over it for any other name. The name you give becomes the document's name, so the next save starts from it, with a new time. Every browser saves the file as a download with that name, Safari included.

### Saving .utf8ans and .ans

- **`.utf8ans`**: Modern Unicode ANSI. Keeps every character. A two-column character is written once and the terminal moves two columns for it, so the rows line up.
- **`.ans`**: Classic DOS CP437, which can't hold most Unicode characters. Each character it lacks is written as its closest lookalike, or `?`. Before you export, the Export dialog lists every one, what it becomes, and how many cells use it. A two-column character becomes its stand-in plus a space, so the grid still lines up.
- **Colors** are written as the **Color palette** says: CGA as the 16 classic colors, VGA as 256-color codes (`38;5`), and everything else as 24-bit codes (`38;2`). A file you opened keeps the palette it came with ([Opening a file](layers.md#opening-ansi-and-text-files)), so it comes out in the same kind of codes.

### Saving .xb

- **`.xb`**: XBin, the format 16colo.rs shows with the art's own font and 16 colors inside the file. The export holds your cells, the drawing's bitmap font (IBM VGA 8×16 when it has none) and the palette.
- **Cells with one color**: A cell whose foreground and background are the same palette color is written as a space, as in an `.ans`, so no hidden character rides along.
- **Needs 16 colors or fewer**: XBin is offered when the **Color palette** is CGA, **Limited count** of 16 or fewer, or a **Custom** list of up to 16 colors. With any other palette the **Export** button is off and the dialog says what to pick.
- **SAUCE** is optional, as it is for `.ans`: **Include SAUCE** is the Export dialog's checkbox. An XBin's record names no font (the font is in the file), whatever **Font name** holds.
- **Opening** an `.xb` gives the drawing its cells, font and palette ([Opening ANSI and text files](layers.md#opening-ansi-and-text-files)). The font is listed under **This drawing** by the file's name, without the `.xb`.

#### Fixed Black and White (VGA)

In 256 colors, 16 and 231 are a terminal's fixed black and white, while 0 and 15 follow the terminal's theme. Phosphor shows them alike but keeps their codes apart:

- An opened file's 16 and 231 stay 16 and 231, opened with **Edit artwork** or **Draw on top**, and when they're moved, copied (into another tab too), rotated, merged down (onto the base too), merged into the image where a cell merges exactly (a wide character, one in the bars around the picture, a frozen one; a letter blended in is picked again), flattened, undone, or saved in a project.
- The color picker's VGA swatches include 16 and 231 as swatches of their own, and the Eyedropper picks them as they are. The recent colors keep them too: 16's black and 0's are two recent colors. What you type, fill, draw with Shapes, or set with **Set FG** and **Set BG** in them comes out as 16 or 231, and the color steps (**Ctrl+↑** and **Ctrl+↓**, **Ctrl+Option+↑** and **↓** on a Mac) step through them in order.
- The Brush paints pixels, so its black and white are always 0 and 15, and so is a 16 or 231 cell painted over.

### SAUCE Metadata

Exported `.ans` and `.utf8ans` files, animated ones too, end with a SAUCE metadata record, which holds what's on the **SAUCE** tab: title, author, group, date, comments, font name, and letter spacing.

- **Include SAUCE**: The Export dialog's checkbox for the ANSI formats, checked each time the dialog opens. Unchecked, the file ends with the art: no record, no comments, and no end-of-file byte before them. The dialog then says what other viewers lose without it: the title, author, width, and font, and some show bright backgrounds blinking. Phosphor opens such a file with an empty SAUCE tab ([Opening a file](layers.md#opening-ansi-and-text-files)).

- **Letter spacing is the width**: With a bitmap font, 8px and 9px on the SAUCE tab are the Fonts page's 8 and 9 (setting either sets both, as one undo step, and a narrow drawing becomes 8 or 9 wide); with a narrow drawing neither is lit. A narrow drawing exports Letter spacing 8px. An opened `.ans`'s Letter spacing replaces the drawing's, so one saying 9px opens 9 wide and one saying 8px opens 8 wide. Not set writes 00 and draws at 8, the same kind of undo step (a narrow drawing becomes 8 wide).
- **A new drawing** starts with an empty SAUCE tab: a picture, an SVG, or a blank canvas keeps nothing from the drawing before it (no title, author, group, date, or comments, the font name back to IBM VGA, and letter spacing to 8px).
- **A converted image or a blank canvas** gets Phosphor's own comment lines first (Created with Phosphor, and the settings it was converted with), then a blank line and yours. An empty date is the day you export, the font name is IBM VGA, and the letter spacing is 8px.
- **A library font's name**: a library font that has a SAUCE name (Amiga Topaz 1+, say) sets **Font name** when you use it from the Fonts page, in the same undo step as the font, so an export names the font it was drawn in. Favoriting it changes nothing, and using it later from Favorites on the Fonts page sets the name too. An `.ans` or `.bin` whose SAUCE names such a font opens in it (the font is fetched, kept in Favorites, and opening it is no step to undo); IBM VGA and names the library doesn't know open as before, and if the font can't be fetched the file opens in the font in use, with a note saying so.
- **A file you opened** gets none of them: its record comes out as it went in, with its date, flags (iCE colors, letter spacing), font name, size, and comments changed only where you changed them on the SAUCE tab. An empty date or font name stays empty, and its field says so. Letter spacing changes only its own bits of the flags. A resize changes the size it gives.
- **Widths**: Title holds 35 characters; Author, Group, and Font name hold 20 each. They're counted as the record counts them (one per character, an emoji too), with a count beside each field. A field stops at its width, and when a paste or a key goes past the end, a line under it says how many characters fit, until the field next changes.
- **Date** is YYYYMMDD and takes digits. A date that isn't a real day gets a note under the field, and is written as typed.
- **Comments** are lines of up to 64 characters: a longer line breaks at a space, and only a word longer than 64 characters is split. The record holds at most 255 lines. Under Comments, the SAUCE tab counts the lines the record would take ("128 of 255 SAUCE lines"), saying how many are Phosphor's own, and past 255 says from which line comments won't be in the file; the Export dialog says it again before you export. The field keeps everything you paste, so trimming is up to you.
- **Font name and Letter spacing** (Not set, 8px, or 9px) tell other viewers how to show the file. Phosphor's view keeps your display font, except that with a bitmap font Letter spacing is the width it's drawn at (above).
- **CP437**: The record is CP437 in `.ans` and `.utf8ans` alike. A character it lacks is written as its lookalike, or `?`, and the Export dialog lists those too, for every ANSI format, with the fields each is in. Only what reaches the record is listed.
- **Control characters** (tab, ESC, and the like), which a terminal printing the file would act on, can't be in SAUCE. Typed or pasted, they're left out and the line under the field says so, and an export leaves out any that a project or an opened file still has. A comment's line breaks stay, since they make its lines.

### Exporting .png

A `.png` is a picture of the art as the ANSI view draws it, in your display font, at one pixel per font pixel: the frame that's showing, with or without Animate.

- **With Smooth text off** (the status bar's **Smooth**), every pixel is one of the art's colors and the file is small.
- **With Smooth text on**, the Export dialog offers a **Text rendering** choice: **Smooth** (picked first) keeps the anti-aliased edges, which add colors and make the file a few times bigger, and **Hard-edged** draws the text crisp, as with Smooth text off. The choice doesn't change the Smooth setting, and isn't remembered.

### Automatic Browser Backups

Phosphor keeps your work in your browser as you go:

- **Reloading** brings it back, with an empty undo history, and a new tab offers your recent work to pick up.
- **Pick up where you left off**: The start screen lists your last five drawings, newest first, in the middle of the canvas under **Choose a file** and **Start with a blank canvas** (which shrink to a band over the list while there is one, the list's width: each half of it side by side, or one over the other where the canvas is too narrow for that). Each row is two lines: its name with the extension of the file it came from or last went to (`.pho`, `.ans`), and under it when you last changed it (with the seconds when two of the same name share a minute) and whether it's **Unchanged** since it opened, **Changed**, or **Saved** to a file since its last change (in a canvas too narrow for the two side by side, that goes under the time). A drawing saved as a project keeps its project's name through exports, so it doesn't read as an export you opened. Click anywhere on a row to pick it up (**Resume**). A name too long for its line ends in "…", and hovering the row shows it whole. A drawing open in another tab is dimmed and reads **In another tab**. Each file you open is a drawing of its own there, so a file opened twice is listed twice.
- **Versions** lists snapshots taken at most every 5 minutes while you work (the last 20). Restoring one keeps what you had in the list, as "Before restore" if it isn't there already.
- **As opened**: A file you open (a picture, a `.pho` or `.phosphor` project, an ANSI or text file, or an SVG) is kept as "As opened" once you first change it, even after a reload. It stays among the 20 however many versions come after, so Versions can always take it back to how it opened.
- **Unsaved changes**: New project, or a project file or picture opening in place of a drawing with unsaved changes, asks first: **Save project first** (the save dialog, then it goes on; canceling the save stays), **Start without saving** or **Open without saving** (the drawing stays in this browser, under Pick up where you left off), or **Cancel**. An export isn't a save, so it still asks after one. A file whose own question offers to open it in the drawing's place (an art file, an SVG, a picture) says so on those choices instead of asking twice. A drawing picked up from Pick up where you left off still says **Changed** there if it was, but asks nothing until you change it again: leaving it loses nothing new.
- **Leaving the page**: Once the art has been saved to a file or opened from one, leaving the page no longer asks, unless the latest edits haven't been written yet. A room you host always asks.

Saving a file to your computer is the real backup. Clearing site data deletes what's kept in the browser, Safari can also delete it after seven days of browser use without a visit, and a private window's kept work is gone when the window closes.

Opening a file, picking up where you left off, the art of a room you draw in arriving, saving and exporting say what they're doing at the bottom of the screen ("Opening long.ans…", "Saving night.pho…") when they take more than half a second, and the note goes when they're done. So do the edits that can take that long on a large drawing: a Paint Bucket or Gradient fill ("Filling…"), Merge down and Into the image ("Merging…"), Delete, Cut and Paste of a selection ("Deleting…", "Pasting…"), and a new character set or font ("Working out the characters…"). While the note is up, a press on the art starts nothing, so a second click doesn't fill twice.

---

## When Art Looks Wrong in Someone's Terminal

- **Ambiguous width**: Some characters, including the block elements, are "ambiguous width" in Unicode. Most terminals show them one column wide, and so does Phosphor. A terminal set to show ambiguous characters as wide (an option in many terminals, and sometimes the default for Chinese, Japanese, or Korean setups) draws them two columns wide, and block art falls apart there. That's the viewer's setting, not the file.
- **Newer emoji**: Terminals also differ on some newer emoji. Phosphor follows current Unicode, as recent terminals do.
