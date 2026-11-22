import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { SHIPPED, useColorLibraryStore } from '@/store/ColorLibraryStore.js';

const KEY = 'phosphor.colorFavorites';
const fresh = () => { setActivePinia(createPinia()); return useColorLibraryStore(); };
const pal = (slug, extra = {}) => ({ slug, name: slug.toUpperCase(), author: 'Ann', colors: ['#000000', '#ffffff'], ...extra });

beforeEach(() => localStorage.removeItem(KEY));
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem(KEY); });

describe('favorite color palettes', () => {
  it('ships the set', () => {
    expect(SHIPPED.length).toBe(29);
  });

  it('★ keeps a palette at the front and takes it out again; keeping one already kept moves it to the front', () => {
    const store = fresh();
    store.toggle(pal('a'));
    store.toggle(pal('b'));
    expect(store.kept.map(p => p.slug)).toEqual(['b', 'a']);
    expect(store.has('a')).toBe(true);
    store.keep(pal('a'));
    expect(store.kept.map(p => p.slug)).toEqual(['a', 'b']);
    store.toggle(pal('a'));
    expect(store.kept.map(p => p.slug)).toEqual(['b']);
    expect(store.has('a')).toBe(false);
  });

  it('favorites are kept in this browser with their colors', async () => {
    fresh().toggle(pal('a', { colors: ['#123456', '#abcdef'] }));
    await nextTick(); // the browser's copy is written after the change
    const again = fresh();
    expect(again.kept).toEqual([{ slug: 'a', name: 'A', author: 'Ann', colors: ['#123456', '#abcdef'] }]);
  });

  it('what the browser holds that isn\'t a favorite is left out', () => {
    localStorage.setItem(KEY, '"text"');
    expect(fresh().kept).toEqual([]);
    const big = Array.from({ length: 300 }, () => '#000000');
    localStorage.setItem(KEY, JSON.stringify([
      1, null, { slug: 'x' },
      { slug: 'Bad Slug', name: 'n', colors: ['#000000'] },
      { slug: 'ok', name: 'Ok', colors: ['#000000'] },
      { slug: 'big', name: 'Big', colors: big },
      { slug: 'hash', name: 'H', colors: ['000000'] },
    ]));
    expect(fresh().kept).toEqual([{ slug: 'ok', name: 'Ok', author: '', colors: ['#000000'] }]);
  });

  it('cuts long names and authors at 100', () => {
    localStorage.setItem(KEY, JSON.stringify([{ slug: 'ok', name: 'n'.repeat(150), author: 'a'.repeat(150), colors: ['#000000'] }]));
    const [p] = fresh().kept;
    expect([p.name.length, p.author.length]).toEqual([100, 100]);
  });

  it('keep stores only a sound palette: a long name cut to 100, one with no colors not at all', () => {
    const store = fresh();
    store.keep(pal('long', { name: 'n'.repeat(500) }));
    expect(store.favorites.map(p => p.name.length)).toEqual([100]);
    store.keep(pal('none', { colors: [] }));
    store.toggle(pal('none', { colors: [] }));
    expect(store.favorites.map(p => p.slug)).toEqual(['long']);
  });

  it('two entries with one slug are one favorite, the first', () => {
    localStorage.setItem(KEY, JSON.stringify([
      { slug: 'ok', name: 'First', colors: ['#000000'] },
      { slug: 'ok', name: 'Second', colors: ['#ffffff'] },
    ]));
    expect(fresh().kept.map(p => p.name)).toEqual(['First']);
  });

  it('with storage blocked, the store still works and keeps nothing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = fresh();
    expect(store.kept).toEqual([]);
    expect(() => store.toggle(pal('a'))).not.toThrow();
  });
});
