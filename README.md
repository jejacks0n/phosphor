# Phosphor

Phosphor is an ANSI and ASCII art editor that runs in your browser. It turns a picture into text art, or opens art you already have, and lets you keep working on it: paint, type, draw shapes, stack layers, animate, and draw with other people. Then it exports the files that terminals, BBSes and websites take.

Try it at [next.phosphor.work](https://next.phosphor.work), where every change lands first. Releases go to [phosphor.work](https://phosphor.work), and the [desktop app](docs/desktop.md) for macOS, Windows and Linux is on the [Releases page](https://github.com/jejacks0n/phosphor/releases).

[![Phosphor's ANSI tab: Hokusai's Great Wave converted to text art, with a titled box typed on a layer over it](screenshot.png)](https://phosphor.work)

## What it does

### Turn a picture into text art

Load a picture and Phosphor converts it to a grid of character cells, in one of three art styles: ANSI, Color ASCII or Monochrome ASCII. You pick the characters it may use (presets such as Blocks & shades, Half-blocks and Quadrants, or a set you type) and how it chooses among them: at random from a seed, by brightness, by the closest match of character and colors, or by the shape of what's in each cell.

Colors can stay full 24-bit, snap to the CGA (16 colors) or VGA (256 colors) palette, be picked from the picture (a color count you choose), or come from a list of your own, with dithering (Floyd–Steinberg or ordered) to smooth gradients between a palette's colors.

Colorize, hue shift, invert, brightness, contrast, levels, saturation, posterize, threshold, blur, simplify, sharpen and edges all apply live, and every slider move is an undo step. When you like where it's going, **Bake** makes the adjusted picture your new starting point and resets the sliders, so you can do another round on top. **Flatten** turns everything the drawing shows into plain cells, to work on as ANSI.

You can also start from a blank canvas.

### Open art you already have

`.ans`, `.utf8ans`, `.xb`, `.bin`, `.asc`, `.txt`, `.nfo` and `.diz` files open looking just as the file does, and their SAUCE record fills the SAUCE tab. Phosphor asks how you'd like the art: on a layer to edit, as the base to draw on top of, or as a picture to convert again. Dropped on a drawing that's already open, a file can be added to it instead. An `.svg` opens as shapes you can go on editing. [Opening ANSI and text files](docs/layers.md#opening-ansi-and-text-files) has what opens and the limits.

### Draw and type

Two views show the same cells: **ANSI** works in characters and their two colors, and **PIXEL** paints the half-cell pixels under them. Most tools work in both: the Pencil, Brush, Eraser, Paint Bucket, Gradient, Shapes (rectangles, ellipses and lines, in blocks or in box-drawing lines that join where they meet), Blur, Dodge, Burn and the Eyedropper. Select and the Magic Wand cut, copy, paste, move, flip, rotate and recolor blocks of cells. Paste takes a block copied in another Phosphor tab or in Moebius, and plain text from anywhere else.

Typing works the way a terminal does. Chinese, Japanese and Korean characters and emoji take two columns, your system's input methods work as they do in any text field, and Overwrite, Insert and Partial modes set what typing pushes aside. F1 to F12 type from a palette of twelve characters (box drawing, blocks, shades, arrows and more), and you can switch palettes or make your own. Anything CP437 doesn't have still saves in `.utf8ans`.

### Layers

A new drawing has one layer, the base: the converted picture, which the tools draw on. Add drawing layers when you want your work kept apart from it, and vector layers for shapes, up to 64 layers in all. A layer can be hidden, renamed, moved and duplicated, and has character settings of its own. **Merge down** puts a layer into the one under it. The [layer guide](docs/layers.md) goes into the details.

### Vector shapes

[![The VECTOR tab: a sunset drawn in shapes, a ridge's points picked with the Node tool](docs/screenshots/vector.png)](docs/vector.md)

The VECTOR tab draws shapes over the art with the Pen, Node and Shape tools: fills, outlines and gradients, and shapes joined, added and subtracted. Shapes stay editable, so you can move, scale, rotate and reshape them at any time, and Phosphor converts them to characters as you work, at finer detail than paint reaches. An `.svg` file comes in as shapes. An art layer keeps a block of hand-drawn cells among the shapes, to move and animate as one. See the [vector guide](docs/vector.md).

### Fonts

[![The Fonts page: the font library's list, with one bitmap font's 256 characters](docs/screenshots/fonts.png)](docs/characters.md#the-font)

The art is drawn in one of four built-in fonts (IBM VGA, JetBrains Mono, Unscii and GNU Unifont) or in one you load: a monospaced TrueType, OpenType or WOFF font, or a bitmap font (`.F01` to `.F32`, or a PNG sheet of its 256 characters), the way old DOS art is drawn. The Fonts page also has a library of more than 2,400 bitmap fonts, from VileR's VGA text mode fonts and the Mœbius XBin fonts, for the IBM PC, its clones, the Amiga and others. A bitmap font belongs to the drawing: it's saved with the project and written into an `.xb` export, and an `.xb` you open brings its own. [The font](docs/characters.md#the-font) has the rest.

### Colors and palettes

The box under the color pair holds a picker and a **Palettes** page: the drawing's own color list to edit, a library of palettes from Lospec that comes with Phosphor, your favorites, and a field that asks Lospec for any other palette by its name or link. A color list imports and exports as a `.hex` file. A 16-color drawing has [iCE colors](docs/characters.md#ice-colors): bright backgrounds, or blink as on DOS.

### Animation

[![Animate on: eight frames, with the Keys panel showing a tween that raises the sun](docs/screenshots/animation.png)](docs/animation.md)

Turn on **Animate** and the drawing becomes a movie: a row of frames, each drawn with the same tools, played over the same base layer. A new frame can be Blank (what the frames before drew carries on, and a fix to an earlier frame carries through), a Duplicate of the one showing, or a Wipe that starts clean. The ghost shows nearby frames dimmed, to draw against. Each frame can hold for its own time, playback loops, and undo works across frames. On VECTOR, a tween moves, scales, turns and recolors a shape between its keys, with an easing of your choice, and a shape can follow a path. See the [animation guide](docs/animation.md).

### Drawing together

**SOCIAL** (in beta) has rooms. Host one and people watch you draw live and chat, or invite members to draw with you, up to seven people at once. In a room, browsers connect directly to the host's. You can make an account or stay a guest. See [Social rooms](docs/social.md).

### The desktop app

Phosphor also comes as an app for macOS, Windows and Linux, on the [Releases page](https://github.com/jejacks0n/phosphor/releases). Drawing in it works as it does in the browser. Rooms there need no account and no server: you host one on your own computer and give people its address. It opens a `.pho` file with a double-click and saves straight back to it. See [The desktop app](docs/desktop.md).

### Plugins

A plugin adds color themes, a script, or both. A script can add ways to choose characters (solvers), brushes, shapes for the Shape tool and filters for the picture. The **Marketplace** in the Plugins dialog lists them, Phosphor's own among them: Midnight and Rain (themes), Outlines (a solver), Smear (a brush), Superformula (a shape) and Aberration (a filter). A plugin's script runs only after you say Install. [Plugins](docs/plugins.md) covers installing them and writing your own.

### And the rest

- Press **?** for the keyboard shortcuts, and **Cmd+K** (Ctrl+K on Windows and Linux) for the command list, which finds any command by name.
- [Rulers and guides](docs/rulers.md) measure in columns and rows.
- Dark, light and system themes, in English and French.
- It works on a phone, where the settings and the side panel slide in from the sides.
- Your work is kept in your browser as you go. A reload brings it back, the start screen lists your last five drawings, and **Versions** keeps snapshots to go back to ([Automatic browser backups](docs/characters.md#automatic-browser-backups)).

The [guides](docs/README.md) cover all of it.

## Files

### What opens

| Kind | Types |
|---|---|
| Pictures | PNG, JPEG, GIF, WebP, BMP and AVIF |
| Projects | `.pho`, and the older `.phosphor` |
| ANSI and text art | `.ans`, `.utf8ans`, `.xb` (XBin), `.bin` (BinaryText), `.asc`, `.txt`, `.nfo` and `.diz` |
| Vector art | `.svg` |
| Fonts | `.F01` to `.F32`, a PNG sheet of 256 characters, `.ttf`, `.otf`, `.woff` and `.woff2` |
| Color palettes | `.hex` and `.txt` |
| Character palettes | `.palettes.json` |
| Plugins | a folder, a `.zip` of one, or its `phosphor-plugin.json` |

A drawing can be as large as 300 columns, 5,000 lines and 500,000 cells.

### The project file

**Save project** writes a `.pho` file, which keeps the whole project: the picture, every layer, the frames, the shapes and the settings, with SAUCE and the drawing's bitmap font. Older `.phosphor` files still open.

A `.pho` is also a real PNG, a picture of the drawing with the project inside it:

- **Previews**: Any image viewer shows it as the picture, with no Phosphor needed.
- **Thumbnails**: With the desktop app installed, your system shows the drawing as the file's thumbnail: Finder's icons and Quick Look on macOS, Explorer on Windows (the installer asks it to), and file managers on Linux (the `.deb` installs a thumbnailer).
- **In a terminal**: `cat filename.pho` prints the drawing in color, as its `.utf8ans` export would look, and leaves the terminal as it was. That's checked in Ghostty and macOS Terminal. Save lays the file out for this unless you turn off **Show the drawing when printed in a terminal** in the Save dialog.

[The .pho file](docs/pho.md) says how the file is laid out, for anyone who wants to read one.

### What it exports

| File | What it is | Colors | Characters |
|---|---|---|---|
| `.ans` | ANSI for classic viewers and BBSes | The classic 16-color codes for CGA, 256-color codes for VGA, 24-bit codes for the rest | CP437 |
| `.utf8ans` | ANSI for modern terminals | 256-color codes for CGA and VGA, 24-bit codes for the rest | UTF-8 |
| `.txt` | Plain text, with no colors or escape codes | None | UTF-8 |
| `.xb` | XBin, with the drawing's bitmap font and palette inside | 16 or fewer | The font's 256 |
| `.png` | A picture of the art in its font | All of them | Drawn in the art's font |
| `.gif` | A looping picture of a movie | 256, one palette for the whole movie | Drawn in the art's font |
| `.mp4` | A video of a movie, where your browser can encode one | All of them | Drawn in the art's font |
| Animated `.ans` | An ANSiMation, which draws itself frame by frame in a viewer or terminal | As `.ans` | CP437 |
| Animated `.utf8ans` | The same, for a modern terminal | As `.utf8ans` | UTF-8 |
| `.cast` | An [asciinema](https://asciinema.org) recording, timed frame by frame | As `.utf8ans` | UTF-8 |

The last five save a whole movie, once Animate is on with more than one frame. The others write the frame showing.

- **CP437**: An `.ans` writes a character CP437 doesn't have as its closest lookalike (or `?`), and the Export dialog lists every one before you export. A `.utf8ans` matches what you see character for character.
- **SAUCE**: The `.ans`, `.utf8ans` and `.xb` exports, animated or not, end with a [SAUCE](https://www.acid.org/info/sauce/sauce.htm) record: the title, author, group and comments you fill in on the SAUCE tab, plus the date, size and font. Uncheck **Include SAUCE** in the Export dialog to leave it out.
- **Line breaks**: A `.utf8ans` ends every row with CR LF, and an `.ans` does when the art is narrower than 80 columns. The animated ones move the cursor instead of scrolling.
- **Speed**: An animated `.ans` or `.utf8ans` has no clock, so its speed depends on the viewer. Slow one down in a terminal with something like `pv -qL 20000 art.utf8ans`. A `.cast` keeps exact timing.
- **Bright backgrounds**: With CGA colors, an `.ans` writes a bright background the DOS way, as blink. With **iCE colors** on, as it is for a new drawing, the file tells viewers to show it bright instead, twice: in its SAUCE record, and with `ESC[?33h` at the top for viewers like SyncTERM that read that. With it off, those cells blink, as they did on DOS.

Many older ANSI viewers only show 16 colors. To view or edit 256-color and 24-bit `.ans` files, try the [Advanced Color fork of Moebius](https://github.com/christiansacks/moebius).

Color lists save as `.hex`, and character palettes as `.palettes.json`.

## How the conversion works

Phosphor shrinks the picture to the grid, two pixels per character cell: the top pixel becomes the cell's background color and the bottom pixel its foreground. With the Pixel character set every cell is a half block (`▄`), so the art has twice as many rows of color as it has rows of text; other sets put their own characters in the cells. With a palette, each pixel is matched to the nearest palette color, or dithered: a picture's pixels between two palette colors become a pattern of both.

Best match and By shape look closer. Best match finds, for each cell, the character and the two palette colors that come closest to the picture. By shape samples each cell at a finer grid of 4 × 8 points and picks the character whose shape fits, which is how a quadrant or a half-column block lands on an edge. The [character guide](docs/characters.md#how-the-converter-picks-characters) explains each.

## Setup and development

Phosphor is a Vue 3 and Pinia app, built with Vite.

### Requirements
- Node.js 22.12 or newer
- npm 9 or newer

### Commands

```bash
npm install                # Install project packages
npm run dev                # Start the local test server at http://localhost:5173
npm run build              # Build the finished app in the dist/ folder
npm run preview            # Test the finished build locally
npm run lint               # Check code formatting with ESLint
npm test                   # Run all tests (run `npx playwright install --with-deps chromium` once first)
npm run test:unit          # Run fast logic tests in Node
npm run test:browser       # Test canvas, WebGL, and data store in Chromium
npm run test:e2e           # Test user interactions on a real build
npm run test:update        # Update test reference files when changes are expected
npm run test:performance   # Run the benchmarks, which print tables and aren't part of npm test
npm run desktop            # Build and start the desktop app (Electron)
npm run test:e2e:desktop   # Test the desktop app, which isn't part of npm test either
```

Every pull request runs the tests, and a failing test blocks the deploy. Every push to main publishes [next.phosphor.work](https://next.phosphor.work); a version tag releases the desktop app and, for a release or a beta, publishes phosphor.work. Read [docs/testing.md](docs/testing.md) to learn where to add new tests, and read [AGENTS.md](AGENTS.md) for where things live and the project's rules.

## Credits

Phosphor's text rendering started with ideas from [play.core](https://github.com/ertdfgcvb/play.core) by [ertdfgcvb](https://ertdfgcvb.xyz/). I've since trimmed and changed that code to fit this app, but their work was a big inspiration. Check out their projects if you enjoy creative coding.

Phosphor draws its art with these fonts:

- [IBM VGA 8x16](https://int10h.org/oldschool-pc-fonts/), from VileR's Ultimate Oldschool PC Font Pack, under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), by The JetBrains Mono Project Authors, under the [SIL Open Font License 1.1](https://openfontlicense.org).
- [Unscii](http://viznut.fi/unscii/), by viznut, in the public domain.
- [GNU Unifont](https://unifoundry.com/unifont/), by Roman Czyborra, Paul Hardy and others, under the [SIL Open Font License 1.1](https://openfontlicense.org).

Phosphor uses subsets of Unscii and Unifont, moved within their cells; [src/assets/fonts](src/assets/fonts/README.md) says how they're built, and where the font library comes from: VileR's [VGA text mode fonts](https://github.com/viler-int10h/vga-text-mode-fonts) and the [Mœbius XBin fonts](https://github.com/hlotvonen/moebiusXBIN). The Palettes page's library is from [Lospec](https://lospec.com/palette-list).

The picture in the first screenshot is Katsushika Hokusai's [Under the Wave off Kanagawa](https://www.metmuseum.org/art/collection/search/45434), in the public domain, from The Metropolitan Museum of Art's open access collection.

## License

Phosphor is free software under the [MIT license](LICENSE).

Copyright 2026 [jejacks0n](https://github.com/jejacks0n)

## Make Code Not War
