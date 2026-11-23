import { describe, it, expect } from 'vitest';
import { matches, keysFor, keyLabel, accelerator, parseKey } from '../../src/lib/keymap.js';

describe('matches', () => {
  it('takes a code part by e.code, modifiers exactly', () => {
    const e = { code: 'KeyN', key: '˜', altKey: true, shiftKey: true };
    expect(matches(e, 'Shift+Alt+KeyN')).toBe(true);
    expect(matches({ ...e, ctrlKey: true }, 'Shift+Alt+KeyN')).toBe(false);
    expect(matches({ ...e, shiftKey: false }, 'Shift+Alt+KeyN')).toBe(false);
  });

  it('resolves Mod through the platform', () => {
    const e = { key: 's', code: 'KeyS' };
    expect(matches({ ...e, metaKey: true }, 'Mod+KeyS', { mac: true })).toBe(true);
    expect(matches({ ...e, ctrlKey: true }, 'Mod+KeyS', { mac: false })).toBe(true);
    expect(matches({ ...e, ctrlKey: true }, 'Mod+KeyS', { mac: true })).toBe(false);
    expect(matches({ ...e, metaKey: true }, 'Mod+KeyS', { mac: false })).toBe(false);
  });

  it('leaves Shift to a symbol key value, but not to a code', () => {
    expect(matches({ key: '?', shiftKey: true }, '?')).toBe(true);
    expect(matches({ key: '[' }, '[')).toBe(true);
    expect(matches({ key: '{', shiftKey: true, code: 'BracketLeft' }, '[')).toBe(false);
    expect(matches({ key: '{', shiftKey: true, code: 'BracketLeft' }, 'Shift+BracketLeft')).toBe(true);
  });

  it('takes letters case-insensitively and compares Shift', () => {
    expect(matches({ key: 'D', shiftKey: true }, 'Shift+D')).toBe(true);
    expect(matches({ key: 'd' }, 'Shift+D')).toBe(false);
    expect(matches({ key: 'Escape' }, 'Escape')).toBe(true);
    expect(matches({ key: 'Escape', shiftKey: true }, 'Escape')).toBe(false);
  });
});

describe('parseKey', () => {
  it('splits modifiers from the part, and reads a + key', () => {
    expect(parseKey('Shift+Mod+KeyS')).toEqual({ mod: true, ctrl: false, alt: false, shift: true, code: 'KeyS' });
    expect(parseKey('Mod++')).toMatchObject({ mod: true, key: '+' });
  });
});

describe('keysFor', () => {
  it('picks a platform, and wraps a string', () => {
    const keys = { mac: ['Ctrl+Alt+ArrowUp'], other: ['Ctrl+ArrowUp'] };
    expect(keysFor(keys, { mac: true })).toEqual(['Ctrl+Alt+ArrowUp']);
    expect(keysFor(keys, { mac: false })).toEqual(['Ctrl+ArrowUp']);
    expect(keysFor('KeyA')).toEqual(['KeyA']);
    expect(keysFor(['KeyA', 'KeyB'])).toEqual(['KeyA', 'KeyB']);
  });
});

describe('labels', () => {
  it('writes each platform its own way', () => {
    expect(keyLabel('Shift+Alt+KeyN', { mac: false })).toBe('Shift+Alt+N');
    expect(keyLabel('Shift+Alt+KeyN', { mac: true })).toBe('⌥⇧N');
    expect(keyLabel('Alt+BracketRight', { mac: false })).toBe('Alt+]');
    expect(keyLabel('Mod+ArrowUp', { mac: true })).toBe('⌘↑');
    expect(keyLabel('Digit1', { mac: false })).toBe('1');
  });

  it('writes Electron accelerators', () => {
    expect(accelerator('Shift+Mod+KeyS')).toBe('Shift+CmdOrCtrl+S');
    expect(accelerator('Alt+ArrowUp')).toBe('Alt+Up');
  });
});
