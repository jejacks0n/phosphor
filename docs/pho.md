# The .pho file

A `.pho` file is what Phosphor's **Save project** writes. It is a PNG: any image viewer, browser or file manager shows it as a picture of the drawing, and Phosphor opens it as the whole project, with every layer, frame and setting. This page is for anyone who wants to read one: a site that lists drawings, a tool that makes thumbnails. Saving and opening in Phosphor are in [Characters](characters.md#saving-and-exporting) and [the desktop app](desktop.md#opening-and-saving).

## What's in the file

- **The file is a valid PNG**, with the name ending in `.pho`. Its type is `image/x-phosphor`. A `.pho` renamed to `.png` is still the same file, and Phosphor opens a `.png` that holds its chunk as the project. Saving one opened that way asks for a `.pho`, as an older `.phosphor` does (below).
- **The project is in a private chunk near the start.** Its data is a gzipped Phosphor project. In the plain form it's a chunk named `phPr`, right after `IHDR`; in the form a terminal shows (below) it's `phPc`, right after a chunk named `phCs`, with the bytes a terminal reacts to escaped. The project's own layout belongs to Phosphor and may change, so a reader shouldn't depend on its insides: show the PNG's image, and leave the chunks alone. A PNG reader that doesn't know them skips them, as PNG says it may (their names mark them private and safe to copy).
- **The image is the drawing**: every cell, at full size, hard-edged, as **Export › PNG** draws it with **Hard-edged** picked, whatever the Smooth setting is. It is one pixel per font pixel, at the width the font is really drawn at (a bitmap font's own width, not a stretched one). It shows the frame Phosphor was showing when you saved. With no bitmap font, the characters are drawn in the display font picked, as Export › PNG draws them. Saved from inside an art layer, the image is the whole drawing with that layer's contents as they are.
- **The image is capped at 32,000,000 pixels.** Past that, the picture keeps the top lines that fit, so a very tall drawing's picture ends partway down. The project inside is whole.

## What else opens, and what doesn't

- **`.phosphor`**: Phosphor's older project file (the project alone, with no picture) still opens. Saving it writes a new `.pho`, and the old file is never written over or deleted.
- **Older copies of Phosphor** can't open a `.pho`.
- A `.pho` with no project chunk, or a broken one, isn't a project, and Phosphor says so.
- **Copies of Phosphor from before the terminal form** can't open a `.pho` saved in it; they say it isn't a project. Every copy since opens both forms.

Autosave, Versions and rooms keep the project on its own, with no picture.

## In a terminal

Printed in a terminal (`cat drawing.pho`), a `.pho` shows its drawing, in color, under the command, and nothing else: the
terminal is left as it was, the lines above stay, and the prompt comes back after the art. That's checked in Ghostty
and macOS Terminal; a terminal that reads escape sequences its own way may show some of the PNG. It's the drawing as
an `.utf8ans` export writes it, with no SAUCE record, so it looks as that export does in the same terminal: a drawing
wider than the terminal wraps.

A terminal shows every byte of a file, the PNG's own and the project's, so Save lays the file out for it:

- `phCs`, the first chunk, erases what the terminal printed of the PNG's first bytes and switches to the alternate screen.
- The project (`phPc`) and the picture come next, printed on the alternate screen, where none of it reaches the
  scrollback. The project's bytes a terminal acts on are escaped. When the picture's compressed bytes hold any of the
  sequences that would reach past that screen (a reset, a question the terminal would answer by typing into the
  prompt, printing), Phosphor compresses it again itself, a row at a time, trying the rows that spell one with other
  PNG row filters (the same picture) until none does. That picture's data is bigger, about a third on a big drawing.
- `phCa`, the last chunk before `IEND`, goes back to the screen, puts back the modes the picture's bytes may have set,
  draws the art, and opens a sequence that hides the rest of the file.
- **Two bytes follow `IEND`**, `ESC \`, to close that sequence. PNG readers leave bytes after `IEND` alone; a strict
  checker (`pngcheck`, say) mentions them.

Some terminals ring the bell a few times while it prints: a picture's bytes hold bell characters, which can't be escaped.

When the file can't be laid out so, Save writes the plain form, `phPr` right after `IHDR`, and printing that shows the
PNG's bytes as any binary file's: a palette whose colors spell one of those sequences, say, which no filter changes.

