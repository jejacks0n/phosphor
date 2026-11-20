import { ManifestError } from './manifest.js';

// Reads the wanted files out of a .zip with the browser's own inflater. `want(path)` is the most
// bytes that path may have, or 0 to skip it. Throws ManifestError: badZip, zipEncrypted, zip64, tooBig.
export async function readZip(blob, want) {
  const tail = new Uint8Array(await blob.slice(Math.max(0, blob.size - 65557)).arrayBuffer());
  const tv = new DataView(tail.buffer);
  let at = tail.length - 22;
  while (at >= 0 && tv.getUint32(at, true) !== 0x06054b50) at--;
  if (at < 0) throw new ManifestError('badZip');
  const count = tv.getUint16(at + 10, true);
  const size = tv.getUint32(at + 12, true);
  const start = tv.getUint32(at + 16, true);
  if (count === 0xffff || size === 0xffffffff || start === 0xffffffff) throw new ManifestError('zip64');
  if (start + size > blob.size) throw new ManifestError('badZip');

  const dir = new Uint8Array(await blob.slice(start, start + size).arrayBuffer());
  const dv = new DataView(dir.buffer);
  const found = new Map();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > dir.length || dv.getUint32(p, true) !== 0x02014b50) throw new ManifestError('badZip');
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const packed = dv.getUint32(p + 20, true);
    const length = dv.getUint32(p + 24, true);
    const nameLength = dv.getUint16(p + 28, true);
    const next = p + 46 + nameLength + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(dir.subarray(p + 46, p + 46 + nameLength));
    p = next;
    const cap = want(name);
    if (!(cap > 0)) continue;
    if (flags & 1) throw new ManifestError('zipEncrypted');
    if (length > cap || (method === 0 && packed > cap)) throw new ManifestError('tooBig');
    if (method !== 0 && method !== 8) throw new ManifestError('badZip');
    const lh = new DataView(await blob.slice(local, local + 30).arrayBuffer());
    if (lh.byteLength < 30 || lh.getUint32(0, true) !== 0x04034b50) throw new ManifestError('badZip');
    const from = local + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    const body = blob.slice(from, from + packed);
    if (body.size !== packed) throw new ManifestError('badZip');
    found.set(name, method === 0 ? new Uint8Array(await body.arrayBuffer()) : await inflate(body, cap));
  }
  return found;
}

async function inflate(body, cap) {
  const reader = body.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > cap) {
        reader.cancel().catch(() => {});
        throw new ManifestError('tooBig');
      }
      chunks.push(value);
    }
  } catch (error) {
    throw error instanceof ManifestError ? error : new ManifestError('badZip');
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}
