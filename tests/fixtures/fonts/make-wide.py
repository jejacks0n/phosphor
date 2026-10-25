# Writes wide.ttf: one glyph, ﷽ (U+FDFD) as a solid bar 7.5 columns of JetBrains Mono wide (its
# advance is 600 of 1000 units), so a test of overflowing characters doesn't depend on the system's
# fallback fonts. It draws over 8 columns; the half column to spare absorbs Linux rounding advances to
# whole pixels (exactly 8 would measure 8.16 there, and span 9). Needs fontTools:
# python3 -m pip install fonttools
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

WIDTH = 4500  # 7.5 × 600

def bar(width):
    pen = TTGlyphPen(None)
    if width:
        pen.moveTo((0, -200)); pen.lineTo((0, 800)); pen.lineTo((width, 800)); pen.lineTo((width, -200))
        pen.closePath()
    return pen.glyph()

fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(['.notdef', 'wide'])
fb.setupCharacterMap({0xFDFD: 'wide'})
fb.setupGlyf({'.notdef': bar(0), 'wide': bar(WIDTH)})
fb.setupHorizontalMetrics({'.notdef': (600, 0), 'wide': (WIDTH, 0)})
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({'familyName': 'Phosphor Test Wide', 'styleName': 'Regular'})
fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
fb.setupPost()
fb.save(Path(__file__).with_name('wide.ttf'))
