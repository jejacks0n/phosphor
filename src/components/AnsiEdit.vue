<script>
import { mapState, mapWritableState, mapActions } from 'pinia';
import { useCurrentFileStore } from '@/store/CurrentFile';
import { hex2rgb, rgb2hex } from '@/lib/ColorUtils';
import { render as renderText } from '@/lib/TextRenderer';
import { getContext, calcMetrics } from '@/lib/AnsiRuntime';
import { applyInverseTransforms } from '@/lib/PixelTransforms';

export default {
  name: 'AnsiEdit',
  data() {
    return {
      picker: null, // { col, row, x, y } when char picker is open
      isPainting: false,
      mousePos: { x: 0, y: 0 },
      isMouseOver: false,
      metrics: null,
    };
  },
  props: {
    pipelineCanvas: {
      type: HTMLCanvasElement,
      required: false,
    },
    outputCanvas: {
      type: HTMLCanvasElement,
      required: false,
    },
  },
  computed: {
    ...mapState(useCurrentFileStore, [
      'blockData', 'cols', 'rows', 'activeTool', 'editBrushSize', 'chars',
      'brightness', 'contrast', 'saturation', 'hue', 'invert'
    ]),
    ...mapWritableState(useCurrentFileStore, ['editMode', 'editFgColor']),
    pickerChars() {
      if (!this.chars) return [];
      return [...new Set(this.chars.split(''))].filter(c => c.trim());
    },
    brushPreviewStyle() {
      if (!this.metrics) return { display: 'none' };
      const isEraser = this.activeTool === 'eraser';
      const isPencil = this.activeTool === 'pencil';
      const isChar = this.activeTool === 'char';
      const size = (isPencil || isChar) ? 1 : this.editBrushSize;
      const width = size * this.metrics.cellWidth;
      const height = size * (this.metrics.lineHeight / 2);
      return {
        width: `${width}px`,
        height: `${height}px`,
        left: `${this.mousePos.x}px`,
        top: `${this.mousePos.y}px`,
        display: this.isMouseOver && (this.activeTool === 'brush' || this.activeTool === 'eraser') ? 'block' : 'none',
        borderRadius: (isEraser || isPencil || isChar) ? '0' : '50%',
      };
    },
  },
  watch: {
    blockData() { this.queueRender(); },
    cols() { this.queueRender(); },
    rows() { this.queueRender(); },
  },
  mounted() {
    this.queueRender();
    this.editMode = true;
  },
  beforeUnmount() {
    this.editMode = false;
    if (this._renderFrame) cancelAnimationFrame(this._renderFrame);
  },
  methods: {
    ...mapActions(useCurrentFileStore, ['paintEditPixels', 'eraseEditPixels', 'setCharEdit', 'clearCharEditsAt', 'takeSnapshot', 'getRawColorAt']),

    queueRender() {
      if (this._renderFrame) return;
      this._renderFrame = requestAnimationFrame(() => {
        this._renderFrame = null;
        this.render();
      });
    },

    render() {
      if (!this.blockData || !this.blockData.length || !this.$refs.pre) return;

      if (!this.metrics) {
        this.metrics = calcMetrics(this.$refs.pre);
      }

      if (!this.metrics || this.metrics.cellWidth === 0 || this.metrics.lineHeight === 0) {
        this.metrics = null;
        this.queueRender();
        return;
      }

      const context = getContext({
        element: this.$refs.pre,
        cols: this.cols,
        rows: Math.floor(this.rows * 0.5),
      }, this.metrics);

      const buffer = [];
      for (let j = 0; j < context.rows; j++) {
        const offs = j * context.cols;
        for (let i = 0; i < context.cols; i++) {
          const idx = i + offs;
          const pixelI = j * context.cols * 2 + i;
          const bg = this.blockData[pixelI];
          const fg = this.blockData[pixelI + context.cols];

          if (bg && fg) {
            buffer[idx] = {
              char: bg.char,
              color: fg.hex,
              backgroundColor: bg.hex,
              fgIndex: fg.c,
              bgIndex: bg.c,
            };
          } else {
            buffer[idx] = { char: ' ' };
          }
        }
      }
      renderText(context, buffer);
    },

    pixelAt(event) {
      if (!this.metrics) return null;
      const rect = this.$refs.pre.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / this.metrics.cellWidth,
        y: (event.clientY - rect.top)  / (this.metrics.lineHeight / 2)
      };
    },

    pickColor(pos) {
      this.editFgColor = this.getRawColorAt(pos.x, pos.y);
    },

    startPaint(event) {
      if (!this.metrics) {
        this.metrics = calcMetrics(this.$refs.pre);
      }
      const pixel = this.pixelAt(event);
      if (!pixel) return;

      if (this.activeTool === 'picker') {
        event.preventDefault();
        event.stopPropagation();
        this.isPainting = true;
        this.pickColor(pixel);
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mouseup', this.commitPaint);
        return;
      }

      if (this.activeTool === 'char') {
        const col = Math.floor(pixel.x);
        const row = Math.floor(pixel.y / 2);
        this.picker = { col, row, x: event.clientX, y: event.clientY };
        return;
      }

      this.isPainting = true;
      this._lastPos = pixel;
      this.paintSegment(pixel, pixel);
      window.addEventListener('mousemove', this.onMouseMove);
      window.addEventListener('mouseup', this.commitPaint);
    },

    onMouseMove(event) {
      const rect = this.$refs.pre.getBoundingClientRect();
      const pixel = {
        x: (event.clientX - rect.left) / this.metrics.cellWidth,
        y: (event.clientY - rect.top)  / (this.metrics.lineHeight / 2)
      };
      this.mousePos = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      if (!this.isPainting) return;

      if (this.activeTool === 'picker') {
        this.pickColor(pixel);
        return;
      }

      const prev = this._lastPos || pixel;
      this._lastPos = pixel;
      this.paintSegment(prev, pixel);
    },

    commitPaint() {
      this.isPainting = false;
      this._lastPos = null;
      window.removeEventListener('mousemove', this.onMouseMove);
      window.removeEventListener('mouseup', this.commitPaint);
      this.takeSnapshot();
    },

    paintSegment(from, to) {
      if (this.activeTool === 'pencil' || this.activeTool === 'eraser') {
        const isEraser = this.activeTool === 'eraser';
        const size = isEraser ? this.editBrushSize : 1;
        const radius = Math.floor(size / 2);
        const isEven = size % 2 === 0;

        const positions = this.interpolatedPositions(from.x, from.y, to.x, to.y);
        const pixels = [];
        const seen = new Set();

        for (const { x, y } of positions) {
          const cx = Math.floor(x);
          const cy = Math.floor(y);

          for (let dy = -radius; dy <= (isEven ? radius - 1 : radius); dy++) {
            for (let dx = -radius; dx <= (isEven ? radius - 1 : radius); dx++) {
              const ix = cx + dx;
              const iy = cy + dy;
              if (ix < 0 || iy < 0 || ix >= this.cols || iy >= this.rows) continue;
              const key = `${ix},${iy}`;
              if (!seen.has(key)) {
                pixels.push({ x: ix, y: iy, alpha: 1 });
                seen.add(key);
              }
            }
          }
        }
        this.paintPixels(pixels);
      } else if (this.activeTool === 'brush') {
        const positions = this.interpolatedPositions(from.x, from.y, to.x, to.y);
        const pixels = [];
        const radius = this.editBrushSize;
        const seen = new Set();

        for (const { x, y } of positions) {
          const cx = Math.floor(x);
          const cy = Math.floor(y);

          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const ix = cx + dx;
              const iy = cy + dy;
              if (ix < 0 || iy < 0 || ix >= this.cols || iy >= this.rows) continue;

              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist <= radius) {
                const key = `${ix},${iy}`;
                if (!seen.has(key)) {
                  const alpha = 1 - (dist / radius);
                  pixels.push({ x: ix, y: iy, alpha: Math.pow(alpha, 1.5) });
                  seen.add(key);
                }
              }
            }
          }
        }
        this.paintPixels(pixels);
      }
    },

    interpolatedPositions(x0, y0, x1, y1) {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.ceil(dist * 2);
      if (steps === 0) return [{ x: x1, y: y1 }];
      const positions = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        positions.push({
          x: x0 + t * dx,
          y: y0 + t * dy,
        });
      }
      return positions;
    },

    paintPixels(pixels) {
      if (!this.pipelineCanvas || !this.outputCanvas) return;

      if (this.activeTool === 'eraser') {
        this.eraseEditPixels(pixels, this.pipelineCanvas, this.outputCanvas);
        this.clearCharEditsAt(pixels);
        return;
      }

      const rgb = hex2rgb(this.editFgColor);
      const pixelPayload = [];
      for (const { x, y, alpha } of pixels) {
        if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) continue;
        pixelPayload.push({ x, y, r: rgb.r, g: rgb.g, b: rgb.b, alpha });
      }
      if (pixelPayload.length) {
        this.paintEditPixels(pixelPayload, this.pipelineCanvas, this.outputCanvas);
      }
    },

    selectChar(char) {
      if (!this.picker) return;
      this.setCharEdit(this.picker.col, this.picker.row, char === 'ERASE' ? null : char);
      this.picker = null;
      this.takeSnapshot();
    },

    closePicker() {
      this.picker = null;
    },
  },
};
</script>

