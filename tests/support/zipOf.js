// A .zip built in a test: entries are [name, text, { method }]; method 8 deflates, 0 stores.
const enc = new TextEncoder();
const u16 = (n) => [n & 255, (n >> 8) & 255];
const u32 = (n) => [...u16(n & 0xffff), ...u16(n >>> 16)];

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function zipOf(entries, { method = 8 } = {}) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text, own = {}] of entries) {
    const m = own.method ?? method;
    const raw = enc.encode(text);
    const data = m === 8 ? await deflate(raw) : raw;
    const nameBytes = enc.encode(name);
    const head = [...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(m), ...u32(0), ...u32(0),
      ...u32(data.length), ...u32(raw.length), ...u16(nameBytes.length), ...u16(0)];
    parts.push(new Uint8Array(head), nameBytes, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(m), ...u32(0), ...u32(0),
      ...u32(data.length), ...u32(raw.length), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(offset)]), nameBytes);
    offset += head.length + nameBytes.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(size), ...u32(offset), ...u16(0)]);
  return new Blob([...parts, ...central, end]);
}
