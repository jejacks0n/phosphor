// The solver registry: refs, stand-in reasons, option values and failures.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  allOf, brushFor, failFilter, failSolver, failureOf, filterFailureOf, filterFor, onFilterFailure, onScriptDropped, pluginShapeFor,
  isSolverRef, onSolverFailure, optionValues, pluginOfSolver, registerScript, scriptOptions, solverFor,
  solverRef, standInOf, unregisterScript,
} from '@/plugins/solvers';

const def = {
  id: 'edges', styles: ['ansi'],
  options: [
    { id: 'threshold', kind: 'slider', min: 0, max: 100, step: 1, default: 40 },
    { id: 'thin', kind: 'checkbox', default: true },
    { id: 'set', kind: 'choice', choices: ['a', 'b'], default: 0 },
  ],
};
const ref = solverRef('phosphor.outlines', 'edges');
afterEach(() => unregisterScript('phosphor.outlines'));

describe('refs', () => {
  it('are plugin:<plugin>/<solver>', () => {
    expect(ref).toBe('plugin:phosphor.outlines/edges');
    expect(isSolverRef(ref)).toBe(true);
    expect(isSolverRef('dark')).toBe(false);
    expect(pluginOfSolver(ref)).toBe('phosphor.outlines');
    expect(pluginOfSolver('bestMatch')).toBeNull();
  });
});

describe('registry', () => {
  it('finds a registered solver and nothing else', () => {
    expect(solverFor(ref)).toBeNull();
    registerScript('phosphor.outlines', 'h1', { solvers: [def] });
    expect(solverFor(ref)).toEqual({ def, hash: 'h1', pluginId: 'phosphor.outlines' });
    expect(solverFor(solverRef('phosphor.outlines', 'nope'))).toBeNull();
    unregisterScript('phosphor.outlines');
    expect(solverFor(ref)).toBeNull();
  });
});

describe('standInOf', () => {
  const ok = { ref, renderStyle: 'ansi', inRoom: false, pluginsOff: false, pluginState: () => 'on' };
  it('gives the reasons, in order', () => {
    registerScript('phosphor.outlines', 'h', { solvers: [def] });
    expect(standInOf(ok)).toBeNull();
    expect(standInOf({ ...ok, inRoom: true, pluginsOff: true, pluginState: () => 'absent' })).toBe('room');
    expect(standInOf({ ...ok, pluginsOff: true, pluginState: () => 'absent' })).toBe('pluginsOff');
    expect(standInOf({ ...ok, pluginState: () => 'absent' })).toBe('missing');
    expect(standInOf({ ...ok, pluginState: () => 'off' })).toBe('off');
    expect(standInOf({ ...ok, ref: solverRef('phosphor.outlines', 'nope') })).toBe('missing');
    expect(standInOf({ ...ok, renderStyle: 'ascii' })).toBe('style');
    failSolver(ref, 'boom');
    expect(standInOf(ok)).toBe('failed');
  });
  it('says missing for a plugin with nothing registered', () => {
    expect(standInOf(ok)).toBe('missing');
  });
});

describe('optionValues', () => {
  it('uses defaults for missing, mistyped, out of range and unknown', () => {
    expect(optionValues(def, { threshold: 140, thin: 'yes', set: 1, gone: 2 })).toEqual({ threshold: 40, thin: true, set: 1 });
    expect(optionValues(def, { threshold: 70, thin: false, set: 2 })).toEqual({ threshold: 70, thin: false, set: 0 });
    expect(optionValues(def, { set: 0.5 }).set).toBe(0);
    expect(optionValues(def, undefined)).toEqual({ threshold: 40, thin: true, set: 0 });
  });
});

