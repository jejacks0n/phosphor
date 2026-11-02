// An asciinema recording (asciicast v2): a header line, then a line [seconds, "o", text] per frame at the moment it
// starts, with only what differs from the frame before. A last event at the end makes the last frame last.
import { CellWriter, frameDiffBytes } from './AnsiFile.js';

const seconds = (t) => Number(t.toFixed(6));

export function castText(cols, rows, frames, durations, { colorMode = 'none' } = {}) {
  const writer = new CellWriter({ utf8: true, colorMode }), decoder = new TextDecoder();
  writer.sgr(0);
  writer.clear();
  const lines = [JSON.stringify({ version: 2, width: cols, height: rows })];
  let at = 0;
  frames.forEach((frame, i) => {
    frameDiffBytes(frames[i - 1] ?? null, frame, cols, writer);
    lines.push(JSON.stringify([seconds(at), 'o', decoder.decode(writer.take())]));
    at += durations[i];
  });
  writer.sgr(0);
  lines.push(JSON.stringify([seconds(at), 'o', decoder.decode(writer.take())]));
  return `${lines.join('\n')}\n`;
}
