# Builds the 8x16 fonts the art can be drawn in (src/lib/displayFonts.js) from their downloads:
#
#   python3 src/assets/fonts/make-display-fonts.py <unscii-16-full.ttf> <unifont.otf> <unifont_upper.otf>
#
# (sources and licenses: README.md). Needs fontTools and brotli: python3 -m pip install fonttools brotli
#
# Each keeps only the characters a cell gives one column (CharWidth.cellWidth, run in Node) up to
# U+2FFF, the halfwidth forms and Symbols for Legacy Computing, minus emoji: wide characters and
# emoji are left to the system's fonts, which draw CJK at exactly two cells and emoji in color.
# Each is moved into the IBM VGA font's cell (-0.25em to 0.75em around the baseline), since a line
# lines its fonts up by baseline: box drawing and blocks then join whichever font draws them. Each
# keeps its copyright and license in its name table, so they travel with the font.
import json, subprocess, sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.fontBuilder import FontBuilder

HERE = Path(__file__).parent
ROOT = HERE.parent.parent.parent
RANGES = [(0x20, 0x2FFF), (0xFF61, 0xFFEF), (0xFFFD, 0xFFFD), (0x1FB00, 0x1FBFF)]

def one_column():
    script = """
      import { cellWidth } from './src/lib/CharWidth.js';
      const ranges = JSON.parse(process.argv[1]), keep = [];
      for (const [a, b] of ranges) for (let c = a; c <= b; c++) {
        const s = String.fromCodePoint(c);
        if (cellWidth(s) === 1 && !/\\p{Emoji_Presentation}/u.test(s)) keep.push(c);
      }
      console.log(JSON.stringify(keep));
    """
    out = subprocess.run(['node', '--input-type=module', '-e', script, json.dumps(RANGES)], cwd=ROOT, check=True, capture_output=True, text=True)
    return set(json.loads(out.stdout))

# The glyphs for keep from fonts (earlier ones first), each shifted up by its font's dy (units of
# 64 per em), as one TrueType font named family; credits: its name table's copyright and license.
def build(name, family, sources, keep, credits):
    glyphs, cmap, widths = {'.notdef': TTGlyphPen(None).glyph()}, {}, {'.notdef': (32, 0)}
    for path, dy in sources:
        font = TTFont(path)
        assert font['head'].unitsPerEm == 64, path
        subset = Subsetter(Options(notdef_outline=False, layout_features=[], name_IDs=[], hinting=False, prune_unicode_ranges=False))
        subset.populate(unicodes=[c for c in keep if c not in cmap and c in font.getBestCmap()])
        subset.subset(font)
        gs = font.getGlyphSet()
        for code, glyph in font.getBestCmap().items():
            key = f'u{code:04X}'
            if code in cmap or key in glyphs:
                continue
            recording = DecomposingRecordingPen(gs)
            gs[glyph].draw(recording)
            pen = TTGlyphPen(None)
            recording.replay(TransformPen(pen, (1, 0, 0, 1, 0, dy)))
            glyphs[key] = pen.glyph()
            cmap[code] = key
            widths[key] = (font['hmtx'][glyph][0], 0)
    fb = FontBuilder(64, isTTF=True)
    fb.setupGlyphOrder(list(glyphs))
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    glyf = fb.font['glyf']
    fb.setupHorizontalMetrics({k: (w, getattr(glyf[k], 'xMin', 0)) for k, (w, _) in widths.items()})
    fb.setupHorizontalHeader(ascent=48, descent=-16)
    fb.setupNameTable({'familyName': family, 'styleName': 'Regular', **credits})
    fb.setupOS2(version=4, sTypoAscender=48, sTypoDescender=-16, sTypoLineGap=0, usWinAscent=48, usWinDescent=16, fsSelection=0x40 | 0x80)
    fb.setupPost()
    fb.font.flavor = 'woff2'
    fb.save(HERE / name)
    print(name, len(cmap), 'characters', (HERE / name).stat().st_size, 'bytes')

unscii, unifont, unifont_upper = sys.argv[1:4]
keep = one_column()
# Unscii's cell is 0 to 64 above its baseline; Unifont's -8 to 56.
build('unscii-16.woff2', 'Phosphor Unscii', [(unscii, -16)], keep, {
    'copyright': 'Unscii by viznut (http://viznut.fi/unscii/), released into the public domain. Subset for Phosphor and moved within its cell.',
    'licenseDescription': 'Unscii is in the public domain.',
    'vendorURL': 'http://viznut.fi/unscii/',
})
build('unifont.woff2', 'Phosphor Unifont', [(unifont, -8), (unifont_upper, -8)], keep, {
    'copyright': 'Copyright © 1998-2025 Roman Czyborra, Paul Hardy, Qianqian Fang, Andrew Miller, Johnnie Weaver, David Corbett, Nils Moskopp, Rebecca Bettencourt, Ho-Seok Ee, et al. Subset of GNU Unifont 16.0.04 and Unifont Upper 16.0.04 for Phosphor, moved within its cell.',
    'licenseDescription': 'This Font Software is licensed under the SIL Open Font License, Version 1.1. This license is available with a FAQ at: https://openfontlicense.org',
    'licenseInfoURL': 'https://openfontlicense.org',
    'vendorURL': 'https://unifoundry.com/unifont/',
})
