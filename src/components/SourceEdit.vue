<script>
import { mapState, mapWritableState, mapActions } from 'pinia';
import { useCurrentFileStore } from '@/store/CurrentFile';
import { hex2rgb } from '@/lib/ColorUtils';
import { floodFill } from '@/lib/FloodFill';

export default {
  name: 'SourceEdit',
  props: {
    canvas: {
      type: HTMLCanvasElement,
      required: false,
    },
    pipelineCanvas: {
      type: HTMLCanvasElement,
      required: false,
    },
  },
  data() {
    return {
      isPainting: false,
      mousePos: { x: 0, y: 0 },
      isMouseOver: false,
      lastTouchDistance: null,
      lastTouchCenter: null,
    };
  },
  computed: {
    ...mapState(useCurrentFileStore, [
      'cols', 'rows', 'editZoom', 'editBrushSize', 'activeTool',
      'brightness', 'contrast', 'saturation', 'hue', 'invert', 'editFillTolerance', 'editFillContiguous'
    ]),
    ...mapWritableState(useCurrentFileStore, ['editMode', 'editFgColor']),
    brushPreviewSize() {
      return this.editBrushSize * this.editZoom;
    },
    brushPreviewStyle() {
      const isPencil = this.activeTool === 'pencil';
      const size = isPencil ? 1 : this.editBrushSize;
      const pixelSize = size * this.editZoom;
      
      return {
        width: `${pixelSize}px`,
        height: `${pixelSize}px`,
        left: `${this.mousePos.x}px`,
        top: `${this.mousePos.y}px`,
        display: this.isMouseOver && (this.activeTool === 'brush' || this.activeTool === 'eraser') ? 'block' : 'none',
        borderRadius: this.activeTool === 'eraser' ? '0' : '50%',
      };
    },
  },
  watch: {
    canvas: 'redrawDisplay',
    editZoom: 'redrawDisplay',
  },
  mounted() {
    this.redrawDisplay();
    this.editMode = true;
  },
  beforeUnmount() {
    this.commitPaint();
    this.editMode = false;
  },

  methods: {
    ...mapActions(useCurrentFileStore, ['paintEditPixels', 'eraseEditPixels', 'takeSnapshot', 'getRawColorAt', 'setEditZoom']),

    redrawDisplay() {
      if (!this.$refs.displayCanvas || !this.canvas) return;
      const dc = this.$refs.displayCanvas;
      dc.width = this.cols * this.editZoom;
      dc.height = this.rows * this.editZoom;
      const ctx = dc.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.canvas, 0, 0, dc.width, dc.height);
    },

    pixelCoordsAt(event) {
      const rect = this.$refs.displayCanvas.getBoundingClientRect();
      const clientX = event.touches ? event.touches[0].clientX : event.clientX;
      const clientY = event.touches ? event.touches[0].clientY : event.clientY;
      return {
        x: (clientX - rect.left) / this.editZoom,
        y: (clientY - rect.top)  / this.editZoom,
      };
    },

    paintSegment(from, to) {
      if (!this.canvas || !this.pipelineCanvas) return;
      const paintRgb = hex2rgb(this.editFgColor);

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
                pixels.push({ x: ix, y: iy, r: paintRgb.r, g: paintRgb.g, b: paintRgb.b, alpha: 1 });
                seen.add(key);
              }
            }
          }
        }

        if (isEraser) {
          this.eraseEditPixels(pixels, this.pipelineCanvas, this.canvas);
        } else {
          this.paintEditPixels(pixels, this.pipelineCanvas, this.canvas);
        }
        this.redrawDisplay();
        return;
      }

      const size = this.editBrushSize;
      const radius = size / 2;
      const isEraser = false; // Brush is the only one left

      const positions = this.interpolatedPositions(from.x, from.y, to.x, to.y);

      const alphaMap = new Map();
      for (const { x: cx, y: cy } of positions) {
        // Calculate bounding box of pixels affected
        const x0 = Math.floor(cx - radius);
        const x1 = Math.ceil(cx + radius);
        const y0 = Math.floor(cy - radius);
        const y1 = Math.ceil(cy + radius);

        for (let iy = y0; iy < y1; iy++) {
          for (let ix = x0; ix < x1; ix++) {
            if (ix < 0 || iy < 0 || ix >= this.cols || iy >= this.rows) continue;

            // Calculate overlap (coverage) of the 1x1 brush square with the 1x1 pixel
            const x_cov = Math.max(0, Math.min(ix + 1, cx + radius) - Math.max(ix, cx - radius));
            const y_cov = Math.max(0, Math.min(iy + 1, cy + radius) - Math.max(iy, cy - radius));
            let alpha = (x_cov / size) * (y_cov / size) * size; // Normalized alpha
            
            if (!isEraser) {
              // Add circular falloff for the 'brush' tool to keep it "soft"
              const dx = (ix + 0.5) - cx;
              const dy = (iy + 0.5) - cy;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > radius) {
                // If it's outside the radius but has coverage, we still want some paint
                // but we'll scale it by the distance
                alpha *= Math.max(0, 1 - (dist - radius) / 0.5);
              }
            }

            const key = iy * this.cols + ix;
            const prev = alphaMap.get(key);
            if (prev === undefined || alpha > prev) alphaMap.set(key, alpha);
          }
        }
      }

      const pixels = [];
      for (const [key, alpha] of alphaMap.entries()) {
        pixels.push({
          x: key % this.cols,
          y: Math.floor(key / this.cols),
          r: paintRgb.r, g: paintRgb.g, b: paintRgb.b, alpha: Math.min(1, alpha),
        });
      }

      if (pixels.length) {
        if (isEraser) {
          this.eraseEditPixels(pixels, this.pipelineCanvas, this.canvas);
        } else {
          this.paintEditPixels(pixels, this.pipelineCanvas, this.canvas);
        }
        this.redrawDisplay();
      }
    },

    interpolatedPositions(x0, y0, x1, y1) {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.ceil(dist * 2); // 0.5px steps for smoothness
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

    pickColor(pos) {
      this.editFgColor = this.getRawColorAt(pos.x, pos.y);
    },

    startPaint(event) {
      if (!this.canvas || !this.pipelineCanvas) return;
      const pos = this.pixelCoordsAt(event);

      if (this.activeTool === 'bucket' && this.canvas) {
        const ix = Math.floor(pos.x);
        const iy = Math.floor(pos.y);
        const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        const imageData = ctx.getImageData(0, 0, this.cols, this.rows);
        const pixels = floodFill(imageData, ix, iy, this.editFillTolerance, this.editFillContiguous);
        
        const paintRgb = hex2rgb(this.editFgColor);
        const pixelPayload = pixels.map(p => ({
          ...p, r: paintRgb.r, g: paintRgb.g, b: paintRgb.b
        }));
        
        this.paintEditPixels(pixelPayload, this.pipelineCanvas, this.canvas);
        this.takeSnapshot();
        this.redrawDisplay();
        return;
      }

      if (this.activeTool === 'picker') {
        if (event.type === 'mousedown') {
          event.preventDefault();
          event.stopPropagation();
        }
        this.isPainting = true;
        this.pickColor(pos);
        if (event.type === 'mousedown') {
          window.addEventListener('mousemove', this.onMouseMove);
          window.addEventListener('mouseup', this.commitPaint);
        }
        return;
      }

      this.isPainting = true;
      this._lastPos = pos;
      this.paintSegment(pos, pos);
      if (event.type === 'mousedown') {
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mouseup', this.commitPaint);
      }
    },

    onMouseMove(event) {
      const rect = this.$refs.displayCanvas.getBoundingClientRect();
      const clientX = event.touches ? event.touches[0].clientX : event.clientX;
      const clientY = event.touches ? event.touches[0].clientY : event.clientY;

      const pos = {
        x: (clientX - rect.left) / this.editZoom,
        y: (clientY - rect.top)  / this.editZoom,
      };
      this.mousePos = {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };

      if (!this.isPainting || !this.canvas) return;

      if (this.activeTool === 'picker') {
        this.pickColor(pos);
        return;
      }

      const pPos = this.pixelCoordsAt(event);
      const prev = this._lastPos || pPos;
      this._lastPos = pPos;
      this.paintSegment(prev, pPos);
    },

    commitPaint() {
      if (!this.isPainting) return;
      this.isPainting = false;
      this._lastPos = null;
      window.removeEventListener('mousemove', this.onMouseMove);
      window.removeEventListener('mouseup', this.commitPaint);
      this.takeSnapshot();
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
  <article>
    <div
      class="canvas-container"
      :class="{ 
        'pencil-tool': activeTool === 'pencil' || activeTool === 'bucket',
        'picker-tool': activeTool === 'picker'
      }"
      @mouseenter="isMouseOver = true"
      @mouseleave="isMouseOver = false"
      @mousemove="onMouseMove"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
    >
      <canvas ref="displayCanvas" @mousedown="startPaint"/>
      <div v-if="editZoom >= 16" class="grid-overlay"></div>
      <div class="brush-preview" :style="brushPreviewStyle"></div>
    </div>
  </article>
</template>

<style scoped>
article {
  margin: auto;
}

div.canvas-container {
  position: relative;
  touch-action: none; /* Crucial: prevent browser default touch handling inside container */
}

canvas {
  display: block;
  cursor: none;
  image-rendering: pixelated;
  outline: 2px dashed var(--border-light);
}

.pencil-tool canvas {
  cursor: crosshair;
}

.picker-tool canvas {
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

div.grid-overlay {
  position: absolute;
  inset: 0;
  top: -1px;
  left: -1px;
  pointer-events: none;
  background-size: v-bind('editZoom + "px"') v-bind('editZoom + "px"');
  background-image:
    linear-gradient(to right, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
    linear-gradient(to right, rgba(0, 0, 0, 0.1) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(0, 0, 0, 0.1) 1px, transparent 1px);
  background-position: 0 0, 0 0, 0.5px 0.5px, 0.5px 0.5px;
}
</style>
