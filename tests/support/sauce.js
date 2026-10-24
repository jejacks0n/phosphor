// A SAUCE record read back from an exported file (the last 128 bytes, and the comment block before
// it), as the fields Sauce.js writes.
const text = (bytes) => new TextDecoder().decode(bytes).replace(/ +$/, '');

export function readSauce(bytes) {
  const record = bytes.subarray(bytes.length - 128);
  if (text(record.subarray(0, 7)) !== 'SAUCE00') throw new Error('no SAUCE record');
  const u16 = (at) => record[at] | (record[at + 1] << 8);
  const count = record[104];
  const block = bytes.subarray(bytes.length - 128 - 5 - count * 64, bytes.length - 128);
  if (count && text(block.subarray(0, 5)) !== 'COMNT') throw new Error('no comment block');
  const flags = record[105];
  return {
    title: text(record.subarray(7, 42)),
    author: text(record.subarray(42, 62)),
    group: text(record.subarray(62, 82)),
    date: text(record.subarray(82, 90)),
    fileSize: record[90] | (record[91] << 8) | (record[92] << 16) | (record[93] << 24),
    dataType: record[94],
    fileType: record[95],
    width: u16(96),
    height: u16(98),
    comments: Array.from({ length: count }, (_, i) => text(block.subarray(5 + i * 64, 5 + (i + 1) * 64))),
    iceColors: !!(flags & 1),
    letterSpacing: { 2: 8, 4: 9 }[flags & 6] ?? null,
    fontName: text(record.subarray(106, 126)).replace(/\0+$/, ''),
  };
}
