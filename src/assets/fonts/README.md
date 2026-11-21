# The 8×16 fonts

Fonts the art can be drawn in (the Font field; `src/lib/displayFonts.js`), built by
`make-display-fonts.py` from these downloads:

| File | Source | License |
| --- | --- | --- |
| `unscii-16.woff2` | [Unscii](http://viznut.fi/unscii/) by viznut, 2.0: `unscii-16-full.ttf` | public domain |
| `unifont.woff2` | [GNU Unifont](https://unifoundry.com/unifont/) 16.0.04: `font-builds/unifont-16.0.04.otf` and `unifont_upper-16.0.04.otf` | SIL Open Font License 1.1 ([OFL-Unifont.txt](OFL-Unifont.txt)), or GPL 2+ with the font embedding exception |

The two fonts embedded in `../fonts.css`:

- "WebPlus IBM VGA 8x16" 2.2, from VileR's [Ultimate Oldschool PC Font Pack](https://int10h.org/oldschool-pc-fonts/),
  under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) 2.304, Copyright 2020 The JetBrains Mono
  Project Authors, under the [SIL Open Font License 1.1](https://openfontlicense.org).

Both carry their copyright and license in their name tables, and so do the two built here.

Each is a subset: the characters a cell gives one column, up to U+2FFF, plus the
halfwidth forms and Symbols for Legacy Computing, without emoji. Wide characters and emoji come from
the system's fonts. Each is moved into the IBM VGA font's cell (−0.25em to 0.75em around the
baseline) so they line up with it and with each other. Rebuild with:

```bash
python3 -m pip install fonttools brotli
python3 src/assets/fonts/make-display-fonts.py unscii-16-full.ttf unifont-16.0.04.otf unifont_upper-16.0.04.otf
```

## The font library

The Fonts page lists bitmap fonts mirrored into `public/fonts/library/` (the index is `index.json` there), from two collections:

- VileR's [VGA text mode fonts](https://github.com/viler-int10h/vga-text-mode-fonts): `FONTS/**`, with its `FONTS.TXT` (the credits) shipped unchanged.
- [Mœbius XBin fonts](https://github.com/hlotvonen/moebiusXBIN): `app/fonts/{amiga,c64,custom,discmaster,ibm}/**`. License unknown.

Skipped: Mœbius's `app/fonts/viler/` (the VileR collection covers it; a font in both is listed once, under VileR's) and FROGBLOCK,
which is linked to its author's page (`src/lib/linkedFonts.js`) and never copied. About credits both collections and FROGBLOCK.

`npm run fonts` (`scripts/font-library.mjs`) mirrors new fonts from both and rewrites the index. It never deletes a font: one gone upstream stays.

On a version tag, the release job in `.github/workflows/desktop.yml` runs the same mirror, commits any new fonts to main and moves the tag onto
that commit, so the release carries them. It needs the `FONTS_DEPLOY_KEY` secret; without it the release builds with the fonts already
committed and warns.
