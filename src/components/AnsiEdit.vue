<script>
import { ref, computed, useTemplateRef, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { mapState } from 'pinia';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { hex2rgb } from '@/lib/ColorUtils';
import { render as renderText } from '@/lib/TextRenderer';
import { getContext, calcMetrics } from '@/lib/AnsiRuntime';
import { floodFill } from '@/lib/FloodFill';
import { useEditorInteractions } from '@/composables/useEditorInteractions';

export default {
  name: 'AnsiEdit',
  props: {
    pipelineCanvas: {
      type: HTMLCanvasElement,
      required: false,
    },
    outputCanvas: {
      type: HTMLCanvasElement,
      required: false,
    },
    zoomTo: {
      type: Function,
      default: null,
    },
  },
  setup(props) {
    const rootRef = useTemplateRef('root');
    const containerRef = useTemplateRef('container');
    const displayRef = useTemplateRef('pre');
    const workspaceStore = useWorkspaceStore();
    const projectStore = useProjectStore();

    const picker = ref(null);
    const metrics = ref(null);
    const flippedCells = ref(new Set());
    const _renderFrame = ref(null);

    const queueRender = () => {
      if (_renderFrame.value) return;
      _renderFrame.value = requestAnimationFrame(() => {
        _renderFrame.value = null;
        render();
      });
    };

    const render = () => {
      if (!projectStore.blockData || !projectStore.blockData.length || !displayRef.value) return;

      if (!metrics.value) {
        const zoom = workspaceStore.editZoom / 5;
        const m = calcMetrics(displayRef.value);
        metrics.value = {
          ...m,
          cellWidth: m.cellWidth / zoom,
          lineHeight: m.lineHeight / zoom
        };
      }

      if (!metrics.value || metrics.value.cellWidth === 0 || metrics.value.lineHeight === 0) {
        metrics.value = null;
        queueRender();
        return;
      }

      const context = getContext({
        element: displayRef.value,
        cols: projectStore.cols,
        rows: Math.floor(projectStore.rows * 0.5),
      }, metrics.value);

      const buffer = [];
      for (let j = 0; j < context.rows; j++) {
        const offs = j * context.cols;
        for (let i = 0; i < context.cols; i++) {
          const idx = i + offs;
          const pixelI = j * context.cols * 2 + i;
          const bg = projectStore.blockData[pixelI];
          const fg = projectStore.blockData[pixelI + context.cols];

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
    };

    const paintPixels = (pixels) => {
      if (!props.pipelineCanvas || !props.outputCanvas) return;

      if (workspaceStore.activeTool === 'eraser') {
        projectStore.eraseEditPixels(pixels, props.pipelineCanvas, props.outputCanvas);
        projectStore.clearCharEditsAt(pixels);
        return;
      }

      const rgb = hex2rgb(workspaceStore.editFgColor);
      const pixelPayload = [];
      for (const { x, y, alpha } of pixels) {
        if (x < 0 || x >= projectStore.cols || y < 0 || y >= projectStore.rows) continue;
        pixelPayload.push({ x, y, r: rgb.r, g: rgb.g, b: rgb.b, alpha });
      }
      if (pixelPayload.length) {
        projectStore.paintEditPixels(pixelPayload, props.pipelineCanvas, props.outputCanvas, workspaceStore.editBrushOpacity);
      }
    };

    const paintSegment = (from, to) => {
      if (workspaceStore.activeTool === 'pencil') {
        const positions = interpolatedPositions(from.x, from.y, to.x, to.y);
        const pixels = [];
        const seen = new Set();

        for (const { x, y } of positions) {
          const cx = Math.floor(x);
          const cy = Math.floor(y);

          if (cx < 0 || cy < 0 || cx >= projectStore.cols || cy >= projectStore.rows) continue;
          const key = `${cx},${cy}`;
          if (!seen.has(key)) {
            pixels.push({ x: cx, y: cy, alpha: 1 });
            seen.add(key);
          }
        }
        paintPixels(pixels);
      } else if (workspaceStore.activeTool === 'eraser') {
        const size = workspaceStore.editEraserSize;
        const halfSize = size / 2;
        const positions = interpolatedPositions(from.x, from.y, to.x, to.y);
        const pixels = [];
        const seen = new Set();

        for (const { x, y } of positions) {
          const x0 = Math.floor(x - halfSize);
          const x1 = Math.ceil(x + halfSize);
          const y0 = Math.floor(y - halfSize);
          const y1 = Math.ceil(y + halfSize);

          for (let iy = y0; iy < y1; iy++) {
            for (let ix = x0; ix < x1; ix++) {
              if (ix < 0 || iy < 0 || ix >= projectStore.cols || iy >= projectStore.rows) continue;

              const key = `${ix},${iy}`;
              if (!seen.has(key)) {
                pixels.push({ x: ix, y: iy, alpha: 1 });
                seen.add(key);
              }
            }
          }
        }
        paintPixels(pixels);
      } else if (workspaceStore.activeTool === 'brush') {
        const positions = interpolatedPositions(from.x, from.y, to.x, to.y);
        const pixels = [];
        const radius = workspaceStore.editBrushSize / 2;
        const flow = workspaceStore.editBrushFlow / 100;
        const h = workspaceStore.editBrushHardness / 100;

        for (const { x, y } of positions) {
          const x0 = Math.floor(x - radius);
          const x1 = Math.ceil(x + radius);
          const y0 = Math.floor(y - radius);
          const y1 = Math.ceil(y + radius);

          for (let iy = y0; iy < y1; iy++) {
            for (let ix = x0; ix < x1; ix++) {
              if (ix < 0 || iy < 0 || ix >= projectStore.cols || iy >= projectStore.rows) continue;

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
        paintPixels(pixels);
      }
    };

    const {
      isPainting,
      mousePos,
      isMouseOver,
      interpolatedPositions,
      startPaint,
      onMouseMove,
      commitPaint,
      handleTouchStart,
      handleTouchMove,
      handleTouchEnd,
      handleWheel,
      centerContent,
      zoomToViewCenter
    } = useEditorInteractions({
      containerRef: rootRef,
      displayRef,
      activeTool: computed(() => workspaceStore.activeTool),
      editZoom: computed(() => workspaceStore.editZoom),
      callbacks: {
        pixelCoordsAt(event) {
          const displayEl = displayRef.value;
          if (!displayEl) return null;
          if (!metrics.value) {
            const zoom = workspaceStore.editZoom / 5;
            const m = calcMetrics(displayEl);
            metrics.value = {
              ...m,
              cellWidth: m.cellWidth / zoom,
              lineHeight: m.lineHeight / zoom
            };
          }
          const zoom = workspaceStore.editZoom / 5;
          const rect = displayEl.getBoundingClientRect();
          const clientX = event.touches ? event.touches[0].clientX : event.clientX;
          const clientY = event.touches ? event.touches[0].clientY : event.clientY;
          return {
            x: (clientX - rect.left) / (metrics.value.cellWidth * zoom),
            y: (clientY - rect.top) / (metrics.value.lineHeight / 2 * zoom),
          };
        },
        onPaintStart(event, pos) {
          if (workspaceStore.activeTool === 'bucket' && props.outputCanvas) {
            const ix = Math.floor(pos.x);
            const iy = Math.floor(pos.y);
            const ctx = props.outputCanvas.getContext('2d', { willReadFrequently: true });
            const imageData = ctx.getImageData(0, 0, projectStore.cols, projectStore.rows);
            const pixels = floodFill(imageData, ix, iy, workspaceStore.editFillTolerance, workspaceStore.editFillContiguous);
            paintPixels(pixels.map(p => ({ ...p, alpha: 1 })));
            projectStore.takeSnapshot();
            return false;
          }
          if (workspaceStore.activeTool === 'char') {
            const col = Math.floor(pos.x);
            const row = Math.floor(pos.y / 2);
            picker.value = {
              col,
              row,
              x: event.touches ? event.touches[0].clientX : event.clientX,
              y: event.touches ? event.touches[0].clientY : event.clientY,
            };
            return false;
          }
          if (workspaceStore.activeTool === 'flip') {
            const col = Math.floor(pos.x);
            const row = Math.floor(pos.y / 2);
            flippedCells.value.clear();
            flippedCells.value.add(`${col},${row}`);
            projectStore.flipAnsiColors(col, row, props.pipelineCanvas, props.outputCanvas);
            return true;
          }
          paintSegment(pos, pos);
          return true;
        },
        onPaintMove(prev, curr) {
          if (workspaceStore.activeTool === 'flip') {
            const col = Math.floor(curr.x);
            const row = Math.floor(curr.y / 2);
            const key = `${col},${row}`;
            if (!flippedCells.value.has(key)) {
              flippedCells.value.add(key);
              projectStore.flipAnsiColors(col, row, props.pipelineCanvas, props.outputCanvas);
            }
            return;
          }
          paintSegment(prev, curr);
        },
        onPaintEnd() {
          flippedCells.value.clear();
          const toolsWithSnapshot = ['brush', 'pencil', 'eraser', 'flip'];
          if (toolsWithSnapshot.includes(workspaceStore.activeTool)) {
            projectStore.takeSnapshot();
          }
        },
        onColorPick(pos) {
          workspaceStore.editFgColor = projectStore.getRawColorAt(pos.x, pos.y, props.outputCanvas);
        },
        onZoomChange(newZoom) {
          (props.zoomTo || workspaceStore.setEditZoom)(newZoom);
        },
      },
    });

    const brushPreviewStyle = computed(() => {
      if (!metrics.value) return { display: 'none' };
      const isEraser = workspaceStore.activeTool === 'eraser';
      const isPencil = workspaceStore.activeTool === 'pencil';
      const isChar = workspaceStore.activeTool === 'char';
      
      const zoom = workspaceStore.editZoom / 5;
      const size = (isPencil || isChar) ? 1 : (isEraser ? workspaceStore.editEraserSize : workspaceStore.editBrushSize);
      
      const width = size * metrics.value.cellWidth * zoom;
      const height = size * (metrics.value.lineHeight / 2) * zoom;
      
      return {
        width: `${width}px`,
        height: `${height}px`,
        left: `${mousePos.value.x}px`,
        top: `${mousePos.value.y}px`,
        display: isMouseOver.value && (workspaceStore.activeTool === 'brush' || workspaceStore.activeTool === 'eraser' || workspaceStore.activeTool === 'char')
                 ? 'block'
                 : 'none',
        borderRadius: (isEraser || isChar) ? '0' : '50%',
      };
    });

    const preStyle = computed(() => {
      const zoom = workspaceStore.editZoom / 5;
      return {
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
      };
    });

    watch(() => projectStore.blockData, queueRender);
    watch(() => projectStore.cols, () => {
      queueRender();
      nextTick(() => centerContent());
    });
    watch(() => projectStore.rows, () => {
      queueRender();
      nextTick(() => centerContent());
    });

    onMounted(() => {
      queueRender();
      workspaceStore.editMode = true;
      workspaceStore.resetToolToHand();

      if (rootRef.value) {
        rootRef.value.addEventListener('wheel', handleWheel, { passive: false });
      }

      nextTick(() => centerContent());
    });

    onBeforeUnmount(() => {
      commitPaint();
      workspaceStore.editMode = false;
      if (rootRef.value) {
        rootRef.value.removeEventListener('wheel', handleWheel);
      }
      if (_renderFrame.value) cancelAnimationFrame(_renderFrame.value);
    });

    return {
      rootRef,
      containerRef,
      displayRef,
      isPainting,
      mousePos,
      isMouseOver,
      startPaint,
      onMouseMove,
      handleTouchStart,
      handleTouchMove,
      handleTouchEnd,
      picker,
      brushPreviewStyle,
      preStyle,
      zoomToViewCenter,
      selectChar(char) {
        if (!picker.value) return;
        projectStore.setCharEdit(picker.value.col, picker.value.row, char === 'ERASE' ? null : char);
        picker.value = null;
        projectStore.takeSnapshot();
      },
      closePicker() {
        picker.value = null;
      },
    };
  },
  computed: {
    ...mapState(useProjectStore, ['chars', 'cols', 'rows']),
    ...mapState(useWorkspaceStore, ['activeTool', 'editZoom']),
    pickerChars() {
      if (!this.chars) return [];
      return [...new Set(this.chars.split(''))].filter(c => c.trim());
    },
  },
};
</script>

<template>
  <article
      ref="root"
      :class="{
      'pencil-tool': activeTool === 'pencil' || activeTool === 'char' || activeTool === 'bucket' || activeTool === 'flip',
      'picker-tool': activeTool === 'picker',
      'hand-tool': activeTool === 'hand',
      'is-painting': isPainting
    }"
      @contextmenu.prevent
      @mouseenter="isMouseOver = true"
      @mouseleave="isMouseOver = false"
      @mousemove="onMouseMove"
      @mousedown="startPaint"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
  >
    <div class="canvas-viewport" ref="container">
      <div class="canvas-container">
        <pre ref="pre" :style="preStyle"></pre>
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
      </div>
    </div>
  </article>
</template>

<style scoped>
article {
  display: block;
  flex: 1;
  width: 100%;
  height: 100%;
  overflow: auto;
  overscroll-behavior: none;
  cursor: none;
}

div.canvas-viewport {
  display: inline-flex;
  margin: 70vh 70vw;
}

div.canvas-container {
  position: relative;
  touch-action: none;
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
  display: block;
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
