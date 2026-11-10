// The report a QA run writes: plain Markdown, the score first, findings worst first.
import { test, expect } from 'vitest';
import { slug, renderReport, safeReport } from '../qa/report.js';

const run = (over = {}) => ({
  persona: 'maya', seed: 7, traits: { device: 'desktop', input: 'mouse' }, commit: 'abc1234', scriptCommit: 'def5678',
  machine: { os: 'macOS', cpu: 'M1', browser: 'Chromium 130', renderer: 'ANGLE (Apple M1)' },
  steps: [], findings: [], memory: [], snippets: [],
  ...over,
});
const step = (name, how, over = {}) => ({ name, rated: true, how, want: '', events: { keys: 1, pointers: 0 }, probes: [{ kind: 'again', note: 'twice' }], timings: [], shots: [], ...over });

test('a slug is a safe, short, non-empty file name', () => {
  expect(slug('Undo → redo / "twice"')).toBe('undo-redo-twice');
  expect(slug('../../etc')).toBe('etc');
  expect(slug('')).toBe('step');
  expect(slug('🎨🎨')).toBe('step');
  expect(slug('word '.repeat(40)).length).toBeLessThanOrEqual(60);
});

test('the report leads with the keyboard score, or says it is not rated', () => {
  expect(renderReport(run({ steps: [step('a', 'keys'), step('b', 'mouse', { events: { keys: 0, pointers: 1 } })] }))).toContain('Keyboard score: 50 / 100');
  expect(renderReport(run({ steps: [step('a', null, { rated: false })] }))).toContain('Keyboard score: not rated');
});

test('a finding shows all its parts, and findings run from blocker to polish', () => {
  const finding = (id, severity, extra = {}) => ({ id, kind: 'bug', severity, step: 'Paint', expected: `exp-${id}`, actual: `act-${id}`, repro: `repro-${id}`, shot: null, ...extra });
  const text = renderReport(run({ findings: [finding('p', 'polish'), finding('b', 'blocker', { kind: 'a11y' })] }));
  for (const part of ['a11y', 'blocker', 'Paint', 'exp-b', 'act-b', 'repro-b']) expect(text).toContain(part);
  expect(text.indexOf('exp-b')).toBeLessThan(text.indexOf('exp-p'));
});

test('a timing over its budget says over, and a step with no probes is listed', () => {
  const text = renderReport(run({ steps: [
    step('Slow', 'keys', { timings: [{ name: 'response', ms: 180, budget: 100, over: true }] }),
    step('Fast', 'keys', { timings: [{ name: 'response', ms: 40, budget: 100, over: false }], probes: [] }),
  ] }));
  expect(text).toMatch(/response.*180.*over/);
  expect(text).not.toMatch(/response.*40 ms.*over/);
  expect(text).toMatch(/No probes tried[\s\S]*Fast/);
});

test('a software renderer puts its warning before everything else', () => {
  const text = renderReport(run({ machine: { os: 'Linux', cpu: 'x', browser: 'Chromium', renderer: 'ANGLE (Google, Vulkan, SwiftShader)' } }));
  expect(text.startsWith('Software renderer: timings are not real')).toBe(true);
  expect(renderReport(run())).not.toContain('Software renderer');
});

test('a renderer that could not be read leads with a warning too', () => {
  for (const renderer of [undefined, '']) {
    const text = renderReport(run({ machine: { os: 'Linux', cpu: 'x', browser: 'Chromium', renderer } }));
    expect(text.startsWith('Renderer unknown: timings may not be real')).toBe(true);
  }
  expect(renderReport(run())).not.toContain('Renderer unknown');
});

test('warnings from the event counts show under their step', () => {
  const text = renderReport(run({ steps: [step('Sneaky', 'keys', { events: { keys: 0, pointers: 2 } })] }));
  expect(text).toMatch(/Warning: Rated keys but no keys reached the page/);
});

test('page errors and session warnings show under their own headings, with their steps', () => {
  const text = renderReport(run({
    pageErrors: [{ step: 'Paint', kind: 'console', text: 'Refused to connect' }],
    warnings: [{ step: null, text: 'Unhandled rejection: late' }],
  }));
  expect(text).toContain('## Page errors\n\n- Paint (console): Refused to connect');
  expect(text).toContain('## Session warnings\n\n- before any step: Unhandled rejection: late');
});

test('a report that cannot be written still says why, with the raw steps and findings', () => {
  const text = safeReport(run({ steps: [step('Lost', null)], findings: [{ id: 'F1', kind: 'bug' }] }));
  expect(text).toContain("The report couldn't be written: step \"Lost\" is rated but has no rating");
  expect(text).toContain('"name": "Lost"');
  expect(text).toContain('"id": "F1"');
  expect(safeReport(run())).toBe(renderReport(run()));
});

test('a page error seen more than once says how many times, and the ones not kept are counted', () => {
  const text = renderReport(run({ pageErrors: [{ step: 'Draw', kind: 'console', text: 'again', count: 3 }], droppedPageErrors: 12 }));
  expect(text).toContain('- Draw (console, 3 times): again\n- 12 more not kept');
});
