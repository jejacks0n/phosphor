# img2utf8ans

A browser-based GUI that converts images (JPEG/PNG) into ANSI art files. Users upload an image, tune visual parameters, and export as `.ans` (CGA 4-bit color + CP437) or `.utf8ans` (24-bit true-color + UTF-8).

## Commands

```bash
npm install          # install dependencies
npm run serve        # dev server with hot-reload
npm run build        # production build
npm run lint         # ESLint
```

## Architecture

Vue 3 SPA with Pinia state management. No backend — everything runs in the browser. Two main components side by side:

- **`PlayCoreCanvas`** — renders the ANSI art preview, runs the image conversion pipeline
- **`CommandPanel`** — sidebar UI for all settings and export

### Key files

| Path | Role |
|------|------|
| `src/store/CurrentFile.js` | Pinia store; all user state (persisted to localStorage via `useLocalStorage`), `setImageFromFile()`, `exportFile()` |
| `src/components/PlayCoreCanvas.vue` | Core conversion pipeline (`setup()`) and per-cell draw callback (`draw()`) |
| `src/components/CommandPanel.vue` | Settings sidebar with all controls |
| `src/lib/AnsiFile.js` | Byte-level ANSI encoder; produces `.ans` or `.utf8ans` blobs |
| `src/lib/Sauce.js` | Encodes the 128-byte SAUCE00 metadata block appended to exported files |
| `src/lib/encodings.js` | Unicode-to-CP437 lookup (switch statement, 164 lines) |
| `src/play/` | "play" creative-coding runtime (v1.1, based on `ertdfgcvb/play`) — not project-specific |

### Conversion pipeline (`PlayCoreCanvas.setup()`)

1. Create seeded RNG from `store.seed`
2. Create off-screen canvas at `cols × rows` pixels
3. Apply CSS filters (hue, brightness, contrast, saturation, invert) to canvas context
4. Configure image smoothing
5. Draw the image onto the canvas with letterbox-fit (`canvas.fit(image)`)
6. Optional color quantization:
   - `'count'` — MMCQ via `node-vibrant` to N colors
   - `'palette'` — user-supplied hex color list
   - `'cga'` — 16 CGA colors (hardcoded)
   - `'vga'` — 256 xterm-256 colors (hardcoded)
7. `canvas.process()` — assigns a random char + hex color to every pixel → `data[]`
8. Store result in `store.blockData`

### Half-block rendering trick

The canvas is rendered at `cols × (rows * 2)` pixel rows internally. Each display character row uses **two** pixel rows:
- top pixel → background color
- bottom pixel → foreground color
- character is always `▄` (LOWER HALF BLOCK, U+2584)

This doubles vertical resolution for the same character count.

### ANSI encoding

`AnsiFile.#asBytes()` iterates `rows × cols` cells:
- **utf8ans**: emits `ESC[38;2;R;G;Bm` / `ESC[48;2;R;G;Bm` true-color sequences + raw UTF-8 bytes
- **ans**: emits SGR codes 30-37/40-47 (CGA); bold = colors 8-15 fg; blink = colors 8-15 bg; state-tracked to minimize redundant escapes; characters encoded via CP437

Both formats end with `ESC[0m` followed by the SAUCE block.

### SAUCE block

128-byte record prepended with a `0x1A` EOF marker. Fields: title (35 bytes), author (20), group (20), date (8, YYYYMMDD), file size (32-bit LE), data type, file type, cols/rows (16-bit LE), flags (iceColors, 9px font).

## State

All settings in `CurrentFile.js` are persisted to localStorage. `blockData` and `image` are explicitly excluded from Pinia undo history. Undo/redo is provided by `pinia-undo`.

## The play runtime (`src/play/`)

A standalone creative-coding framework. `run(program, settings)` drives a `requestAnimationFrame` loop, calling `boot → pre → main → post` hooks. `main(coord, context)` is called once per cell per frame. The app uses it with `once: true` (no animation loop). The `src/play/programs/` directory contains ~25 demo programs that are **not** part of the conversion feature.

## Documentation

- **`README.md`** — Overview, setup instructions, and usage summary
- **`CLAUDE.md`** — Architectural reference and developer notes (this file)

## Known gaps

- No automated tests
- `src/play/` directory contains many unused demo programs
- Quantization algorithms could be further optimized for performance