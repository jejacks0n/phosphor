# Phosphor

You can try the live app at [phosphor.work](https://phosphor.work).

Phosphor is a free tool to make ANSI text art in your web browser. You can start with an image or start with a blank screen. Phosphor turns pictures into text art made of small colored blocks and letters. You can adjust the colors, pick which characters to use, and change settings such as brightness and contrast. You can also draw right on top of your art with brushes, paint buckets, and shapes, or type text with your keyboard.

When you finish, you can save your project to keep working on it later. You can also export your art as a standard `.ans` file or a modern `.utf8ans` file. Both export formats include [SAUCE](https://www.acid.org/info/sauce/sauce.htm) details such as your name and the art title.

[![Phosphor screenshot](screenshot.png)](https://phosphor.work)

## Features

### Turning Images into Text Art

- **Adjustments and effects**: Change brightness, contrast, saturation, hue, color tint, sharpness, and edges in real time. You can undo every change. Click **Bake** to save your adjustments into the picture and keep working.
- **Color palettes**: Pick from full 24-bit color, classic CGA (16 colors), VGA (256 colors), colors taken right from your picture, or your own custom color list.
- **Character sets**: Pick from blocks, shades, symbols, or classic ASCII characters. Phosphor can place characters by brightness or mix them for texture.
- **Art styles**: Choose between full ANSI (colored blocks and letters), Color ASCII, or Black-and-White ASCII.

### Drawing and Editing

- **Two layers**: A base layer for your converted picture, and an edit layer for your drawings. You can merge your drawings down into the base, or bring the base up to edit it character by character.
- **Drawing tools**: Pencil, Brush, Paint Bucket, Shapes, Eraser, Flip, Color Picker, and a Hand tool to move around the screen.
- **Typing text**: Type letters and words straight into your art. You can use insert or overwrite mode, and switch character sets with the F-keys on your keyboard. It supports standard letters, symbols, emoji, and two-column characters such as Chinese, Japanese, and Korean.
- **Select and move**: Cut, copy, paste, and move parts of your art around the screen. You can also paste text to and from other apps.
- **Undo and shortcuts**: You can undo every action. Press **?** in the app to see all keyboard shortcuts. For example, hold the Alt key to pick a color, or hold the Space key to pan around your canvas.

### Saving Your Work

- **Project files (`.phosphor`)**: Save your whole project, including layers and settings, so you can open it again later.
- **Export files**: Save as `.ans` for classic ANSI viewers or `.utf8ans` for modern terminals. If a character does not exist in classic CP437, Phosphor tells you what it replaced it with.
- **SAUCE details**: Save details such as title, author name, group name, date, font, and iCE colors directly inside the file.
- **Browser memory**: Phosphor saves your settings in your browser, so your setup is still there when you return. You can also reset settings at any time.

Want to learn more about the tools? Read the [layer guide](docs/layers.md) and the [character guide](docs/characters.md).

## How It Works

Phosphor draws your picture onto a small grid. Every character box has two pixels stacked on top of each other. The top pixel sets the background color. The bottom pixel sets the text color using a half-block character (`▄`). This gives you twice as much vertical detail. If you choose a color palette, Phosphor rounds each pixel to the closest matching color.

Your drawings and typed text sit on a second layer on top of the picture. What you see on the screen matches the final output character for character. When you export, Phosphor saves those characters along with standard ANSI color codes and a 128-byte SAUCE record at the end.

## Output Formats

| File Extension | Colors | Characters | Line Breaks |
|---|---|---|---|
| `.ans` | Classic CGA (16 colors) or modern 256 / 24-bit TrueColor | CP437 (classic PC characters) | None (one continuous stream) |
| `.utf8ans` | 24-bit TrueColor | UTF-8 (supports all modern characters) | Newline at the end of each row |

## Note on Older ANSI Viewers

Phosphor lets you export `.ans` files with 256 colors or full 24-bit color. However, many older ANSI viewers only know how to show 16 colors.

If you want to view or edit high-color `.ans` files on your computer, try the **[Advanced Color fork of the Moebius editor](https://github.com/christiansacks/moebius)**.

## Setup and Development

### Requirements
- **Node.js**: Version 22.12 or newer
- **npm**: Version 9 or newer

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

All tests run automatically on every pull request before code gets published. Read [docs/testing.md](docs/testing.md) to learn where to add new tests, and read [AGENTS.md](AGENTS.md) for project rules.

## Credits

Phosphor's text rendering started with ideas from [play.core](https://github.com/ertdfgcvb/play.core) by [ertdfgcvb](https://ertdfgcvb.xyz/). Over time, I trimmed and changed that code to fit this app, but their creative work was a big inspiration. Definitely check out their projects if you enjoy creative coding.

Phosphor draws its art with these fonts:

- [IBM VGA 8x16](https://int10h.org/oldschool-pc-fonts/), from VileR's Ultimate Oldschool PC Font Pack, under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), by The JetBrains Mono Project Authors, under the [SIL Open Font License 1.1](https://openfontlicense.org).
- [Unscii](http://viznut.fi/unscii/), by viznut, in the public domain.
- [GNU Unifont](https://unifoundry.com/unifont/), by Roman Czyborra, Paul Hardy and others, under the [SIL Open Font License 1.1](https://openfontlicense.org).

Phosphor uses subsets of Unscii and Unifont, moved within their cells; [src/assets/fonts](src/assets/fonts/README.md) says how they're built.

## License

Phosphor is free software under the MIT license:

* https://opensource.org/licenses/MIT

Copyright 2026 [jejacks0n](https://github.com/jejacks0n)

## Make Code Not War