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