describe('color options', () => {
  const tinted = { ...def, options: [...def.options, { id: 'tint', kind: 'color', default: '#112233' }] };
  it('keep a stored hex and replace anything else with the default', () => {
    expect(optionValues(tinted, { tint: '#00ff00' }).tint).toBe('#00ff00');
    expect(optionValues(tinted, { tint: 'green' }).tint).toBe('#112233');
    expect(optionValues(tinted, { tint: '#00FF00' }).tint).toBe('#112233');
  });
  it('reach a script as { r, g, b }, other values as they are', () => {
    const got = scriptOptions(tinted, { threshold: 7, tint: '#ff8000' });
    expect(got).toEqual({ threshold: 7, tint: { r: 255, g: 128, b: 0 } });
    expect(Object.isFrozen(got) && Object.isFrozen(got.tint)).toBe(true);
  });
});

describe('failures', () => {
  it('are reported to listeners and cleared when the plugin registers again', () => {
    registerScript('phosphor.outlines', 'h', { solvers: [def] });
    const listener = vi.fn();
    const stop = onSolverFailure(listener);
    failSolver(ref, 'boom');
    expect(listener).toHaveBeenCalledWith(ref, 'boom');
    expect(failureOf(ref)).toBe('boom');
    registerScript('phosphor.outlines', 'h2', { solvers: [def] });
    expect(failureOf(ref)).toBeNull();
    stop();
    failSolver(ref, 'again');
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it('from a script no longer registered are ignored, unheard', () => {
    registerScript('phosphor.outlines', 'h1', { solvers: [def] });
    const listener = vi.fn();
    const stop = onSolverFailure(listener);
    registerScript('phosphor.outlines', 'h2', { solvers: [def] }); // a Reload while the old script's resolve ran
    failSolver(ref, 'old', 'h1');
    expect(failureOf(ref)).toBeNull();
    expect(listener).not.toHaveBeenCalled();
    failSolver(ref, 'new', 'h2');
    expect(failureOf(ref)).toBe('new');
    expect(listener).toHaveBeenCalledWith(ref, 'new');
    stop();
  });
});

describe('the other kinds', () => {
  const brush = { id: 'dab', name: 'Dab' }, shape = { id: 'star', name: 'Star' }, filter = { id: 'glow', name: 'Glow', passes: ['x'] };
  const parts = { brushes: [brush], shapes: [shape], filters: [filter] };

  it('are found by their own lookup only, and listed with their index', () => {
    registerScript('phosphor.outlines', 'h', parts);
    expect(brushFor(solverRef('phosphor.outlines', 'dab')).def).toBe(brush);
    expect(pluginShapeFor(solverRef('phosphor.outlines', 'star')).def).toBe(shape);
    expect(filterFor(solverRef('phosphor.outlines', 'glow'))).toEqual({ def: filter, hash: 'h', pluginId: 'phosphor.outlines' });
    expect(filterFor(solverRef('phosphor.outlines', 'dab'))).toBeNull();
    expect(allOf('brushes')).toEqual([[solverRef('phosphor.outlines', 'dab'), 'phosphor.outlines', brush, 0]]);
    expect(allOf('solvers')).toEqual([]);
  });

  it('go together on unregister, which tells onScriptDropped', () => {
    const heard = vi.fn();
    const stop = onScriptDropped(heard);
    registerScript('phosphor.outlines', 'h', parts);
    unregisterScript('phosphor.outlines');
    stop();
    expect(heard).toHaveBeenCalledWith('phosphor.outlines');
    expect(brushFor(solverRef('phosphor.outlines', 'dab'))).toBeNull();
    expect(allOf('filters')).toEqual([]);
  });

  it('a filter failure is heard and kept, a stale hash is not, and a new registration clears it', () => {
    const heard = vi.fn();
    const stop = onFilterFailure(heard);
    const glow = solverRef('phosphor.outlines', 'glow');
    registerScript('phosphor.outlines', 'h', parts);
    failFilter(glow, { log: 'old' }, 'stale');
    expect(heard).not.toHaveBeenCalled();
    failFilter(glow, { log: 'bad' });
    stop();
    expect(heard).toHaveBeenCalledWith(glow, { log: 'bad' });
    expect(filterFailureOf(glow)).toEqual({ log: 'bad' });
    registerScript('phosphor.outlines', 'h2', parts);
    expect(filterFailureOf(glow)).toBeNull();
  });
});
