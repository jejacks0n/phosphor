# Writes the test fonts, so the canvas tests don't depend on the system's fallback fonts. Widths are in
# columns of JetBrains Mono (its advance is 600 of 1000 units). Needs fontTools:
# python3 -m pip install fonttools
#
# wide.ttf: ﷽ (U+FDFD) as a solid bar 7.5 columns wide, so it draws over 8. The half column to spare
# absorbs Linux rounding advances to whole pixels (exactly 8 would measure 8.16 there, and span 9).
#
# color.ttf: 😀 (U+1F600) as a color glyph (COLR) two columns wide: a red bar in its left column and a
# green one in its right, each inset from the column's edges.
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

def bar(x0, x1):
    pen = TTGlyphPen(None)
    if x1 > x0:
        pen.moveTo((x0, -200)); pen.lineTo((x0, 800)); pen.lineTo((x1, 800)); pen.lineTo((x1, -200))
        pen.closePath()
    return pen.glyph()

def build(name, family, codepoint, advance, glyphs, colr=None):
    fb = FontBuilder(1000, isTTF=True)
    order = ['.notdef', *glyphs]  # glyphs starts with 'main'
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({codepoint: 'main'})
    fb.setupGlyf({'.notdef': bar(0, 0), **glyphs})
    glyf = fb.font['glyf']  # each glyph's left side bearing is its xMin, or a renderer shifts it there
    fb.setupHorizontalMetrics({g: (advance if g != '.notdef' else 600, getattr(glyf[g], 'xMin', 0)) for g in order})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({'familyName': family, 'styleName': 'Regular'})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
    fb.setupPost()
    if colr:
        fb.setupCOLR({'main': colr})
        fb.setupCPAL([[(1, 0, 0, 1), (0, 1, 0, 1)]])
    fb.save(Path(__file__).with_name(name))

build('wide.ttf', 'Phosphor Test Wide', 0xFDFD, 4500, {'main': bar(0, 4500)})
build('color.ttf', 'Phosphor Test Color', 0x1F600, 1200,
      {'main': bar(0, 1200), 'red': bar(60, 540), 'green': bar(660, 1140)},
      colr=[('red', 0), ('green', 1)])
