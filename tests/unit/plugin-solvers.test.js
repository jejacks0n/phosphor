// The solver registry: refs, stand-in reasons, option values and failures.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  failSolver, failureOf, isSolverRef, onSolverFailure, optionValues, pluginOfSolver, registerSolvers, scriptOptions, solverFor,
  solverRef, standInOf, unregisterSolvers,
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
afterEach(() => unregisterSolvers('phosphor.outlines'));

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
    registerSolvers('phosphor.outlines', 'h1', [def]);
    expect(solverFor(ref)).toEqual({ def, hash: 'h1', pluginId: 'phosphor.outlines' });
    expect(solverFor(solverRef('phosphor.outlines', 'nope'))).toBeNull();
    unregisterSolvers('phosphor.outlines');
    expect(solverFor(ref)).toBeNull();
  });
});

describe('standInOf', () => {
  const ok = { ref, renderStyle: 'ansi', inRoom: false, pluginsOff: false, pluginState: () => 'on' };
  it('gives the reasons, in order', () => {
    registerSolvers('phosphor.outlines', 'h', [def]);
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
    registerSolvers('phosphor.outlines', 'h', [def]);
    const listener = vi.fn();
    const stop = onSolverFailure(listener);
    failSolver(ref, 'boom');
    expect(listener).toHaveBeenCalledWith(ref, 'boom');
    expect(failureOf(ref)).toBe('boom');
    registerSolvers('phosphor.outlines', 'h2', [def]);
    expect(failureOf(ref)).toBeNull();
    stop();
    failSolver(ref, 'again');
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it('from a script no longer registered are ignored, unheard', () => {
    registerSolvers('phosphor.outlines', 'h1', [def]);
    const listener = vi.fn();
    const stop = onSolverFailure(listener);
    registerSolvers('phosphor.outlines', 'h2', [def]); // a Reload while the old script's resolve ran
    failSolver(ref, 'old', 'h1');
    expect(failureOf(ref)).toBeNull();
    expect(listener).not.toHaveBeenCalled();
    failSolver(ref, 'new', 'h2');
    expect(failureOf(ref)).toBe('new');
    expect(listener).toHaveBeenCalledWith(ref, 'new');
    stop();
  });
});
