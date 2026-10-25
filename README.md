# Phosphor

You can try the live app at [phosphor.work](https://phosphor.work).

Phosphor turns an image into ANSI art in your browser, then lets you keep working on it: paint, type, select and move cells, and export `.ans` (CP437) or `.utf8ans`, both with a [SAUCE](https://www.acid.org/info/sauce/sauce.htm) record. You can also start from a blank canvas.

[![Phosphor screenshot](screenshot.png)](https://phosphor.work)

## What it does

Load a picture and Phosphor converts it to a grid of character cells. Brightness, contrast, saturation, hue, colorize, invert, sharpen, flatten and edges all apply live, and every slider move is an undo step. When you like where it's going, **Bake** makes the adjusted picture your new starting point and resets the sliders, so you can do another round on top.

Colors can stay full 24-bit, snap to the CGA or VGA palettes, be picked from the picture (a color count you choose), or come from a list you type. Characters come from a set you pick or type yourself; the ANSI style picks them at random from a seed, and the two ASCII styles (color and monochrome) pick them by brightness.

Then you draw. There are two layers: the base layer is the converted picture, and the edit layer is everything you add on top with the pencil, brush, paint bucket, shapes and eraser, or by typing. Merge down puts your drawing into the base; merge up lifts the base into editable cells. Select lets you cut, copy, paste and drag blocks around, and pastes plain text from other apps.

Typing works the way a terminal does. Chinese, Japanese and Korean characters and most emoji take two columns. F1 to F12 type from a palette of twelve characters (box drawing, blocks, shades, arrows and more), and you can switch palettes or make your own. Anything CP437 doesn't have still saves in `.utf8ans`.

Press **?** in the app for the keyboard shortcuts. The [layer guide](docs/layers.md) and the [character guide](docs/characters.md) go into the details.

## Saving

- **`.phosphor`** keeps the whole project (image, layers, settings) so you can open it again later.
- **`.ans`** is CP437 with ANSI color codes, for classic viewers. Phosphor writes a character CP437 doesn't have as its closest lookalike (or `?`) and lists every one before you export.
- **`.utf8ans`** is UTF-8, for modern terminals, and matches what you see character for character.

Both exports end with a SAUCE record: the title, author, group and comments you fill in on the SAUCE tab, plus the date, size and font.

Your settings are kept in your browser between visits.

## How the conversion works

Phosphor shrinks the picture to the grid, two pixels per character cell: the top pixel becomes the cell's background color and the bottom pixel its foreground. With the Pixel character set every cell is a half block (`▄`), so the art has twice as many rows of color as it has rows of text; other sets put their own characters in the cells. With a palette, each pixel is matched to the nearest palette color.

## Output formats

| File | Colors | Characters | Line breaks |
|---|---|---|---|
| `.ans` | CGA (16 colors), or 256 / 24-bit color | CP437 | CR LF after each row when the art is narrower than 80 columns |
| `.utf8ans` | 24-bit (CGA and VGA as 256-color codes) | UTF-8 | CR LF after each row |

Many older ANSI viewers only show 16 colors. To view or edit 256-color and 24-bit `.ans` files, try the [Advanced Color fork of Moebius](https://github.com/christiansacks/moebius).

## Setup and development

### Requirements
- Node.js 22.12 or newer
- npm 9 or newer

### Commands

```bash
npm install           # Install project packages
npm run dev           # Start the local test server at http://localhost:5173
npm run build         # Build the finished app in the dist/ folder
npm run preview       # Test the finished build locally
npm run lint          # Check code formatting with ESLint
npm test              # Run all tests (run `npx playwright install --with-deps chromium` once first)
npm run test:unit     # Run fast logic tests in Node
npm run test:browser  # Test canvas, WebGL, and data store in Chromium
npm run test:e2e      # Test user interactions on a real build
npm run test:update   # Update test reference files when changes are expected
```

Every pull request runs the tests, and a failing test blocks the deploy. Read [docs/testing.md](docs/testing.md) to learn where to add new tests, and read [AGENTS.md](AGENTS.md) for project rules.

## Credits

Phosphor's text rendering started with ideas from [play.core](https://github.com/ertdfgcvb/play.core) by [ertdfgcvb](https://ertdfgcvb.xyz/). I've since trimmed and changed that code to fit this app, but their work was a big inspiration. Check out their projects if you enjoy creative coding.

Phosphor draws its art with these fonts:

- [IBM VGA 8x16](https://int10h.org/oldschool-pc-fonts/), from VileR's Ultimate Oldschool PC Font Pack, under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), by The JetBrains Mono Project Authors, under the [SIL Open Font License 1.1](https://openfontlicense.org).
- [Unscii](http://viznut.fi/unscii/), by viznut, in the public domain.
- [GNU Unifont](https://unifoundry.com/unifont/), by Roman Czyborra, Paul Hardy and others, under the [SIL Open Font License 1.1](https://openfontlicense.org).

Phosphor uses subsets of Unscii and Unifont, moved within their cells; [src/assets/fonts](src/assets/fonts/README.md) says how they're built.

## License

Phosphor is free software under the [MIT license](LICENSE).

Copyright 2026 [jejacks0n](https://github.com/jejacks0n)

## Make Code Not War