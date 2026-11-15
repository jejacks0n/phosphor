// Video export: frames drawn as the ANSI view draws them (GifFile's drawnCells), each pixel made 2×2 so the color a
// video keeps once per 2×2 block lands on one pixel and cell edges stay sharp, encoded by the browser (WebCodecs) into
// an MP4. H.264 where the browser encodes it, else VP9 (which MP4 holds too); a pixel a pixel where the browser won't
// encode the doubled size. mediabunny writes the file, loaded only when a video's made.
import { ctx2d } from './Canvas.js';
import { drawnCells } from './GifFile.js';

export const canExportVideo = () => typeof globalThis.VideoEncoder === 'function';

const CODECS = ['avc', 'vp9'];
const even = (n) => n + (n & 1); // what 4:2:0 color asks of a size

// The codec, scale and size the browser will encode a width × height drawing at, or null when none.
export async function videoSettings(width, height) {
  const { getFirstEncodableVideoCodec, QUALITY_VERY_HIGH } = await import('mediabunny');
  for (const scale of [2, 1]) {
    const size = { width: even(width * scale), height: even(height * scale) };
    const codec = await getFirstEncodableVideoCodec(CODECS, { ...size, quality: QUALITY_VERY_HIGH });
    if (codec) return { codec, scale, ...size };
  }
  return null;
}

// frames: each frame's cells, durations each one's milliseconds. The MP4's bytes, with progress told the share of frames
// encoded after each. Throws if there's no WebGL2 to draw with, or what unencodable throws when the browser can't
// encode a video this size.
export function videoFile(frames, cols, lines, durations, { smooth, unencodable, progress } = {}) {
  return drawnCells(cols, lines, { smooth }, async ({ width, height, draw }) => {
    const settings = await videoSettings(width, height);
    if (!settings) unencodable();
    const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_VERY_HIGH } = await import('mediabunny');
    const canvas = document.createElement('canvas');
    canvas.width = settings.width;
    canvas.height = settings.height;
    const ctx = ctx2d(canvas);
    ctx.imageSmoothingEnabled = false;
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    const source = new CanvasSource(canvas, { codec: settings.codec, quality: QUALITY_VERY_HIGH });
    output.addVideoTrack(source);
    await output.start();
    try {
      let at = 0;
      for (let i = 0; i < frames.length; i++) {
        ctx.drawImage(draw(frames[i]), 0, 0, width * settings.scale, height * settings.scale);
        await source.add(at / 1000, durations[i] / 1000);
        at += durations[i];
        progress?.((i + 1) / frames.length);
      }
      await output.finalize();
    } catch (error) {
      await output.cancel();
      throw error;
    }
    return new Uint8Array(target.buffer);
  });
}
