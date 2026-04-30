<script>
import { ref, computed, useTemplateRef, watch, onMounted, onBeforeUnmount } from 'vue';
import { mapState } from 'pinia';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { hex2rgb } from '@/lib/ColorUtils';
import { render as renderText } from '@/lib/TextRenderer';
import { getContext, calcMetrics } from '@/lib/AnsiRuntime';
import { floodFill } from '@/lib/FloodFill';
import { useEditorInteractions } from '@/composables/useEditorInteractions';
import CharPicker from '@/components/CharPicker.vue';

export default {
  name: 'AnsiEditor',
  components: {
    CharPicker,
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
  setup(props) {
    const rootRef = useTemplateRef('root');
    const containerRef = useTemplateRef('container');
    const displayRef = useTemplateRef('pre');
    const workspaceStore = useWorkspaceStore();
    const projectStore = useProjectStore();

    const picker = ref(null);
    const metrics = ref(null);
    const columnOffsets = ref([]);
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
        const zoom = 1;
        const m = calcMetrics(displayRef.value);
        metrics.value = {
          ...m,
          cellWidth: m.cellWidth / zoom,
          lineHeight: m.lineHeight / zoom
        };

        // Calculate precise column offsets
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const style = getComputedStyle(displayRef.value);
        ctx.font = style.fontSize + ' ' + style.fontFamily;
        const totalWidth = ctx.measureText(''.padEnd(projectStore.cols, 'X')).width;
        
        columnOffsets.value = [];
        for (let i = 0; i < projectStore.cols; i++) {
          columnOffsets.value.push((i / projectStore.cols) * totalWidth);
        }
        columnOffsets.value.push(totalWidth); // End of last column
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
      updateMousePos,
    } = useEditorInteractions({
      containerRef: rootRef,
      displayRef,
      activeTool: computed(() => workspaceStore.activeTool),
      editZoom: computed(() => 5),
      workspaceStore,
      disableZoom: true,
      callbacks: {
        pixelCoordsAt(event) {
          const displayEl = displayRef.value;
          if (!displayEl) return null;
          if (!metrics.value) {
            const zoom = 1;
            const m = calcMetrics(displayEl);
            metrics.value = {
              ...m,
              cellWidth: m.cellWidth / zoom,
              lineHeight: m.lineHeight / zoom
            };
          }
          const zoom = 1;
          const rect = displayEl.getBoundingClientRect();
          const clientX = event.touches ? event.touches[0].clientX : event.clientX;
          const clientY = event.touches ? event.touches[0].clientY : event.clientY;
          
          const localX = (clientX - rect.left) / zoom;
          const localY = (clientY - rect.top) / zoom;

          let col;
          if (columnOffsets.value.length > 0) {
            const totalWidth = columnOffsets.value[columnOffsets.value.length - 1];
            col = (localX / totalWidth) * projectStore.cols;
          } else {
            col = localX / metrics.value.cellWidth;
          }

          return {
            x: col,
            y: localY / (metrics.value.lineHeight / 2),
          };
        },
        onPaintStart(event, pos) {
          if (workspaceStore.activeTool === 'bucket' && props.outputCanvas) {
            event.stopPropagation();
            const ix = Math.floor(pos.x);
            const iy = Math.floor(pos.y);
            const ctx = props.outputCanvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
            const imageData = ctx.getImageData(0, 0, projectStore.cols, projectStore.rows);
            const pixels = floodFill(
              imageData, ix, iy, 
              workspaceStore.editFillTolerance, 
              workspaceStore.editFillContiguous,
              workspaceStore.editFillFeather
            );
            paintPixels(pixels);
            projectStore.takeSnapshot();
            return false;
          }
          if (workspaceStore.activeTool === 'char') {
            event.stopPropagation();
            const col = Math.floor(pos.x);
            const row = Math.floor(pos.y / 2);

            const displayEl = displayRef.value;
            const rect = displayEl.getBoundingClientRect();
            const targetRect = {
              left: rect.left + col * metrics.value.cellWidth,
              top: rect.top + row * metrics.value.lineHeight,
              width: metrics.value.cellWidth,
              height: metrics.value.lineHeight,
            };

            picker.value = { col, row, targetRect };
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
          workspaceStore.editFgColor = projectStore.getRawColorAt(pos.x, pos.y);
        },
      },
    });

    const brushPreviewStyle = computed(() => {
      if (!metrics.value) return { display: 'none' };
      const tool = workspaceStore.activeTool;
      const isChar = tool === 'char';
      const isFlip = tool === 'flip';
      const isEraser = tool === 'eraser';
      const isBrush = tool === 'brush';

      // Pin the preview to the active picker cell if it exists
      if (picker.value) {
        return {
          display: 'block',
          position: 'absolute',
          width: `${metrics.value.cellWidth}px`,
          height: `${metrics.value.lineHeight}px`,
          left: `${picker.value.col * metrics.value.cellWidth}px`,
          top: `${picker.value.row * metrics.value.lineHeight}px`,
          borderRadius: '0',
          transform: 'none',
          mixBlendMode: 'difference',
          background: 'white',
          outline: '1px solid red',
          border: 'none',
          boxShadow: 'none',
          zIndex: 1000,
        };
      }

      if (!isMouseOver.value || (!isChar && !isFlip && !isEraser && !isBrush)) return { display: 'none' };

      if (isChar || isFlip) {
        const col = Math.floor(mousePos.value.x / metrics.value.cellWidth);
        const row = Math.floor(mousePos.value.y / metrics.value.lineHeight);
        
        const isInBounds = col >= 0 && col < projectStore.cols && 
                          row >= 0 && row < (projectStore.rows / 2);

        if (!isInBounds) return { display: 'none' };

        return {
          display: 'block',
          width: `${metrics.value.cellWidth}px`,
          height: `${metrics.value.lineHeight}px`,
          left: `${col * metrics.value.cellWidth}px`,
          top: `${row * metrics.value.lineHeight - 0.5}px`,
          borderRadius: '0',
          transform: 'none',
          mixBlendMode: 'difference',
          background: 'white',
          outline: '1px solid red',
          border: 'none',
          boxShadow: 'none',
        };
      }

      const size = isEraser ? workspaceStore.editEraserSize : workspaceStore.editBrushSize;
      const width = size * metrics.value.cellWidth;
      const height = size * (metrics.value.lineHeight / 2);
      
      return {
        display: 'block',
        width: `${width}px`,
        height: `${height}px`,
        left: `${mousePos.value.x}px`,
        top: `${mousePos.value.y}px`,
        borderRadius: isEraser ? '0' : '50%',
        transform: 'translate(-50%, -50%)',
      };
    });

    const preStyle = computed(() => {
      const zoom = 1;
      return {
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
      };
    });

    watch(() => projectStore.blockData, queueRender);
    watch(() => projectStore.cols, () => {
      metrics.value = null;
      queueRender();
    });
    watch(() => projectStore.rows, () => {
      metrics.value = null;
      queueRender();
    });

    const closePicker = (event) => {
      if (event) updateMousePos(event);
      picker.value = null;
    };

    onMounted(() => {
      queueRender();

      if (rootRef.value) {
        rootRef.value.addEventListener('wheel', handleWheel, { passive: false });
        
        rootRef.value.addEventListener('scroll', () => {
          if (rootRef.value) {
            workspaceStore.ansiScrollX = rootRef.value.scrollLeft;
            workspaceStore.ansiScrollY = rootRef.value.scrollTop;
          }
        });

        // Restore previous scroll position or center if none exists
        // Wait for next frame to ensure render has happened and content has size
        requestAnimationFrame(() => {
          if (!rootRef.value) return;
          if (workspaceStore.ansiScrollX !== null && workspaceStore.ansiScrollY !== null) {
            rootRef.value.scrollLeft = workspaceStore.ansiScrollX;
            rootRef.value.scrollTop = workspaceStore.ansiScrollY;
          } else {
            centerContent();
          }
        });
      }
    });

    onBeforeUnmount(() => {
      commitPaint();
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
      selectChar(char, event) {
        if (!picker.value) return;
        projectStore.setCharEdit(picker.value.col, picker.value.row, char === 'ERASE' ? null : char);
        closePicker(event);
        projectStore.takeSnapshot();
      },
      closePicker,
    };
  },
  computed: {
    ...mapState(useProjectStore, ['processParams', 'cols', 'rows']),
    ...mapState(useWorkspaceStore, ['activeTool', 'editZoom']),
    pickerChars() {
      const chars = this.processParams.chars;
      if (!chars) return [];
      return [...new Set(chars.split(''))].filter(c => c.trim());
    },
  },
};
</script>

<template>
  <article
      ref="root"
      tabindex="0"
      @contextmenu.prevent
      @mouseenter="isMouseOver = true"
      @mouseleave="isMouseOver = false"
      @pointermove="onMouseMove"
      @pointerdown="startPaint"
      @mousedown="startPaint"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
  >
    <div class="canvas-viewport" ref="container">
      <div class="canvas-container">
        <pre ref="pre" :style="preStyle"></pre>
        <div class="brush-preview" :style="brushPreviewStyle"></div>

        <CharPicker
            v-if="picker"
            :chars="pickerChars"
            :target-rect="picker.targetRect"
            @select="selectChar"
            @close="closePicker"
        />
      </div>
    </div>
  </article>
</template>

<style scoped>
article {
  flex: 1;
  width: 100%;
  height: 100%;
  overflow: auto;
  outline: none;
}

div.canvas-viewport {
  display: inline-flex;
  width: 100%;
  height: 100%;
}

div.canvas-container {
  position: relative;
  touch-action: none;
  margin: auto;
  user-select: none;
  -webkit-user-select: none;
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
  display: block;
  user-select: none;
  -webkit-user-select: none;
  text-rendering: optimizeSpeed;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
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
</style>
