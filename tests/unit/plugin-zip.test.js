import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readZip } from '../../src/plugins/zip.js';

const enc = new TextEncoder();
const u16 = (n) => [n & 255, (n >> 8) & 255];
const u32 = (n) => [...u16(n & 0xffff), ...u16(n >>> 16)];

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// entries: [name, text, { method, data, local }]: data the bytes stored in place of the text's (packed by method), local
// the local header's offset the directory claims; lieSize is the size the headers claim for every entry.
async function zipOf(entries, { method = 8, flags = 0, lieSize } = {}) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text, own = {}] of entries) {
    const m = own.method ?? method;
    const raw = enc.encode(text);
    const data = own.data ?? (m === 8 ? await deflate(raw) : raw);
    const nameBytes = enc.encode(name);
    const size = lieSize ?? raw.length;
    const head = [...u32(0x04034b50), ...u16(20), ...u16(flags), ...u16(m), ...u32(0), ...u32(0),
      ...u32(data.length), ...u32(size), ...u16(nameBytes.length), ...u16(0)];
    parts.push(new Uint8Array(head), nameBytes, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(flags), ...u16(m), ...u32(0), ...u32(0),
      ...u32(data.length), ...u32(size), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(own.local ?? offset)]), nameBytes);
    offset += head.length + nameBytes.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(size), ...u32(offset), ...u16(0)]);
  return new Blob([...parts, ...central, end]);
}

const zip64Of = () => new Blob([new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(0xffff), ...u16(0xffff),
  ...u32(0xffffffff), ...u32(0xffffffff), ...u16(0)])]);

it('reads the wanted entries, stored or deflated, and skips the rest', async () => {
  const zip = await zipOf([['a/phosphor-plugin.json', '{}'], ['a/x.js', 'export default {}', { method: 0 }], ['a/big.bin', 'x'.repeat(9999)]]);
  const got = await readZip(zip, (p) => (p.endsWith('.bin') ? 0 : 1000));
  expect([...got.keys()].sort()).toEqual(['a/phosphor-plugin.json', 'a/x.js']);
  expect(new TextDecoder().decode(got.get('a/x.js'))).toBe('export default {}');
});
it('stops a wanted entry past its cap, declared or while inflating', async () => {
  await expect(readZip(await zipOf([['m.json', 'x'.repeat(2000)]]), () => 1000)).rejects.toMatchObject({ code: 'tooBig' });
  await expect(readZip(await zipOf([['m.json', 'x'.repeat(2000)]], { lieSize: 10 }), () => 1000)).rejects.toMatchObject({ code: 'tooBig' });
});
it('refuses encrypted, zip64 and broken files', async () => {
  await expect(readZip(await zipOf([['m.json', '{}']], { flags: 1 }), () => 99)).rejects.toMatchObject({ code: 'zipEncrypted' });
  await expect(readZip(zip64Of(), () => 99)).rejects.toMatchObject({ code: 'zip64' });
  await expect(readZip(new Blob(['not a zip']), () => 99)).rejects.toMatchObject({ code: 'badZip' });
});
it('takes an entry\'s name as it is, never as a path: .. and a leading slash are only characters of it', async () => {
  const names = ['../phosphor-plugin.json', '/phosphor-plugin.json', 'a/../../x.js'];
  const asked = [];
  const got = await readZip(await zipOf(names.map((name) => [name, name])), (name) => (asked.push(name), 99));
  expect(asked).toEqual(names);
  expect([...got].map(([name, bytes]) => [name, new TextDecoder().decode(bytes)])).toEqual(names.map((name) => [name, name]));
});
it('refuses a deflate stream that is broken, a local header that is not where the directory says, and an unknown method', async () => {
  const reserved = new Uint8Array([0x07, 0x00]); // a last block of the reserved type
  await expect(readZip(await zipOf([['m.json', '{}', { data: reserved }]]), () => 99)).rejects.toMatchObject({ code: 'badZip' });
  await expect(readZip(await zipOf([['m.json', '{}', { local: 1 }]]), () => 99)).rejects.toMatchObject({ code: 'badZip' });
  await expect(readZip(await zipOf([['m.json', '{}', { local: 1 << 20 }]]), () => 99)).rejects.toMatchObject({ code: 'badZip' });
  await expect(readZip(await zipOf([['m.json', '{}', { method: 12 }]]), () => 99)).rejects.toMatchObject({ code: 'badZip' }); // bzip2
});
it('the example plugin\'s .zip holds the files of its folder, byte for byte, as GitHub makes one', async () => {
  const fixture = (path) => new Uint8Array(readFileSync(new URL(`../fixtures/plugins/${path}`, import.meta.url)));
  const names = [];
  const got = await readZip(new Blob([fixture('outlines.zip')]), (name) => (names.push(name), 1 << 20));
  expect(names).toEqual(['phosphor-outlines-main/', 'phosphor-outlines-main/phosphor-plugin.json', 'phosphor-outlines-main/outlines.js']);
  for (const file of ['phosphor-plugin.json', 'outlines.js']) expect(got.get(`phosphor-outlines-main/${file}`), file).toEqual(fixture(`outlines/${file}`));
});
