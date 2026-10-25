# Writes the test fonts, so the canvas tests don't depend on the system's fallback fonts. Widths are in
# columns of JetBrains Mono (its advance is 600 of 1000 units). Needs fontTools:
# python3 -m pip install fonttools
#
# wide.ttf: ﷽ (U+FDFD) as a solid bar 7.5 columns wide, so it draws over 8. The half column to spare
# absorbs Linux rounding advances to whole pixels (exactly 8 would measure 8.16 there, and span 9).
#
# color.ttf: 😀 (U+1F600) as a color glyph (COLR) two columns wide: a red bar in its left column and a
# green one in its right, each inset from the column's edges.
#
# tall.ttf: a monospaced font (every glyph 600 wide) whose ascent and descent (1100, 100) add up to
# more than its em, as most fonts' do: the sample characters a loaded font is checked with, as
# boxes, and _ as a bar filling exactly the bottom twelfth of its line (the descent), so where a
# view puts the baseline shows.
#
# proportional.ttf: the same sample characters, each its own width, as a proportional font's are.
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

def rect(x0, x1, y0, y1):
    pen = TTGlyphPen(None)
    pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0))
    pen.closePath()
    return pen.glyph()

# A font of characters: {char: (advance, glyph)}, with this ascent and descent (units of 1000 per em).
def build_text(name, family, ascent, descent, chars):
    fb = FontBuilder(1000, isTTF=True)
    names = {c: f'u{ord(c):04X}' for c in chars}
    order = ['.notdef', *names.values()]
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({ord(c): n for c, n in names.items()})
    fb.setupGlyf({'.notdef': bar(0, 0), **{names[c]: g for c, (_, g) in chars.items()}})
    glyf = fb.font['glyf']
    advances = {'.notdef': 600, **{names[c]: a for c, (a, _) in chars.items()}}
    fb.setupHorizontalMetrics({g: (advances[g], getattr(glyf[g], 'xMin', 0)) for g in order})
    fb.setupHorizontalHeader(ascent=ascent, descent=-descent)
    fb.setupNameTable({'familyName': family, 'styleName': 'Regular'})
    fb.setupOS2(version=4, sTypoAscender=ascent, sTypoDescender=-descent, sTypoLineGap=0, usWinAscent=ascent, usWinDescent=descent, fsSelection=0x40 | 0x80)
    fb.setupPost()
    fb.save(Path(__file__).with_name(name))

SAMPLE = "il.' MWm@0"
box = lambda advance: rect(50, advance - 50, 0, 700)
build_text('tall.ttf', 'Phosphor Test Tall', 1100, 100,
           {**{c: (600, box(600) if c != ' ' else bar(0, 0)) for c in SAMPLE}, '_': (600, rect(0, 600, -100, 0))})
build_text('proportional.ttf', 'Phosphor Test Proportional', 800, 200,
           {c: (a, box(a) if c != ' ' else bar(0, 0)) for c, a in zip(SAMPLE, [250, 250, 250, 250, 300, 800, 900, 800, 900, 550])})

build('wide.ttf', 'Phosphor Test Wide', 0xFDFD, 4500, {'main': bar(0, 4500)})
build('color.ttf', 'Phosphor Test Color', 0x1F600, 1200,
      {'main': bar(0, 1200), 'red': bar(60, 540), 'green': bar(660, 1140)},
      colr=[('red', 0), ('green', 1)])
