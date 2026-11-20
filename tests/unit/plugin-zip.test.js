import { it, expect } from 'vitest';
import { readZip } from '../../src/plugins/zip.js';

const enc = new TextEncoder();
const u16 = (n) => [n & 255, (n >> 8) & 255];
const u32 = (n) => [...u16(n & 0xffff), ...u16(n >>> 16)];

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// entries: [name, text, { method }]; lieSize is the size the headers claim for every entry.
async function zipOf(entries, { method = 8, flags = 0, lieSize } = {}) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text, own = {}] of entries) {
    const m = own.method ?? method;
    const raw = enc.encode(text);
    const data = m === 8 ? await deflate(raw) : raw;
    const nameBytes = enc.encode(name);
    const size = lieSize ?? raw.length;
    const head = [...u32(0x04034b50), ...u16(20), ...u16(flags), ...u16(m), ...u32(0), ...u32(0),
      ...u32(data.length), ...u32(size), ...u16(nameBytes.length), ...u16(0)];
    parts.push(new Uint8Array(head), nameBytes, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(flags), ...u16(m), ...u32(0), ...u32(0),
      ...u32(data.length), ...u32(size), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(offset)]), nameBytes);
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
