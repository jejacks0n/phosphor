/**
 * Generates and appends SAUCE (Standard Architecture for Universal Comment Extensions) 
 * metadata records to ANSI files, including a comment block for Phosphor settings.
 */
import { Buffer } from 'buffer';

const pad = (text, length) => {
  const bytes = new Uint8Array(length);
  bytes.fill(32);
  if (text) {
    const textBytes = Buffer.from(text, 'utf-8');
    bytes.set(textBytes.slice(0, length), 0);
  }
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
    
    // Process comments into 64-char chunks
    this.comments = this.#processComments(opts.comments);
  }

  #processComments(input) {
    if (!input) return [];
    const lines = Array.isArray(input) ? input : [input];
    const processed = [];
    lines.forEach(line => {
      // Split long strings into 64-char chunks if necessary
      for (let i = 0; i < line.length; i += 64) {
        processed.push(line.substring(i, i + 64));
      }
    });
    return processed.slice(0, 255); // SAUCE max is 255 lines
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
    
    const output = new Uint8Array(5 + (this.comments.length * 64));
    output.set(Buffer.from('COMNT', 'utf-8'), 0);
    
    for (let i = 0; i < this.comments.length; i++) {
      output.set(pad(this.comments[i], 64), 5 + (i * 64));
    }
    return output;
  }

  #asBytes() {
    let output = new Uint8Array(128);
    output.set(pad('SAUCE00', 7), 0);
    output.set(pad(this.title, 35), 7);
    output.set(pad(this.author, 20), 42);
    output.set(pad(this.group, 20), 62);
    output.set(pad(this.date, 8), 82);

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

    output.set(pad(this.fontName, 20), 106);
    
    // Number of comments
    output[104] = this.comments.length;

    return output;
  }
}
