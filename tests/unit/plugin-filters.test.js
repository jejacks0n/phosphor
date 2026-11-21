// A plugin filter's values as a drawing keeps them (plugins/filters.js): only those off their defaults, a stranger's
// cleaned to what's well formed, and the settings column's groups with what state each is in.
import { describe, expect, it } from 'vitest';
import { cleanFilterOptions, filterEntry, filterGroups, runningFilters } from '@/plugins/filters';
import { solverRef } from '@/plugins/solvers';

const ABERRATION = {
  id: 'aberration', name: 'Aberration', passes: ['return pixel(vec2(0.0));'],
  options: [
    { id: 'distance', kind: 'slider', name: 'Distance', min: 0, max: 10, step: 1, default: 0 },
    { id: 'tint', kind: 'color', name: 'Tint', default: '#ff0000' },
    { id: 'wide', kind: 'checkbox', name: 'Wide', default: false },
  ],
};
const SAME = { id: 'same', name: 'Same', passes: ['return pixel(vec2(0.0));'], options: [] };
const ref = solverRef('jane.fx', 'aberration');

describe('filterEntry', () => {
  it('is null with every option at its default', () => {
    expect(filterEntry(ABERRATION, 'Aberration', { distance: 0, tint: '#ff0000', wide: false })).toBeNull();
  });

  it('keeps only the values off their defaults', () => {
    expect(filterEntry(ABERRATION, 'Aberration', { distance: 3, tint: '#ff0000', wide: false }))
      .toEqual({ name: 'Aberration', values: { distance: 3 } });
  });
});

describe('cleanFilterOptions', () => {
  const good = { name: 'Aberration', values: { distance: 3, tint: '#00ff00', wide: true } };

  it('keeps a good entry exactly', () => {
    expect(cleanFilterOptions({ [ref]: good })).toEqual({ [ref]: good });
  });

  it('drops a bad ref, a long name, a value that isn\'t one, and too many values', () => {
    const thirteen = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`v${i}`, i]));
    expect(cleanFilterOptions({
      aberration: good,
      [solverRef('jane.fx', 'long')]: { name: 'x'.repeat(41), values: { distance: 1 } },
      [solverRef('jane.fx', 'red')]: { name: 'Red', values: { tint: 'red' } },
      [solverRef('jane.fx', 'many')]: { name: 'Many', values: thirteen },
      [ref]: good,
    })).toEqual({ [ref]: good });
  });

  it('drops a ref of the wrong shape: a plugin id or an id the readers wouldn\'t take, or one too long', () => {
    for (const bad of ['plugin:/x', 'plugin:jane/x', 'plugin:jane.fx/', 'plugin:jane.fx/Up', 'plugin:jane.fx/a/b', 'plugin:Jane.fx/x',
      `plugin:jane.fx/${'a'.repeat(41)}`, `plugin:${'a'.repeat(62)}.fx/x`]) {
      expect(cleanFilterOptions({ [bad]: good }), bad).toEqual({});
    }
  });

  it('keeps a ref at the longest the readers allow', () => {
    const longest = solverRef(`${'a'.repeat(61)}.fx`, 'b'.repeat(40));
    expect(cleanFilterOptions({ [longest]: good })).toEqual({ [longest]: good });
  });

  it('keeps 64 entries and drops a 65th', () => {
    const raw = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [solverRef('jane.fx', `f${i}`), good]));
    const kept = cleanFilterOptions(raw);
    expect(Object.keys(kept)).toHaveLength(64);
    expect(kept[solverRef('jane.fx', 'f64')]).toBeUndefined();
  });

  it('is empty for what isn\'t an object', () => {
    expect(cleanFilterOptions(null)).toEqual({});
    expect(cleanFilterOptions([good])).toEqual({});
  });
});

describe('filterGroups', () => {
  const sameRef = solverRef('jane.fx', 'same');
  const installed = [
    { ref, pluginId: 'jane.fx', hash: 'h1', def: ABERRATION },
    { ref: sameRef, pluginId: 'jane.fx', hash: 'h1', def: SAME },
  ];
  const on = () => 'on';
  const groups = (fields) => filterGroups({ saved: {}, installed, pluginState: on, pluginsOff: false, failures: {}, ...fields });

  it('lists the installed in order, at their defaults idle', () => {
    expect(groups().map(({ ref: r, name, state, values }) => [r, name, state, values])).toEqual([
      [ref, 'Aberration', 'idle', { distance: 0, tint: '#ff0000', wide: false }],
      [sameRef, 'Same', 'idle', {}],
    ]);
  });

  it('is on with a value off its default', () => {
    const [first] = groups({ saved: { [ref]: { name: 'Aberration', values: { distance: 4 } } } });
    expect(first).toMatchObject({ ref, pluginId: 'jane.fx', hash: 'h1', state: 'on', values: { distance: 4, tint: '#ff0000', wide: false } });
  });

  it('follows the installed with the saved ones that aren\'t, by name, missing with their saved values', () => {
    const saved = {
      [solverRef('bob.fx', 'zoom')]: { name: 'Zoom', values: { amount: 2 } },
      [solverRef('ann.fx', 'glow')]: { name: 'Glow', values: { soft: true } },
    };
    expect(groups({ saved }).slice(2)).toEqual([
      { ref: solverRef('ann.fx', 'glow'), pluginId: 'ann.fx', hash: null, name: 'Glow', def: null, values: { soft: true }, state: 'missing' },
      { ref: solverRef('bob.fx', 'zoom'), pluginId: 'bob.fx', hash: null, name: 'Zoom', def: null, values: { amount: 2 }, state: 'missing' },
    ]);
  });

  it('says off for a plugin switched off, pluginsOff with ?plugins=off, failed for a failure', () => {
    const saved = { [solverRef('ann.fx', 'glow')]: { name: 'Glow', values: { soft: true } } };
    expect(groups({ saved, pluginState: (id) => (id === 'ann.fx' ? 'off' : 'on') })[2].state).toBe('off');
    expect(filterGroups({ saved, installed: [], pluginState: on, pluginsOff: true, failures: {} })[0].state).toBe('pluginsOff');
    expect(groups({ failures: { [ref]: { log: 'oops' } } })[0].state).toBe('failed');
  });

  it('runs only the groups that are on, as the pipeline takes them', () => {
    const list = groups({ saved: { [ref]: { name: 'Aberration', values: { distance: 4 } } } });
    expect(runningFilters(list)).toEqual([
      { ref, pluginId: 'jane.fx', hash: 'h1', passes: ABERRATION.passes, options: ABERRATION.options, values: { distance: 4, tint: '#ff0000', wide: false } },
    ]);
  });
});
