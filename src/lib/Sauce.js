const pad = (text, length) => {
  const bytes = new Uint8Array(length);
  bytes.fill(32);
  bytes.set(Buffer.from(text, 'utf-8'), 0);
  return bytes;
};

export class Sauce {
  constructor(file, opts) {
    this.cols = file.cols;
    this.rows = file.rows;

    this.dataType = opts.dataType || 1;
    this.fileType = opts.fileType || 0;
    this.fileSize = opts.fileSize || 0;

    this.title = opts.title;
    this.author = opts.author;
    this.group = opts.group;
    this.date = opts.date || new Date().toLocaleDateString('sv').replaceAll('-', '');

    this.iceColors = opts.iceColors || true;
    this.use9pxFont = opts.use9pxFont || false;
    this.fontName = opts.fontName || 'IBM VGA';
    this.comments = opts.comments || '';
  }

  appendTo(fileBytes) {
    const sauceBytes = this.#asBytes();
    const merged = new Int8Array(fileBytes.length + 1 + sauceBytes.length);
    merged.set(fileBytes, 0);
    merged[fileBytes.length] = 26;
    merged.set(sauceBytes, fileBytes.length + 1);

    return merged;
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
    output[93] = this.fileSize >> 24;

    output[94] = this.dataType;
    if (this.dataType === 5) { // BIN files
      output[95] = this.cols / 2;
    } else {
      output[95] = this.fileType;
      output[96] = this.cols & 0xff;
      output[97] = this.cols >> 8;
      output[98] = this.rows & 0xff;
      output[99] = this.rows >> 8;
    }

    if (this.dataType === 6) { // XBIN files
    } else {
      output[105] = (this.iceColors) ? 1 : 0;
      output[105] += (this.use9pxFont) ? 1 << 2 : 1 << 1;

      // if (doc.font_name) {
      //   add_text(bytes, 106, doc.font_name, doc.font_name.length);
      // }
    }

    // if (doc.comments.length) bytes = add_comments_bytes(doc.comments, bytes);

    return output;
  }
}