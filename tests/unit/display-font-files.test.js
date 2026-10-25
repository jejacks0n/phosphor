// The fonts we build (src/assets/fonts/make-display-fonts.py) carry their copyright and license
// inside the font, so they travel with it wherever the site serves it (the OFL asks that of Unifont).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

// A WOFF2 font's tables, decompressed into one buffer (in the order its directory lists them).
function woff2Tables(path) {
  const file = readFileSync(new URL(`../../src/assets/fonts/${path}`, import.meta.url));
  assert.equal(file.toString('latin1', 0, 4), 'wOF2');
  const numTables = file.readUInt16BE(12), compressedLength = file.readUInt32BE(20);
  let at = 48;
  const base128 = () => {
    let value = 0, byte;
    do {
      byte = file[at++];
      value = value * 128 + (byte & 0x7f);
    } while (byte & 0x80);
    return value;
  };
  for (let i = 0; i < numTables; i++) {
    const flags = file[at++], tag = flags & 0x3f, transform = flags >> 6;
    if (tag === 0x3f) at += 4; // a tag spelled out
    base128(); // its length
    const glyfOrLoca = tag === 10 || tag === 11;
    if (glyfOrLoca ? transform === 0 : transform !== 0) base128(); // its transformed length
  }
  return brotliDecompressSync(file.subarray(at, at + compressedLength));
}

// Whether the name table holds this text (in the Mac or the Windows encoding).
const holds = (tables, text) => tables.includes(Buffer.from(text, 'latin1')) || tables.includes(Buffer.from(text, 'utf16le').swap16());

test('The fonts we build carry their copyright and license', () => {
  const unifont = woff2Tables('unifont.woff2');
  assert.ok(holds(unifont, 'Copyright © 1998-2025 Roman Czyborra, Paul Hardy'), 'Unifont copyright');
  assert.ok(holds(unifont, 'SIL Open Font License, Version 1.1'), 'Unifont license');
  assert.ok(holds(unifont, 'https://openfontlicense.org'), 'Unifont license URL');
  const unscii = woff2Tables('unscii-16.woff2');
  assert.ok(holds(unscii, 'Unscii by viznut'), 'Unscii author');
  assert.ok(holds(unscii, 'public domain'), 'Unscii license');
});