<template>
  <article
    :class="{ 
      'pencil-tool': activeTool === 'pencil' || activeTool === 'char',
      'picker-tool': activeTool === 'picker'
    }"
    @mouseenter="isMouseOver = true"
    @mouseleave="isMouseOver = false"
    @mousemove="onMouseMove"
  >
    <pre ref="pre" @mousedown="startPaint"></pre>
    <div class="brush-preview" :style="brushPreviewStyle"></div>

    <div
      v-if="picker"
      class="picker-backdrop"
      @mousedown="closePicker"
    ></div>

    <div
      v-if="picker"
      class="char-picker"
      :style="{ left: picker.x + 'px', top: picker.y + 'px' }"
      @mousedown.stop
    >
      <span
        class="char-option erase"
        title="Reset to original"
        @mousedown="selectChar('ERASE')"
      >⌫</span>
      <span
        class="char-option space"
        title="Space"
        @mousedown="selectChar(' ')"
      >␣</span>
      <span
        v-for="ch in pickerChars"
        :key="ch"
        class="char-option"
        @mousedown="selectChar(ch)"
      >{{ ch }}</span>
    </div>
  </article>
</template>

<style scoped>
article {
  margin: auto;
  position: relative;
  user-select: none;
  padding: 0;
}

pre {
  margin: 0;
  padding: 0;
  font-family: 'Simple Console', monospace;
  font-size: 1em;
  line-height: 1.2;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  white-space: pre;
  background: var(--surface-dark);
  outline: 2px dashed var(--border-light);
  cursor: none;
}

.pencil-tool pre {
  cursor: crosshair;
}

.picker-tool pre {
  cursor: crosshair;
}

.brush-preview {
  position: absolute;
  pointer-events: none;
  border: 1px solid var(--white);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 1px var(--black), inset 0 0 0 1px var(--black);
  z-index: 100;
}

.char-picker {
  position: fixed;
  z-index: 200;
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 8px;
  background: var(--surface-1);
  border: 1px solid var(--accent);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  max-width: 200px;
}

.char-option {
  font-family: 'Simple Console', monospace;
  font-size: 16px;
  line-height: 1;
  padding: 4px 6px;
  cursor: pointer;
  border-radius: 3px;
  color: var(--text);
  transition: background 0.1s;
}

.char-option:hover {
  background: var(--accent);
  color: var(--white);
}

.char-option.erase {
  color: var(--accent-hot);
  font-weight: bold;
}

.char-option.space {
  color: var(--accent-glow);
  font-weight: bold;
}

.char-option.erase:hover {
  background: var(--accent-hot);
  color: var(--white);
}

.char-option.space:hover {
  background: var(--accent-glow);
  color: var(--white);
}

.picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 199;
}
</style>
