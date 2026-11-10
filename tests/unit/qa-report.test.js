// The report a QA run writes: plain Markdown, the score first, findings worst first.
import { test, expect } from 'vitest';
import { slug, renderReport } from '../qa/report.js';

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

test('warnings from the event counts show under their step', () => {
  const text = renderReport(run({ steps: [step('Sneaky', 'keys', { events: { keys: 0, pointers: 2 } })] }));
  expect(text).toMatch(/Sneaky[\s\S]*pointer/i);
});
