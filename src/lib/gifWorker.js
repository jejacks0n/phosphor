// The GIF export's work off the page (GifFile's gifFile asks it): { width, height, samples } picks the palette from
// the sampled frames' pixels, each { rgba, delayCs } after is a frame indexed and written, answered { written: true },
// and { finish: true } is answered with the file's { bytes }.
import quantize from './Quantizer.js';
import { gifWriter, indexer } from './GifEncoder.js';

let writer, palette, index;
self.onmessage = ({ data }) => {
  if (data.samples) {
    const all = new Uint8ClampedArray(data.samples.reduce((sum, rgba) => sum + rgba.length, 0));
    data.samples.reduce((at, rgba) => { all.set(rgba, at); return at + rgba.length; }, 0);
    palette = quantize(all, 256);
    index = indexer(palette);
    writer = gifWriter(data.width, data.height);
    self.postMessage({ ready: true });
  } else if (data.rgba) {
    writer.frame(index(data.rgba), palette, data.delayCs);
    self.postMessage({ written: true });
  } else {
    const bytes = writer.finish();
    self.postMessage({ bytes }, [bytes.buffer]);
  }
};
