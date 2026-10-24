// The browser layer's ground rules: software WebGL (the same pixels on any machine, so conversions
// can be compared against reference files), the display font loaded before glyphs are measured, and
// a conversion that comes out the same every run.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, cellsKey } from '../support/app.js';
import { matchReference } from '../support/references.js';
import { coverageOf } from '@/lib/GlyphCoverage';

test('runs on software WebGL', () => {
  const gl = document.createElement('canvas').getContext('webgl');
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  expect(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)).toMatch(/SwiftShader/i);
});

test('the display font is loaded and glyph coverage measured', async () => {
  await createTestApp();
  // fonts.check() is true when no face matches at all, so ask for the face itself.
  expect([...document.fonts].filter((f) => f.family.includes('JetBrains Mono')).map((f) => f.status)).toContain('loaded');
  expect(coverageOf('A')).not.toEqual([0.5, 0.5]); // measured, not the unknown default
});

test('converts an image to the same cells as its reference', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  await matchReference('conversion/gradient-40x40-default.txt', cellsKey(project).join('\n'));
});
