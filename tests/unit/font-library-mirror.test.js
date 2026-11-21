import { describe, expect, it } from 'vitest';
import { aboutFor, parseAbout, planMirror } from '../../scripts/font-library.mjs';

const up = (...pairs) => pairs.map(([path, sha]) => ({ path, sha }));

describe('planMirror', () => {
  it('fetches a new path and a changed sha, keeps a same sha', () => {
    const plan = planMirror({
      upstream: up(['viler/A.F16', '1'], ['viler/B.F16', '2'], ['viler/C.F16', '3']),
      local: new Map([['viler/B.F16', 'old'], ['viler/C.F16', '3']]),
    });
    expect(plan.fetch).toEqual(['viler/A.F16', 'viler/B.F16']);
    expect(plan.keep).toEqual(['viler/C.F16']);
  });

  it('keeps a path only held locally, never deletes it', () => {
    const plan = planMirror({ upstream: [], local: new Map([['viler/GONE.F16', '9']]) });
    expect(plan).toEqual({ fetch: [], keep: ['viler/GONE.F16'] });
  });

  it('never fetches a skipped path or anything under moebius/viler/', () => {
    const plan = planMirror({
      upstream: up(['moebius/custom/FROGBLOCK.F08', '1'], ['moebius/viler/X.F16', '2'], ['moebius/custom/OK.F08', '3']),
      local: new Map(),
      skip: ['moebius/custom/FROGBLOCK.F08'],
    });
    expect(plan.fetch).toEqual(['moebius/custom/OK.F08']);
  });
});

describe('parseAbout', () => {
  const text = [
    ' * BIGPILE\\ - An assorted bunch of fonts',
    '              I accumulated.',
    '',
    ' * SOFTWARE\\ - Fonts collected:',
    '   |',
    '   +-- FE2\\      : FontEdit II set',
    '   |               by SEI Soft',
    '   +-- CAFE\\     : CAFE font editor',
    '',
    ' * PC-IBM\\ - IBM PC hardware fonts',
    '   |       - NOTE: some are 2x',
    '   + VGA8.F16      IBM VGA, 8x16',
  ].join('\n');

  it('reads folders with their continued descriptions', () => {
    const about = parseAbout(text);
    expect(about.BIGPILE).toBe('An assorted bunch of fonts I accumulated.');
    expect(about.FE2).toBe('FontEdit II set by SEI Soft');
    expect(about.CAFE).toBe('CAFE font editor');
    expect(about['PC-IBM']).toBe('IBM PC hardware fonts NOTE: some are 2x');
    expect(Object.keys(about)).not.toContain('VGA8.F16');
  });

  it('gives each path its deepest described folder', () => {
    const about = aboutFor(['viler/SOFTWARE/FE2/X.F16', 'viler/SOFTWARE/Y.F16', 'viler/TOP.F16', 'moebius/amiga/Z.f16'],
      { SOFTWARE: 'soft', FE2: 'fe2' });
    expect(about).toEqual({ 'viler/SOFTWARE/FE2/X.F16': 'fe2', 'viler/SOFTWARE/Y.F16': 'soft' });
  });
});
