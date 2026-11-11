/**
 * Generates and appends SAUCE (Standard Architecture for Universal Comment Extensions)
 * metadata records to ANSI files, and reads them back.
 */
import { CP437, cp437Byte, cp437Substitute } from './Cp437.js';

// What a record holds of each text field, in characters: comments are 255 lines of 64, and the line ends between them.
const MOST_COMMENT_LINES = 255, COMMENT_WIDTH = 64;
export const SAUCE_WIDTHS = { title: 35, author: 20, group: 20, date: 8, fontName: 20, comments: MOST_COMMENT_LINES * (COMMENT_WIDTH + 1) };

// SAUCE text is CP437, one byte a character, space-padded (the font name, a ZString, NUL-padded).
const pad = (text, length, fill = 32) => {
  const bytes = new Uint8Array(length).fill(fill);
  [...(text ?? '')].slice(0, length).forEach((char, i) => { bytes[i] = cp437Byte(cp437Substitute(char)); });
  return bytes;
};

// An opened file's record as it comes out again: what a field given holds, written as is (an empty date or font
// stays empty), and its flags and size when given; what isn't given is Phosphor's own.
export class Sauce {
  constructor(file, opts) {
    this.cols = opts.width ?? file.cols;
    this.rows = opts.height ?? file.rows;

    this.dataType = opts.dataType || 1;
    this.fileType = opts.fileType || 1;
    this.fileSize = opts.fileSize || 0;

    this.title = opts.title || '';
    this.author = opts.author || '';
    this.group = opts.group || '';
    this.date = opts.date ?? new Date().toLocaleDateString('sv').replaceAll('-', '');

    // Phosphor's own flags: iCE colors (bit 0), and 8 or 9 pixel letter spacing (bits 1 and 2).
    this.flags = opts.flags ?? (1 | (opts.use9pxFont ? 4 : 2));
    this.fontName = opts.fontName ?? 'IBM VGA';

    // Process comments into chunks a line wide
    this.comments = this.#processComments(opts.comments);
  }

  #processComments(input) {
    if (!input) return [];
    const lines = Array.isArray(input) ? input : [input];
    const processed = [];
    lines.forEach(line => {
      if (!line.length) processed.push(''); // a blank line stays
      for (let i = 0; i < line.length; i += COMMENT_WIDTH) {
        processed.push(line.substring(i, i + COMMENT_WIDTH));
      }
    });
    return processed.slice(0, MOST_COMMENT_LINES);
  }

  appendTo(fileBytes) {
    const sauceRecord = this.#asBytes();
    const commentBlock = this.#commentsAsBytes();

    // Final structure: [EOF] [Comment Block (Optional)] [SAUCE Record]
    const totalLength = fileBytes.length + 1 + commentBlock.length + sauceRecord.length;
    const merged = new Uint8Array(totalLength);

    let offset = 0;
    merged.set(fileBytes, offset);
    offset += fileBytes.length;

    merged[offset] = 26; // EOF char (0x1A)
    offset += 1;

    if (commentBlock.length) {
      merged.set(commentBlock, offset);
      offset += commentBlock.length;
    }

    merged.set(sauceRecord, offset);

    return merged;
  }

  #commentsAsBytes() {
    if (!this.comments.length) return new Uint8Array(0);

    const output = new Uint8Array(5 + (this.comments.length * COMMENT_WIDTH));
    output.set(pad('COMNT', 5), 0);

    for (let i = 0; i < this.comments.length; i++) {
      output.set(pad(this.comments[i], COMMENT_WIDTH), 5 + (i * COMMENT_WIDTH));
    }
    return output;
  }

  #asBytes() {
    let output = new Uint8Array(128);
    output.set(pad('SAUCE00', 7), 0);
    output.set(pad(this.title, SAUCE_WIDTHS.title), 7);
    output.set(pad(this.author, SAUCE_WIDTHS.author), 42);
    output.set(pad(this.group, SAUCE_WIDTHS.group), 62);
    output.set(pad(this.date, SAUCE_WIDTHS.date), 82);

    output[90] = this.fileSize & 0xff;
    output[91] = (this.fileSize >> 8) & 0xff;
    output[92] = (this.fileSize >> 16) & 0xff;
    output[93] = (this.fileSize >> 24) & 0xff;

    output[94] = this.dataType;
    output[95] = this.fileType;
    output[96] = this.cols & 0xff;
    output[97] = (this.cols >> 8) & 0xff;
    output[98] = this.rows & 0xff;
    output[99] = (this.rows >> 8) & 0xff;

    output[105] = this.flags;

    output.set(pad(this.fontName, SAUCE_WIDTHS.fontName, 0), 106);

    // Number of comments
    output[104] = this.comments.length;

    return output;
  }
}

