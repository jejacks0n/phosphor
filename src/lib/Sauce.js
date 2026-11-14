/**
 * Generates and appends SAUCE (Standard Architecture for Universal Comment Extensions)
 * metadata records to ANSI files, and reads them back.
 */
import { CP437, cp437Byte, cp437Substitute } from './Cp437.js';

// What a record holds of each text field, in characters: comments are 255 lines of 64, and the line ends between them.
const MOST_COMMENT_LINES = 255, COMMENT_WIDTH = 64;
export const SAUCE_WIDTHS = { title: 35, author: 20, group: 20, date: 8, fontName: 20, comments: MOST_COMMENT_LINES * (COMMENT_WIDTH + 1) };

// What SAUCE text can't hold: control characters (C0, tab and ESC among them, DEL and C1), which a terminal printing
// the file would act on. A comment's line breaks are its lines (lines: true), so they stay, CR LF and CR as LF.
export const sauceText = (text, lines = false) => (lines ? text.replace(/\r\n?/g, '\n').replace(/[^\P{Cc}\n]/gu, '') : text.replace(/\p{Cc}/gu, ''));

// Characters as the record counts them: one byte each, so one a code point (an emoji is one).
export const charCount = (text) => [...text].length;

// A field after an edit (typing, a paste, IME's committed text): what went in before the caret is kept as far as the
// field's width allows, from its start; the rest is left out and named, so nothing is cut without a word. Gives the
// text, the caret after what went in, what was left out ('' when nothing), and whether clean took anything out.
export function fitField(before, after, caret, width, clean = (text) => text) {
  const tail = after.slice(caret);
  let start = 0;
  const most = Math.max(0, Math.min(caret, before.length - tail.length));
  while (start < most && before[start] === after[start]) start++;
  if (start && /[\uD800-\uDBFF]/.test(after[start - 1])) start--; // not inside an emoji
  const head = after.slice(0, start), raw = after.slice(start, caret), inserted = [...clean(raw)];
  const room = Math.max(0, width - charCount(head) - charCount(tail));
  const kept = inserted.slice(0, room).join('');
  return { text: head + kept + tail, caret: head.length + kept.length, left: inserted.slice(room).join(''), stripped: inserted.join('') !== raw };
}

// SAUCE text is CP437, one byte a character, space-padded (the font name, a ZString, NUL-padded).
const cut = (text, width) => [...sauceText(text ?? '')].slice(0, width).join('');
const pad = (text, length, fill = 32) => {
  const bytes = new Uint8Array(length).fill(fill);
  [...cut(text, length)].forEach((char, i) => { bytes[i] = cp437Byte(cp437Substitute(char)); });
  return bytes;
};

// A record: what a field given holds, as far as its width (an opened file's empty date or font stays empty), and its
// flags and size when given; what isn't given is Phosphor's own. The text fields are what's written.
export class Sauce {
  constructor(file, opts) {
    this.cols = opts.width ?? file.cols;
    this.rows = opts.height ?? file.rows;

    this.dataType = opts.dataType || 1;
    this.fileType = opts.fileType || 1;
    this.fileSize = opts.fileSize || 0;

    this.title = cut(opts.title, SAUCE_WIDTHS.title);
    this.author = cut(opts.author, SAUCE_WIDTHS.author);
    this.group = cut(opts.group, SAUCE_WIDTHS.group);
    this.date = cut(opts.date ?? new Date().toLocaleDateString('sv').replaceAll('-', ''), SAUCE_WIDTHS.date);

    // Phosphor's own flags: iCE colors (bit 0), and 8 or 9 pixel letter spacing (bits 1 and 2).
    this.flags = opts.flags ?? (1 | (opts.use9pxFont ? 4 : 2));
    this.fontName = cut(opts.fontName ?? 'IBM VGA', SAUCE_WIDTHS.fontName);

    // Process comments into chunks a line wide
    this.comments = this.#processComments(opts.comments);
  }

  #processComments(input) {
    if (!input) return [];
    const lines = Array.isArray(input) ? input : [input];
    const processed = [];
    // A line longer than a comment line breaks at its last space that fits; only a word longer than a line is split.
    lines.forEach(line => {
      let rest = sauceText(line);
      while (rest.length > COMMENT_WIDTH) {
        const space = rest.lastIndexOf(' ', COMMENT_WIDTH);
        processed.push(rest.slice(0, space > 0 ? space : COMMENT_WIDTH));
        rest = rest.slice(space > 0 ? space + 1 : COMMENT_WIDTH);
      }
      processed.push(rest); // a blank line stays
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

// The characters a record's text can't hold in CP437, of what's written (each field cut at its width, the comments
// at 255 lines, as the export cuts them): what each is written as and the fields it's in, in field order and as each
// first appears. What the export dialog lists.
const LISTED = ['title', 'author', 'group', 'comments'];
export function sauceUnmappable(fields) {
  const sauce = new Sauce({}, fields), found = new Map();
  for (const field of LISTED) {
    for (const char of [...[sauce[field]].flat().join('')]) {
      if (cp437Substitute(char) === char) continue;
      const entry = found.get(char) ?? { char, as: cp437Substitute(char), fields: [] };
      if (!entry.fields.includes(field)) entry.fields.push(field);
      found.set(char, entry);
    }
  }
  return [...found.values()];
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
// flags, its size, and the grid's size (cols, lines) it was opened at; 'none' for a file with no record.
export const keptRecord = (sauce, cols, lines) => (sauce ? [sauce.flags, sauce.width, sauce.height, cols, lines].join(' ') : 'none');

// The kept record's fields to write again: its flags, and its size while the grid is still the size it was opened
// at (a resize changes what the size describes). Null when there's no kept record.
export function keptFields(text, cols, lines) {
  const numbers = text ? text.split(' ').map(Number) : [];
  if (numbers.length !== 5 || !numbers.every(Number.isInteger)) return null;
  const [flags, width, height, keptCols, keptLines] = numbers;
  return { flags, ...(cols === keptCols && lines === keptLines && { width, height }) };
}
