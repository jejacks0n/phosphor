/**
 * Generates and appends SAUCE (Standard Architecture for Universal Comment Extensions)
 * metadata records to ANSI files, including a comment block for Phosphor settings.
 */
import { cp437Byte, cp437Substitute } from './Cp437.js';

// What a record holds of each text field, in characters: comments are 255 lines of 64, and the line ends between them.
const MOST_COMMENT_LINES = 255, COMMENT_WIDTH = 64;
export const SAUCE_WIDTHS = { title: 35, author: 20, group: 20, date: 8, fontName: 20, comments: MOST_COMMENT_LINES * (COMMENT_WIDTH + 1) };

// SAUCE text is CP437, one byte a character, space-padded.
const pad = (text, length) => {
  const bytes = new Uint8Array(length).fill(32);
  [...(text ?? '')].slice(0, length).forEach((char, i) => { bytes[i] = cp437Byte(cp437Substitute(char)); });
  return bytes;
};

export class Sauce {
  constructor(file, opts) {
    this.cols = file.cols;
    this.rows = file.rows;

    this.dataType = opts.dataType || 1;
    this.fileType = opts.fileType || 1;
    this.fileSize = opts.fileSize || 0;

    this.title = opts.title || '';
    this.author = opts.author || '';
    this.group = opts.group || '';
    this.date = opts.date || new Date().toLocaleDateString('sv').replaceAll('-', '');

    this.use9pxFont = opts.use9pxFont || false;
    this.fontName = opts.fontName || 'IBM VGA';

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

    // Flags: Bit 0 is iCE Colors. We always set it to 1.
    let flags = 1;
    flags |= (this.use9pxFont) ? (1 << 2) : (1 << 1);
    output[105] = flags;

    output.set(pad(this.fontName, SAUCE_WIDTHS.fontName), 106);

    // Number of comments
    output[104] = this.comments.length;

    return output;
  }
}
