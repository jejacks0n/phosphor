// A small PNG writer for test fixtures (Node): RGBA, 8 or 16 bits per channel, with an optional
// iCCP colour-profile chunk. Deterministic: the same pixels always give the same bytes.
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};

// pixels: width x height RGBA values, 0-255 (bitDepth 8) or 0-65535 (bitDepth 16), row-major.
// iccp: { name, profile: Buffer } to embed a colour profile.
export function writePng({ width, height, pixels, bitDepth = 8, iccp = null }) {
  const bytesPerSample = bitDepth / 8, stride = width * 4 * bytesPerSample;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    for (let i = 0; i < width * 4; i++) {
      const v = pixels[y * width * 4 + i], o = y * (stride + 1) + 1 + i * bytesPerSample;
      if (bitDepth === 16) raw.writeUInt16BE(v, o);
      else raw[o] = v;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = 6; // RGBA
  const chunks = [chunk('IHDR', ihdr)];
  if (iccp) chunks.push(chunk('iCCP', Buffer.concat([Buffer.from(iccp.name, 'latin1'), Buffer.from([0, 0]), deflateSync(iccp.profile)])));
  chunks.push(chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}