// Reading: the record is the last 128 bytes, and its comment block sits just before it.
const RECORD_SIZE = 128;
const ascii = (bytes, at, text) => [...text].every((char, i) => bytes[at + i] === char.charCodeAt(0));
const recordStart = (bytes) => (bytes.length >= RECORD_SIZE && ascii(bytes, bytes.length - RECORD_SIZE, 'SAUCE00') ? bytes.length - RECORD_SIZE : -1);

// Where the comment block starts, or -1 when the record counts none or the count doesn't fit.
const commentsStart = (bytes, record) => {
  const start = record - 5 - bytes[record + 104] * COMMENT_WIDTH;
  return bytes[record + 104] && start >= 0 && ascii(bytes, start, 'COMNT') ? start : -1;
};

// A text field: CP437, without the spaces and NULs it's padded with.
const field = (bytes, from, to) => {
  let end = to;
  while (end > from && (bytes[end - 1] === 32 || bytes[end - 1] === 0)) end--;
  return Array.from(bytes.subarray(from, end), (byte) => CP437[byte]).join('');
};

// Where the art stops: the first 0x1A before the comment block or the record, else where they start, else the end.
// (A 0x1A inside the record, a width of 26 say, is not the end of the art.)
export function artEndOf(bytes) {
  const record = recordStart(bytes);
  const comments = record < 0 ? -1 : commentsStart(bytes, record);
  const limit = comments >= 0 ? comments : record >= 0 ? record : bytes.length;
  const eof = bytes.subarray(0, limit).indexOf(0x1a);
  return eof >= 0 ? eof : limit;
}

export function readSauce(bytes) {
  const record = recordStart(bytes);
  if (record < 0) return null;
  const at = (offset) => record + offset;
  const comments = commentsStart(bytes, record);
  const count = comments >= 0 ? bytes[at(104)] : 0;
  const flags = bytes[at(105)];
  return {
    title: field(bytes, at(7), at(42)),
    author: field(bytes, at(42), at(62)),
    group: field(bytes, at(62), at(82)),
    date: field(bytes, at(82), at(90)),
    comments: Array.from({ length: count }, (_, i) => field(bytes, comments + 5 + i * COMMENT_WIDTH, comments + 5 + (i + 1) * COMMENT_WIDTH)),
    dataType: bytes[at(94)],
    fileType: bytes[at(95)],
    width: bytes[at(96)] | (bytes[at(97)] << 8),
    height: bytes[at(98)] | (bytes[at(99)] << 8),
    flags,
    iceColors: !!(flags & 1),
    use9pxFont: (flags & 6) === 4,
    fontName: field(bytes, at(106), at(126)),
    artEnd: artEndOf(bytes),
  };
}

// What an opened file's record holds that the SAUCE tab doesn't show, as the setting keeps it (sauceRecord): its
// flags, its size, and the grid's size (cols, lines) it was opened at.
export const keptRecord = ({ flags, width, height }, cols, lines) => [flags, width, height, cols, lines].join(' ');

// The kept record's fields to write again: its flags, and its size while the grid is still the size it was opened
// at (a resize changes what the size describes). Null when there's no kept record.
export function keptFields(text, cols, lines) {
  const numbers = text ? text.split(' ').map(Number) : [];
  if (numbers.length !== 5 || !numbers.every(Number.isInteger)) return null;
  const [flags, width, height, keptCols, keptLines] = numbers;
  return { flags, ...(cols === keptCols && lines === keptLines && { width, height }) };
}
