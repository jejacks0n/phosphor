<script>
import { mapState, mapWritableState, mapActions } from 'pinia';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { hex2rgb } from '@/lib/ColorUtils';
import { render as renderText } from '@/lib/TextRenderer';
import { getContext, calcMetrics } from '@/lib/AnsiRuntime';
import { floodFill } from '@/lib/FloodFill';

export default {
  name: 'AnsiEdit',
  data() {
    return {
      picker: null, // { col, row, x, y } when char picker is open
      isPainting: false,
      mousePos: { x: 0, y: 0 },
      isMouseOver: false,
      metrics: null,
      flippedCells: new Set(), // Set of "col,row" strings
      lastTouchDistance: null,
      lastTouchCenter: null,
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
    ...mapState(useProjectStore, [
      'blockData', 'cols', 'rows', 'chars',
      'brightness', 'contrast', 'saturation', 'hue', 'invert'
    ]),
    ...mapState(useWorkspaceStore, [
      'activeTool',
      'editBrushSize',
      'editBrushOpacity',
      'editBrushFlow',
      'editBrushHardness',
      'editFillTolerance',
      'editFillContiguous'
    ]),
    ...mapWritableState(useWorkspaceStore, ['editMode', 'editFgColor', 'editZoom']),
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
        display: this.isMouseOver && (this.activeTool === 'brush' || this.activeTool === 'eraser' || this.activeTool === 'char') ? 'block' : 'none',
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
    this.resetToolToHand();
  },
  beforeUnmount() {
    this.editMode = false;
    if (this._renderFrame) cancelAnimationFrame(this._renderFrame);
  },
  methods: {
    ...mapActions(useProjectStore, ['paintEditPixels', 'eraseEditPixels', 'setCharEdit', 'clearCharEditsAt', 'takeSnapshot', 'getRawColorAt', 'flipAnsiColors']),
    ...mapActions(useWorkspaceStore, ['setEditZoom', 'resetToolToHand']),

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
      const clientX = event.touches ? event.touches[0].clientX : event.clientX;
      const clientY = event.touches ? event.touches[0].clientY : event.clientY;
      return {
        x: (clientX - rect.left) / this.metrics.cellWidth,
        y: (clientY - rect.top)  / (this.metrics.lineHeight / 2)
      };
    },

    pickColor(pos) {
      this.editFgColor = this.getRawColorAt(pos.x, pos.y, this.outputCanvas);
    },

    startPaint(event) {
      if (!this.metrics) {
        this.metrics = calcMetrics(this.$refs.pre);
      }
      const pixel = this.pixelAt(event);
      if (!pixel) return;

      if (this.activeTool === 'hand') {
        this.isPainting = true;
        this._lastMousePos = {
          x: event.touches ? event.touches[0].clientX : event.clientX,
          y: event.touches ? event.touches[0].clientY : event.clientY
        };
        if (event.type === 'mousedown') {
          window.addEventListener('mousemove', this.onMouseMove);
          window.addEventListener('mouseup', this.commitPaint);
        }
        return;
      }

      if (this.activeTool === 'flip') {
        const col = Math.floor(pixel.x);
        const row = Math.floor(pixel.y / 2);
        this.flippedCells.clear();
        this.flippedCells.add(`${col},${row}`);
        this.flipAnsiColors(col, row, this.pipelineCanvas, this.outputCanvas);
        this.isPainting = true;
        if (event.type === 'mousedown') {
          window.addEventListener('mousemove', this.onMouseMove);
          window.addEventListener('mouseup', this.commitPaint);
        }
        return;
      }

      if (this.activeTool === 'bucket' && this.outputCanvas) {
        const ix = Math.floor(pixel.x);
        const iy = Math.floor(pixel.y);
        const ctx = this.outputCanvas.getContext('2d', { willReadFrequently: true });
        const imageData = ctx.getImageData(0, 0, this.cols, this.rows);
        const pixels = floodFill(imageData, ix, iy, this.editFillTolerance, this.editFillContiguous);
        this.paintPixels(pixels);
        this.takeSnapshot();
        return;
      }

      if (this.activeTool === 'picker') {
        if (event.type === 'mousedown') {
          event.preventDefault();
          event.stopPropagation();
        }
        this.isPainting = true;
        this.pickColor(pixel);
        if (event.type === 'mousedown') {
          window.addEventListener('mousemove', this.onMouseMove);
          window.addEventListener('mouseup', this.commitPaint);
        }
        return;
      }

      if (this.activeTool === 'char') {
        const col = Math.floor(pixel.x);
        const row = Math.floor(pixel.y / 2);
        this.picker = { col, row, x: event.touches ? event.touches[0].clientX : event.clientX, y: event.touches ? event.touches[0].clientY : event.clientY };
        return;
      }

      this.isPainting = true;
      this._lastPos = pixel;
      this.paintSegment(pixel, pixel);
      if (event.type === 'mousedown') {
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mouseup', this.commitPaint);
      }
    },

    onMouseMove(event) {
      const rect = this.$refs.pre.getBoundingClientRect();
      const clientX = event.touches ? event.touches[0].clientX : event.clientX;
      const clientY = event.touches ? event.touches[0].clientY : event.clientY;

      const pixel = {
        x: (clientX - rect.left) / this.metrics.cellWidth,
        y: (clientY - rect.top)  / (this.metrics.lineHeight / 2)
      };
      this.mousePos = {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };

      if (!this.isPainting) return;

      if (this.activeTool === 'hand') {
        const dx = this._lastMousePos.x - clientX;
        const dy = this._lastMousePos.y - clientY;

        let scrollEl = this.$el.parentElement;
        while (scrollEl && scrollEl.tagName !== 'ARTICLE') {
          scrollEl = scrollEl.parentElement;
        }
        if (scrollEl) {
          scrollEl.scrollLeft += dx;
          scrollEl.scrollTop += dy;
        }

        this._lastMousePos = { x: clientX, y: clientY };
        return;
      }

      if (this.activeTool === 'flip') {
        const col = Math.floor(pixel.x);
        const row = Math.floor(pixel.y / 2);
        const key = `${col},${row}`;
        if (!this.flippedCells.has(key)) {
          this.flippedCells.add(key);
          this.flipAnsiColors(col, row, this.pipelineCanvas, this.outputCanvas);
        }
        return;
      }

      if (this.activeTool === 'picker') {
        this.pickColor(pixel);
        return;
      }

      const prev = this._lastPos || pixel;
      this._lastPos = pixel;
      this.paintSegment(prev, pixel);
    },

    commitPaint() {
      if (!this.isPainting) return;
      this.isPainting = false;
      this._lastPos = null;
      this._lastMousePos = null;
      this.flippedCells.clear();
      window.removeEventListener('mousemove', this.onMouseMove);
      window.removeEventListener('mouseup', this.commitPaint);
      if (this.activeTool !== 'hand') {
        this.takeSnapshot();
      }
    },

    paintSegment(from, to) {
      if (this.activeTool === 'pencil') {
        const positions = this.interpolatedPositions(from.x, from.y, to.x, to.y);
        const pixels = [];
        const seen = new Set();

        for (const { x, y } of positions) {
          const cx = Math.floor(x);
          const cy = Math.floor(y);

          if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) continue;
          const key = `${cx},${cy}`;
          if (!seen.has(key)) {
            pixels.push({ x: cx, y: cy, alpha: 1 });
            seen.add(key);
          }
        }
        this.paintPixels(pixels);
      } else if (this.activeTool === 'eraser') {
        const size = this.editBrushSize;
        const radius = size / 2;
        const positions = this.interpolatedPositions(from.x, from.y, to.x, to.y);
        const pixels = [];
        const seen = new Set();

        for (const { x, y } of positions) {
          const x0 = Math.floor(x - radius);
          const x1 = Math.ceil(x + radius);
          const y0 = Math.floor(y - radius);
          const y1 = Math.ceil(y + radius);

          for (let iy = y0; iy < y1; iy++) {
            for (let ix = x0; ix < x1; ix++) {
              if (ix < 0 || iy < 0 || ix >= this.cols || iy >= this.rows) continue;

              const dx = (ix + 0.5) - x;
              const dy = (iy + 0.5) - y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > radius) continue;

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
        const radius = this.editBrushSize / 2;
        const flow = this.editBrushFlow / 100;
        const h = this.editBrushHardness / 100;

        for (const { x, y } of positions) {
          const x0 = Math.floor(x - radius);
          const x1 = Math.ceil(x + radius);
          const y0 = Math.floor(y - radius);
          const y1 = Math.ceil(y + radius);

          for (let iy = y0; iy < y1; iy++) {
            for (let ix = x0; ix < x1; ix++) {
              if (ix < 0 || iy < 0 || ix >= this.cols || iy >= this.rows) continue;

              const dx = (ix + 0.5) - x;
              const dy = (iy + 0.5) - y;
              const dist = Math.sqrt(dx * dx + dy * dy);

              if (dist > radius) continue;

              let alpha = 1.0;
              if (radius > 0.5) {
                alpha = dist <= radius * h
                        ? 1
                        : Math.pow(1 - (dist - radius * h) / (radius * (1 - h)), 1.5);
              } else {
                alpha = Math.max(0, 1 - dist / radius);
              }

              alpha *= flow;

              if (alpha <= 0) continue;
              if (radius > 0.5 && alpha < 0.001) continue;

              pixels.push({ x: ix, y: iy, alpha });
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
        this.paintEditPixels(pixelPayload, this.pipelineCanvas, this.outputCanvas, this.editBrushOpacity);
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

    handleTouchStart(event) {
      if (event.touches.length === 1) {
        this.startPaint(event);
      } else if (event.touches.length === 2) {
        this.lastTouchDistance = this.getTouchDistance(event.touches);
        this.lastTouchCenter = this.getTouchCenter(event.touches);
        this._initialPinchZoom = this.editZoom;
      }
    },

    handleTouchMove(event) {
      if (event.touches.length === 1) {
        if (this.isPainting) {
          this.onMouseMove(event);
        }
      } else if (event.touches.length === 2 && this.lastTouchDistance !== null) {
        event.preventDefault();

        // 1. Smooth Continuous Zoom
        const distance = this.getTouchDistance(event.touches);
        const ratio = distance / this.lastTouchDistance;
        this.setEditZoom(this._initialPinchZoom * ratio);

        // 2. Handle Pan
        const center = this.getTouchCenter(event.touches);
        if (this.lastTouchCenter) {
          const dx = this.lastTouchCenter.x - center.x;
          const dy = this.lastTouchCenter.y - center.y;

          let scrollEl = this.$el.parentElement;
          while (scrollEl && scrollEl.tagName !== 'ARTICLE') {
            scrollEl = scrollEl.parentElement;
          }

          if (scrollEl) {
            scrollEl.scrollLeft += dx;
            scrollEl.scrollTop += dy;
          }
        }
        this.lastTouchCenter = center;
      }
    },

    handleTouchEnd(event) {
      if (this.isPainting && event.touches.length === 0) {
        this.commitPaint();
      }
      this.lastTouchDistance = null;
      this.lastTouchCenter = null;
    },

    getTouchDistance(touches) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    },

    getTouchCenter(touches) {
      return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
      };
    },
  },
};
</script>

<template>
  <article
      :class="{
      'pencil-tool': activeTool === 'pencil' || activeTool === 'char' || activeTool === 'bucket' || activeTool === 'flip',
      'picker-tool': activeTool === 'picker',
      'hand-tool': activeTool === 'hand',
      'is-painting': isPainting
    }"
      @mouseenter="isMouseOver = true"
      @mouseleave="isMouseOver = false"
      @mousemove="onMouseMove"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
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
  touch-action: none; /* Prevent browser defaults inside editor */
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

.hand-tool pre {
  cursor: grab;
}

.hand-tool.is-painting pre {
  cursor: grabbing;
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
