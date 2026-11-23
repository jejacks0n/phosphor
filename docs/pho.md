# The .pho file

A `.pho` file is what Phosphor's **Save project** writes. It is a PNG: any image viewer, browser or file manager shows it as a picture of the drawing, and Phosphor opens it as the whole project, with every layer, frame and setting. This page is for anyone who wants to read one: a site that lists drawings, a tool that makes thumbnails. Saving and opening in Phosphor are in [Characters](characters.md#saving-and-exporting) and [the desktop app](desktop.md#opening-and-saving).

## What's in the file

- **The file is a valid PNG**, with the name ending in `.pho`. Its type is `image/x-phosphor`. A `.pho` renamed to `.png` is still the same file, and Phosphor opens a `.png` that holds its chunk as the project. Saving one opened that way asks for a `.pho`, as an older `.phosphor` does (below).
- **The project is in a private chunk named `phPr`**, placed right after `IHDR`. Its data is a gzipped Phosphor project. The project's own layout belongs to Phosphor and may change, so a reader shouldn't depend on its insides: show the PNG's image, and leave the chunk alone. A PNG reader that doesn't know `phPr` skips it, as PNG says it may (the chunk's name marks it private and safe to copy).
- **The image is the drawing**: every cell, at full size, hard-edged, as **Export › PNG** draws it with smooth text off. It is one pixel per font pixel, at the width the font is really drawn at (a bitmap font's own width, not a stretched one). It shows the frame Phosphor was showing when you saved. With no bitmap font, the characters are drawn in the display font picked, as Export › PNG draws them. Saved from inside an art layer, the image is the whole drawing with that layer's contents as they are.
- **The image is capped at 32,000,000 pixels.** Past that, the picture keeps the top lines that fit, so a very tall drawing's picture ends partway down. The project inside is whole.

## What else opens, and what doesn't

- **`.phosphor`**: Phosphor's older project file (the project alone, with no picture) still opens. Saving it writes a new `.pho`, and the old file is never written over or deleted.
- **Older copies of Phosphor** can't open a `.pho`.
- A `.pho` with no `phPr` chunk, or a broken one, isn't a project, and Phosphor says so.

Autosave, Versions and rooms keep the project on its own, with no picture.
