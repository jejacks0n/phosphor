Phosphor
========

Convert images to ANSI art in the browser. Provide an image, tune the output with image adjustments and color quantization options, then export as a standard `.ans` or modern `.utf8ans` file — both with embedded [SAUCE](https://www.acid.org/info/sauce/sauce.htm) metadata.

## Setup & Usage

### Prerequisites
- **Node.js**: Version 14+
- **npm**: Version 6+

### Commands
```bash
npm install       # Install dependencies
npm run serve     # Start dev server at http://localhost:8080
npm run build     # Create production build in dist/
npm run lint      # Run ESLint
```

## Features

- **Export in two formats**
  - `.ans` — CGA 16-color or VGA 256-color, CP437-encoded characters, compatible with classic ANSI viewers (PabloDraw, Moebius, ACiDDraw, etc.)
  - `.utf8ans` — 24-bit true-color or VGA 256-color ANSI escape sequences with raw UTF-8 characters
- **Image adjustments** — smoothing, dimensions, brightness, contrast, saturation, hue rotation, invert, etc.
- **Color quantization** - full color, CGA 16, VGA 256, or reduce to N colors (MMCQ) or a custom palette
- **Randomized characters** - achieve various aesthetic foundations with a seedable RNG to generate character noise 
- **SAUCE metadata** - title, author, group, date, font name, ice color flag
- **Memory** - all settings persist across sessions via localStorage, but can be reset

## How it works

The image is drawn onto an off-screen canvas at `cols × (rows × 2)` pixels. Each pair of vertically adjacent pixels maps to one character cell: the top pixel becomes the background color, and the bottom pixel becomes the foreground color, using `▄` (U+2584 LOWER HALF BLOCK) as the character. This doubles the effective vertical resolution for the same character count. The character used for the foreground character can be randomized from set set of possible characters that can be provided.

An optional color quantization pass replaces every pixel color with the nearest color from the chosen palette before the character assignment step.

The exported file is a flat byte stream of ANSI escape sequences followed by a 128-byte SAUCE record.

## Output formats

| Format     | Color                                           | Characters | Newlines          |
|------------|-------------------------------------------------|------------|-------------------|
| `.ans`     | CGA SGR (30-37 / 40-47, bold, blink)            | CP437      | none (raw stream) |
| `.utf8ans` | 24-bit `ESC[38;2;R;G;Bm` / `ESC[48;2;R;G;Bm`  | UTF-8      | `\r\n` per row    |

## Credits

ANSI art preview and rendering powered by the [play](https://github.com/nicholasstephan/play) creative-coding runtime by [ertdfgcvb](https://ertdfgcvb.xyz/).
