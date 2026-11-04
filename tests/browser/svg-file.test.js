// Reading an SVG file: its art as outlines in user units, each with its whole transform and its resolved
// paint, and what couldn't come in noted. Parsed as data, never put in the page.
import { test, expect, vi } from 'vitest';
import { readSvgFile, isSvgFile } from '@/lib/SvgFile.js';
import { apply } from '@/document/shapes.js';
import rose from '../fixtures/svg/rose-mark.svg?raw';
import mark from '../fixtures/svg/belle-verriere-mark.svg?raw';
import logo from '../fixtures/svg/belle-verriere-logo.svg?raw';
import gradients from '../fixtures/svg/gradients.svg?raw';
import { multiply, rotation } from '@/document/shapes.js';

const svg = (body, attrs = 'viewBox="0 0 100 100"') => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attrs}>${body}</svg>`;
// An item's first outline's points, in the viewport's units.
const world = (item, o = 0) => item.outlines[o].points.map(([x, y]) => { const p = apply(item.m, x, y); return [Math.round(p.x * 1000) / 1000 + 0, Math.round(p.y * 1000) / 1000 + 0]; });

test('.svg names are SVG files', () => {
  expect(isSvgFile('logo.svg')).toBe(true);
  expect(isSvgFile('LOGO.SVG')).toBe(true);
  expect(isSvgFile('logo.svgz')).toBe(false);
  expect(isSvgFile('logo.png')).toBe(false);
});

test('the rose: six stroked paths, round caps and joins from their group, arcs included', () => {
  const art = readSvgFile(rose);
  expect([art.width, art.height]).toEqual([640, 760]);
  expect(art.items).toHaveLength(6);
  for (const item of art.items) expect(item).toMatchObject({ stroke: '#000000', width: 26, cap: 'round', join: 'round', fill: null });
  // The viewBox starts at (180, 150): its corner is the art's.
  expect(world(art.items[0])[0]).toEqual([532 - 180, 330 - 150]);
  expect(art.items[0].outlines[0].points.length).toBeGreaterThan(4); // the arcs are cubics
  expect(art.left.size).toBe(0);
});

test('the Affinity mark: strokes, the outer svg\'s style, each path\'s matrix', () => {
  const art = readSvgFile(mark);
  expect([art.width, art.height]).toEqual([312, 422]); // width="100%": the viewBox's
  expect(art.items).toHaveLength(9);
  for (const item of art.items) expect(item).toMatchObject({ stroke: '#000000', width: 13, cap: 'round', rule: 'evenodd', fill: null });
  expect(art.items[1].m.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, 0, 0, 1, -356.796773, -300.01518]);
});

test('the Affinity logo: letters of several outlines, nonzero, default black fill', () => {
  const art = readSvgFile(logo);
  const e = art.items[10];
  expect(e.outlines).toHaveLength(2);
  expect(e).toMatchObject({ rule: 'nonzero', fill: '#000000', stroke: null });
  // Font units under ×104 and two translations.
  const [a, b, c, d, ex, f] = e.m;
  expect([a, b, c, d]).toEqual([104, 0, 0, 104]);
  expect(ex).toBeCloseTo(7.428605 + 52.411738, 5); // the first word's second letter
  expect(f).toBeCloseTo(490.838483 + 59.411565, 5);
  expect(art.items.filter((i) => i.fill === '#000000').length).toBeGreaterThan(10);
});

test('styles cascade: attribute, sheet, style attribute, inheritance, currentColor, named and rgb colors', () => {
  const art = readSvgFile(svg(`
    <style>
      /* a comment */
      rect { fill: rgb(0, 0, 255); }
      .warm { fill: tomato; stroke-width: 3 }
      #hot.warm { fill: #f00 }
      g > rect { fill: lime } /* a combinator: not read */
      @media print { rect { fill: black } }
    </style>
    <rect width="10" height="10" fill="green"/>
    <rect class="warm" width="10" height="10" fill="green"/>
    <rect id="hot" class="warm other" width="10" height="10"/>
    <rect class="warm" width="10" height="10" style="fill: rgba(10, 20, 30, 0.5)"/>
    <g fill="#abc" stroke="purple" stroke-width="2" stroke-linejoin="bevel" color="#123456" fill-rule="evenodd">
      <path d="M0 0 L5 0 L5 5 Z"/>
      <path d="M0 0 L5 0 L5 5 Z" fill="currentColor" stroke="none"/>
      <path d="M0 0 L5 0 L5 5 Z" style="stroke-linecap: square; stroke-miterlimit: 10; fill: inherit"/>
      <g style="fill: none"><path d="M0 0 L5 0 L5 5 Z" stroke="currentcolor"/></g>
    </g>
    <path d="M0 0 L5 0 L5 5 Z" fill="currentColor"/>
    <path d="M0 0 L5 0 L5 5 Z" fill="nonsense"/>
    <path d="M0 0 L5 0 L5 5 Z" fill="#ff000080" stroke="#0f08" stroke-width="4px"/>
  `));
  expect(art.items.map((i) => i.fill)).toEqual([
    '#0000ff', '#ff6347', '#ff0000', '#0a141e',
    '#aabbcc', '#123456', '#aabbcc', null,
    '#000000', '#000000', '#ff0000',
  ]);
  expect(art.items[1].width).toBe(3);
  expect(art.items[4]).toMatchObject({ stroke: '#800080', width: 2, join: 'bevel', rule: 'evenodd', cap: 'butt', miter: 4 });
  expect(art.items[5].stroke).toBeNull();
  expect(art.items[6]).toMatchObject({ cap: 'square', miter: 10, join: 'bevel' });
  expect(art.items[7].stroke).toBe('#123456');
  expect(art.items[0]).toMatchObject({ stroke: null, width: 1, rule: 'nonzero', cap: 'butt', join: 'miter', miter: 4 });
  expect(art.items[10]).toMatchObject({ stroke: '#00ff00', width: 4 });
});

test('use, rect with rounded corners, circle, ellipse, line, polyline, polygon', () => {
  const art = readSvgFile(svg(`
    <defs><path id="tri" d="M0 0 L10 0 L10 10 Z"/></defs>
    <symbol id="sym" viewBox="0 0 10 10"><rect width="10" height="10"/></symbol>
    <use href="#tri" x="20" y="30" fill="red"/>
    <use xlink:href="#tri" transform="scale(2)"/>
    <rect x="10" y="10" width="40" height="20" rx="5"/>
    <circle cx="50" cy="50" r="10"/>
    <ellipse cx="50" cy="50" rx="20" ry="10" transform="rotate(90 50 50)"/>
    <line x1="0" y1="0" x2="10" y2="10" stroke="black"/>
    <polyline points="0,0 10,0 10,10 20" stroke="black" fill="none"/>
    <polygon points="0 0 10 0 10 10"/>
    <use href="#sym" x="60" y="60" width="20" height="20"/>
    <rect width="0" height="10"/>
  `));
  expect(art.items).toHaveLength(9); // the rect of no width draws nothing
  const [tri, tri2, rounded, circle, ellipse, line, polyline, polygon, sym] = art.items;
  expect(world(tri)).toEqual([[20, 30], [30, 30], [30, 40]]);
  expect(tri.fill).toBe('#ff0000');
  expect(world(tri2)).toEqual([[0, 0], [20, 0], [20, 20]]);
  expect(rounded.outlines[0].closed).toBe(true);
  expect(rounded.outlines[0].points).toHaveLength(8); // four corners, each an arc between two points
  expect(world(rounded)[0]).toEqual([15, 10]);
  expect(circle.outlines[0].points).toHaveLength(4);
  expect(circle.outlines[0].points.every((p) => p[6] === 1)).toBe(true);
  const ys = world(ellipse).map(([, y]) => y);
  expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(40, 3); // turned on its side
  expect(line.outlines[0]).toMatchObject({ closed: false });
  expect(world(line)).toEqual([[0, 0], [10, 10]]);
  expect(world(polyline)).toEqual([[0, 0], [10, 0], [10, 10]]); // the odd number left over is dropped
  expect(polygon.outlines[0].closed).toBe(true);
  expect(world(sym)).toEqual([[60, 60], [80, 60], [80, 80], [60, 80]]);
});

test('nested svg viewports, the viewBox and preserveAspectRatio, and every kind of transform', () => {
  const art = readSvgFile(svg(`
    <svg x="10" y="10" width="20" height="10" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>
    <svg x="0" y="0" width="20" height="10" viewBox="0 0 10 10" preserveAspectRatio="none"><rect width="10" height="10"/></svg>
    <svg width="20" height="10" viewBox="0 0 10 10" preserveAspectRatio="xMinYMin slice"><rect width="10" height="10"/></svg>
    <rect width="10" height="10" transform="translate(5) skewX(45)"/>
    <rect width="10" height="10" transform="matrix(1 0 0 1 3 4), rotate(-90)"/>
  `, 'width="200" height="100" viewBox="0 0 100 100" preserveAspectRatio="xMaxYMid meet"'));
  expect([art.width, art.height]).toEqual([200, 100]);
  // The outer viewBox: ×1, centered on the right (xMax): 100 units in from the left.
  const [meet, none, slice, skew, turned] = art.items;
  expect(world(meet)).toEqual([[115, 10], [125, 10], [125, 20], [115, 20]]); // 10×10 in a 20×10 box, centered
  expect(world(none)).toEqual([[100, 0], [120, 0], [120, 10], [100, 10]]);
  expect(world(slice)).toEqual([[100, 0], [120, 0], [120, 20], [100, 20]]);
  expect(world(skew)).toEqual([[105, 0], [115, 0], [125, 10], [115, 10]]);
  expect(world(turned)).toEqual([[103, 4], [103, -6], [113, -6], [113, 4]]);
});

test('no viewBox: the width and height, in their units; neither: the art\'s own bounds', () => {
  expect(readSvgFile(svg('<rect width="10" height="10"/>', 'width="1in" height="48pt"'))).toMatchObject({ width: 96, height: 64 });
  const art = readSvgFile(svg('<rect x="20" y="30" width="10" height="5"/>', ''));
  expect([art.width, art.height]).toEqual([10, 5]);
  expect(world(art.items[0])[0]).toEqual([0, 0]);
});

test('what can\'t come in is noted, and a hostile file runs and loads nothing', () => {
  const fetchSpy = vi.spyOn(window, 'fetch');
  const images = vi.spyOn(window, 'Image');
  delete window.__ran;
  const art = readSvgFile(svg(`
    <style>@import url(https://example.invalid/x.css); rect { fill: blue }</style>
    <script>window.__ran = true</script>
    <text x="0" y="10">Hello</text>
    <image href="https://example.invalid/x.png" width="10" height="10"/>
    <rect width="10" height="10" onload="window.__ran = true" filter="url(#f)" stroke="black" stroke-dasharray="2 2"/>
    <rect width="10" height="10" clip-path="url(#c)" mask="url(#m)" style="fill: url(#p)" stroke="black"/>
    <pattern id="p" width="2" height="2"><rect width="1" height="1"/></pattern>
    <foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject>
    <g id="a"><use href="#b"/></g><g id="b"><use href="#a"/></g>
    <use href="#self" id="self"/>
    <rect width="10" height="10" display="none"/>
    <g style="display: none"><rect width="10" height="10"/></g>
    <rect width="10" height="10" visibility="hidden"/>
    <g visibility="hidden"><rect width="10" height="10" visibility="visible"/></g>
  `));
  expect([...art.left].sort()).toEqual(['clip', 'dash', 'filter', 'image', 'mask', 'other', 'pattern', 'text']);
  expect(art.items).toHaveLength(3); // two noted rects and the visible one in the hidden group
  expect(art.items[0].fill).toBe('#0000ff');
  expect(art.items[1].fill).toBeNull(); // a pattern with no fallback
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(images).not.toHaveBeenCalled();
  expect(window.__ran).toBeUndefined();
  expect(document.querySelector('text, image, foreignObject')).toBeNull();
  fetchSpy.mockRestore();
  images.mockRestore();
});

const close = (a, b) => expect(a.map((v) => Math.round(v * 1e6) / 1e6)).toEqual(b.map((v) => Math.round(v * 1e6) / 1e6));

test('gradients come in as gradient fills: both units, gradientTransform, focal points, href, and a stroke\'s too', () => {
  const [sunset, turned, glow, glow2] = readSvgFile(gradients).items;
  // The box's diagonal: (10, 10) to (90, 70), stretched with the 80 × 60 box.
  expect(sunset.fill).toMatchObject({ type: 'linear', stops: [[0, '#ff6a00'], [0.5, '#ee0979'], [1, '#1e3c72']] });
  close(sunset.fill.m, [80, 60, -80, 60, 10, 10]);
  // In user space, along (110, 10) to (190, 10), turned 30° about (150, 40); reflect comes in as pad.
  expect(turned.fill.stops).toEqual([[0, '#ffff00'], [1, '#008000']]);
  close(turned.fill.m, multiply(rotation(Math.PI / 6, 150, 40), [80, 0, 0, 80, 110, 10]));
  // A circle over the circle's box, its focal point up and to the left.
  expect(glow.fill).toMatchObject({ type: 'radial', stops: [[0, '#ffffff'], [1, '#0050ff']] });
  close(glow.fill.m, [35, 0, 0, 35, 50, 115]);
  close(glow.fill.f, [-0.4, -0.3]);
  // glow's circle and stops through href, squashed by its own gradientTransform in the ellipse's box.
  close(glow2.fill.m, [40, 0, 0, 24, 150, 109]);
  close(glow2.fill.f, [-0.4, -0.3]);
  // The stroke's: sunset's diagonal through href, over the ellipse's box.
  expect(glow2.stroke).toMatchObject({ type: 'linear', stops: [[0, '#ff6a00'], [0.5, '#ee0979'], [1, '#1e3c72']] });
  close(glow2.stroke.m, [80, 60, -80, 60, 110, 85]);
});

test('a gradient with one stop is its color, with none no paint, and one with no length its last stop\'s', () => {
  const art = readSvgFile(svg(`
    <defs><linearGradient id="one"><stop offset="0" stop-color="#ff8800"/></linearGradient>
      <linearGradient id="none"/>
      <linearGradient id="flat" x2="0"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>
      <radialGradient id="dot" r="0"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="lime"/></radialGradient>
      <linearGradient id="many">${Array.from({ length: 40 }, (_, i) => `<stop offset="${i / 39}" stop-color="${i % 2 ? '#000' : '#fff'}"/>`).join('')}</linearGradient>
      <linearGradient id="messy"><stop offset="0.6" stop-color="red"/><stop offset="0.2" stop-color="blue"/><stop offset="150%" stop-color="lime"/></linearGradient>
      <radialGradient id="far" fx="2"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></radialGradient>
      <linearGradient id="loop" href="#loop2"/><linearGradient id="loop2" href="#loop"/></defs>
    <rect width="10" height="10" fill="url(#one)"/>
    <rect width="10" height="10" fill="url(#none)" stroke="black"/>
    <rect width="10" height="10" fill="url(#flat)"/>
    <rect width="10" height="10" fill="url(#dot)"/>
    <rect width="10" height="10" fill="url(#many)"/>
    <rect width="10" height="10" fill="url(#messy)"/>
    <rect width="10" height="10" fill="url(#far)"/>
    <rect width="10" height="10" fill="url(#loop)" stroke="black"/>
  `));
  const [one, none, flat, dot, many, messy, far, loop] = art.items;
  expect(one.fill).toBe('#ff8800');
  expect(none.fill).toBeNull();
  expect(flat.fill).toBe('#0000ff');
  expect(dot.fill).toBe('#00ff00');
  expect(many.fill.stops).toHaveLength(16);
  expect(many.fill.stops[0]).toEqual([0, '#ffffff']);
  expect(many.fill.stops.at(-1)).toEqual([1, '#000000']);
  expect(messy.fill.stops.map(([o]) => o)).toEqual([0.6, 0.6, 1]);
  expect(Math.hypot(...far.fill.f)).toBeLessThanOrEqual(1);
  expect(loop.fill).toBeNull();
});

test('a file that fans out through use stops early, marked so', () => {
  let defs = '<g id="u0">' + '<rect width="1" height="1"/>'.repeat(10) + '</g>';
  for (let i = 1; i <= 7; i++) defs += `<g id="u${i}">` + `<use href="#u${i - 1}"/>`.repeat(10) + '</g>';
  const started = performance.now(), art = readSvgFile(svg(`<defs>${defs}</defs><use href="#u7"/>`));
  expect(performance.now() - started).toBeLessThan(2000);
  expect(art.truncated).toBe(true);
  expect(art.items.length).toBeLessThanOrEqual(20000);
  expect(readSvgFile(svg('<rect width="1" height="1"/>')).truncated).toBe(false);
});

test('a switch draws its first child that can be drawn, past what needs an extension', () => {
  const art = readSvgFile(svg('<switch><foreignObject requiredExtensions="http://ns.adobe.com/AdobeIllustrator/10.0/" width="1" height="1"/><g><rect width="10" height="10"/></g></switch>'));
  expect(art.items).toHaveLength(1);
  expect(art.left.size).toBe(0);
});

test('a miter limit is kept to 100 at most', () => {
  const art = readSvgFile(svg('<path d="M0 0L10 10" stroke="red"/>', 'viewBox="0 0 10 10" style="stroke-miterlimit:200"'));
  expect(art.items[0].miter).toBe(100);
});

test('not an SVG says so', () => {
  for (const text of ['', 'hello', '<html><body/></html>', '<svg xmlns="http://www.w3.org/2000/svg"><rect', '{"svg": 1}']) {
    let error;
    try { readSvgFile(text); } catch (e) { error = e; }
    expect(error?.userMessage, text).toMatch(/SVG/);
  }
});
