import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, statSync } from 'node:fs';

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
    expect(names(searchLibrary(index, { tags: ['chars:cp437', 'shape:8x8'] }))).toEqual(['Frog']);
    expect(names(searchLibrary(index, { tags: ['ready'] }))).toEqual(['Beta']);
    expect(names(searchLibrary(index, { tags: ['machine:IBM PC', 'machine:C64'] }))).toEqual(['alpha', 'Beta']); // one group widens
    expect(names(searchLibrary(index, { tags: ['shape:8x8', 'shape:8x16', 'chars:cp437'] }))).toEqual(['Beta', 'Frog']); // two narrow
    expect(searchLibrary(index, { query: 'alpha', tags: ['shape:8x16'] })).toEqual([]);
    expect(tagsOf(index.linked[0], index).map((t) => t.key)).not.toContain('collection:undefined');
    expect(tagsOf(index.fonts[0], index).map((t) => t.key)).toEqual(['machine:IBM PC', 'shape:8x16', 'chars:cp437', 'collection:viler', 'ready']);
    const { machine, ...noMachine } = index.fonts[0]; // a font whose folder names no machine
    expect(machine).toBe('IBM PC');
    expect(tagsOf(noMachine).map((t) => t.key)).toEqual(['shape:8x16', 'chars:cp437', 'collection:viler', 'ready']);
  });

  it('shape tags are width × height, and an entry with no width is 8 wide', async () => {
    const { tagsOf } = await mod();
    expect(tagsOf({ width: 7, height: 7, chars: 'cp437' }).map((t) => t.key)).toContain('shape:7x7');
    expect(tagsOf({ height: 8, chars: 'cp437' }).map((t) => t.key)).toContain('shape:8x8');
  });

  it('counts each tag across the whole library', async () => {
    const { tagCounts } = await mod();
    const c = tagCounts(index);
    expect(c.get('shape:8x8')).toBe(2);
    expect(c.get('shape:8x16')).toBe(1);
    expect(c.get('chars:cp437')).toBe(2);
    expect(c.get('chars:petscii')).toBe(1);
    expect(c.get('ready')).toBe(1);
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

  it('a font that can\'t be fetched (a 404, or no network) rejects with words a person can read', async () => {
    const said = "Phosphor couldn't fetch alpha from the font library. Check your connection and try again.";
    for (const fetchMock of [vi.fn().mockResolvedValue({ ok: false, status: 404 }), vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))]) {
      vi.stubGlobal('fetch', fetchMock);
      const { libraryFile } = await mod();
      const error = await libraryFile(index.fonts[1]).catch((e) => e);
      expect(error.message).toBe(said);
      expect(error.userMessage).toBe(said);
    }
  });

  it('fetches a font whose stored name has a space or a % in it, each part encoded', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(256 * 16) });
    vi.stubGlobal('fetch', fetchMock);
    const { libraryFile } = await mod();
    await libraryFile({ name: 'DKY#001', file: 'viler/BIGPILE/DKY%23001.F16', height: 16 });
    await libraryFile({ name: 'PETSCII shifted', file: 'moebius/c64/PETSCII shifted.F16', height: 16 });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/fonts/library/viler/BIGPILE/DKY%2523001.F16', '/fonts/library/moebius/c64/PETSCII%20shifted.F16']);
  });

  // The dev server and the preview read an address as decodeURI does, which leaves %26 (&), %2B (+) and %23 (#) as they
  // are: a file stored under such a name is never found, and the page comes back in its place.
  it('every font in the library is stored under a name its address reaches, at the size its entry says', async () => {
    const { libraryUrl } = await mod();
    const root = new URL('../../public/fonts/library/', import.meta.url);
    const { fonts } = JSON.parse(readFileSync(new URL('index.json', root), 'utf8'));
    const lost = fonts.filter((f) => decodeURI(libraryUrl(f.file)) !== `/fonts/library/${f.file}`
      || statSync(new URL(libraryUrl(f.file).slice('/fonts/library/'.length), root), { throwIfNoEntry: false })?.size !== 256 * f.height);
    expect(lost.map((f) => f.id)).toEqual([]);
  });

  it('builds the license issue URL', async () => {
    const { tellUsUrl } = await mod();
    const u = new URL(tellUsUrl(index.fonts[1], index));
    expect(u.origin + u.pathname).toBe('https://github.com/jejacks0n/phosphor/issues/new');
    expect(u.searchParams.get('title')).toBe('License for alpha (Mœbius)');
  });
});

describe('SAUCE font names', () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (n) => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(n) });
  const names = { 'Amiga Topaz 1+': { file: 'moebius/amiga/T.F16', name: 'TopazPlus a500', height: 16 } };

  it("sauceFont('IBM VGA') is null and fetches nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { sauceFont } = await mod();
    expect(await sauceFont('IBM VGA')).toBeNull();
    expect(await sauceFont('')).toBeNull();
    expect(await sauceFont(undefined)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches the map once and returns the mapped font as a File, or null for a name it lacks', async () => {
    const fetchMock = vi.fn(async (url) => (url.endsWith('sauce.json') ? { ok: true, json: async () => names } : reply(4096)));
    vi.stubGlobal('fetch', fetchMock);
    const { sauceFont } = await mod();
    expect((await sauceFont('Amiga Topaz 1+')).name).toBe('TopazPlus a500.F16');
    expect(await sauceFont('Nobody 9')).toBeNull();
    await sauceFont('Amiga Topaz 1+');
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('sauce.json'))).toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/fonts/library/sauce.json');
  });

  it('refetches the map after a failure', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const { sauceFont } = await mod();
    await expect(sauceFont('Amiga Topaz 1+')).rejects.toThrow();
    expect(await sauceFont('Amiga Topaz 1+')).toBeNull();
  });
});
