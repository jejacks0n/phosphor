import { describe, it, expect, vi, afterEach } from 'vitest';

const index = {
  version: 1,
  collections: { viler: { name: 'VileR' }, moebius: { name: 'Mœbius' } },
  fonts: [
    { id: 'viler/b.F16', fontId: 'bitmap-b', name: 'Beta', file: 'viler/b.F16', height: 16, collection: 'viler', machine: 'IBM PC', chars: 'cp437', ready: true },
    { id: 'moebius/a.F08', fontId: 'bitmap-a', name: 'alpha', file: 'moebius/a.F08', height: 8, collection: 'moebius', machine: 'C64', chars: 'petscii', ready: false, about: 'a Commodore classic' },
  ],
  linked: [{ id: 'linked/f', fontId: 'bitmap-f', name: 'Frog', height: 8, machine: 'Custom', chars: 'cp437', linked: { credit: 'c', url: 'u', license: 'l' } }],
};

const mod = async () => {
  vi.resetModules();
  return import('@/lib/fontLibrary.js');
};
const names = (l) => l.map((e) => e.name);

describe('font library', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('searches by name, machine and about, sorted by name', async () => {
    const { searchLibrary } = await mod();
    expect(names(searchLibrary(index, {}))).toEqual(['alpha', 'Beta', 'Frog']);
    expect(names(searchLibrary(index, { query: 'BET' }))).toEqual(['Beta']);
    expect(names(searchLibrary(index, { query: 'c64' }))).toEqual(['alpha']);
    expect(names(searchLibrary(index, { query: 'commodore' }))).toEqual(['alpha']);
  });

  it('narrows by tags, and no match gives []', async () => {
    const { searchLibrary, tagsOf } = await mod();
    expect(names(searchLibrary(index, { tags: ['chars:cp437'] }))).toEqual(['Beta', 'Frog']);
    expect(names(searchLibrary(index, { tags: ['chars:cp437', 'shape:8'] }))).toEqual(['Frog']);
    expect(names(searchLibrary(index, { tags: ['ready'] }))).toEqual(['Beta']);
    expect(searchLibrary(index, { query: 'alpha', tags: ['shape:16'] })).toEqual([]);
    expect(tagsOf(index.linked[0], index).map((t) => t.key)).not.toContain('collection:undefined');
    expect(tagsOf(index.fonts[0], index).map((t) => t.key)).toEqual(['machine:IBM PC', 'shape:16', 'chars:cp437', 'collection:viler', 'ready']);
  });

  it('counts tags among the current matches', async () => {
    const { tagCounts } = await mod();
    const c = tagCounts(index, { query: 'o' });
    expect(c.get('shape:8')).toBe(2);
    expect(c.get('shape:16')).toBeUndefined();
    const p = tagCounts(index, { tags: ['chars:cp437'] });
    expect(p.get('chars:cp437')).toBe(2);
    expect(p.get('chars:petscii')).toBeUndefined();
  });

  it('finds a linked font by fontId', async () => {
    const { libraryEntryOf } = await mod();
    expect(libraryEntryOf(index, 'bitmap-f').name).toBe('Frog');
    expect(libraryEntryOf(index, 'bitmap-a').name).toBe('alpha');
    expect(libraryEntryOf(index, 'nope')).toBeNull();
  });

  it('loads the index once and refetches after a failure', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, json: async () => index });
    vi.stubGlobal('fetch', fetchMock);
    const { loadLibrary } = await mod();
    await expect(loadLibrary()).rejects.toThrow();
    expect(await loadLibrary()).toBe(index);
    await loadLibrary();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('/fonts/library/index.json');
  });

  it('turns a 404 into a rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { loadLibrary } = await mod();
    await expect(loadLibrary()).rejects.toThrow();
  });

  it('fetches a font as a File and rejects a wrong length', async () => {
    const reply = (n) => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(n) });
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(256 * 8)).mockResolvedValueOnce(reply(100));
    vi.stubGlobal('fetch', fetchMock);
    const { libraryFile } = await mod();
    const file = await libraryFile(index.fonts[1]);
    expect(file.name).toBe('alpha.F08');
    expect(file.size).toBe(2048);
    expect(fetchMock.mock.calls[0][0]).toBe('/fonts/library/moebius/a.F08');
    await expect(libraryFile(index.fonts[1])).rejects.toThrow();
  });

  it('builds the license issue URL', async () => {
    const { tellUsUrl } = await mod();
    const u = new URL(tellUsUrl(index.fonts[1], index));
    expect(u.origin + u.pathname).toBe('https://github.com/jejacks0n/phosphor/issues/new');
    expect(u.searchParams.get('title')).toBe('License for alpha (Mœbius)');
  });
});
