<script>
import { ref, computed, useTemplateRef, watch, onMounted, onBeforeUnmount } from 'vue';
import { mapState } from 'pinia';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { hex2rgb } from '@/lib/ColorUtils';
import { floodFill } from '@/lib/FloodFill';

import { useEditorInteractions } from '@/composables/useEditorInteractions';

export default {
  name: 'InputEditor',
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
  setup(props) {
    const rootRef = useTemplateRef('root');
    const containerRef = useTemplateRef('container');
    const displayRef = useTemplateRef('displayCanvas');
    const workspaceStore = useWorkspaceStore();
    const projectStore = useProjectStore();

    const redrawDisplay = () => {
      const dc = displayRef.value;
      if (!dc || !props.canvas) return;
      dc.width = projectStore.cols * workspaceStore.editZoom;
      dc.height = projectStore.rows * workspaceStore.editZoom;
      const ctx = dc.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(props.canvas, 0, 0, dc.width, dc.height);
    };

    const paintSegment = (from, to) => {
      if (!props.canvas || !props.pipelineCanvas) return;
      const paintRgb = hex2rgb(workspaceStore.editFgColor);

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
            pixels.push({ x: cx, y: cy, r: paintRgb.r, g: paintRgb.g, b: paintRgb.b, alpha: 1 });
            seen.add(key);
          }
        }
        projectStore.paintEditPixels(pixels, props.pipelineCanvas, props.canvas, workspaceStore.editBrushOpacity);
        redrawDisplay();
        return;
      }

      if (workspaceStore.activeTool === 'eraser') {
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
        projectStore.eraseEditPixels(pixels, props.pipelineCanvas, props.canvas);
        redrawDisplay();
        return;
      }

      const size = workspaceStore.editBrushSize;
      const radius = size / 2;
      const flow = workspaceStore.editBrushFlow / 100;
      const h = workspaceStore.editBrushHardness / 100;

      const positions = interpolatedPositions(from.x, from.y, to.x, to.y);
      const pixels = [];

      for (const { x: cx, y: cy } of positions) {
        // Calculate bounding box of pixels affected
        const x0 = Math.floor(cx - radius);
        const x1 = Math.ceil(cx + radius);
        const y0 = Math.floor(cy - radius);
        const y1 = Math.ceil(cy + radius);

        for (let iy = y0; iy < y1; iy++) {
          for (let ix = x0; ix < x1; ix++) {
            if (ix < 0 || iy < 0 || ix >= projectStore.cols || iy >= projectStore.rows) continue;

            const dx = (ix + 0.5) - cx;
            const dy = (iy + 0.5) - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > radius) continue;

            let alpha = dist <= radius * h
                        ? 1
                        : Math.pow(1 - (dist - radius * h) / (radius * (1 - h)), 1.5);

            alpha *= flow;

            if (alpha > 0.001) {
              pixels.push({
                x: ix, y: iy,
                r: paintRgb.r, g: paintRgb.g, b: paintRgb.b,
                alpha: alpha,
              });
            }
          }
        }
      }

      if (pixels.length) {
        projectStore.paintEditPixels(pixels, props.pipelineCanvas, props.canvas, workspaceStore.editBrushOpacity);
        redrawDisplay();
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
      workspaceStore,
      callbacks: {
        pixelCoordsAt(event) {
          const displayEl = displayRef.value;
          if (!displayEl) return null;
          const rect = displayEl.getBoundingClientRect();
          const clientX = event.touches ? event.touches[0].clientX : event.clientX;
          const clientY = event.touches ? event.touches[0].clientY : event.clientY;
          return {
            x: (clientX - rect.left) / workspaceStore.editZoom,
            y: (clientY - rect.top) / workspaceStore.editZoom,
          };
        },
        onPaintStart(event, pos) {
          if (workspaceStore.activeTool === 'bucket' && props.canvas) {
            const ix = Math.floor(pos.x);
            const iy = Math.floor(pos.y);
            const ctx = props.canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
            const imageData = ctx.getImageData(0, 0, projectStore.cols, projectStore.rows);
            const pixels = floodFill(imageData, ix, iy, workspaceStore.editFillTolerance, workspaceStore.editFillContiguous);

            const paintRgb = hex2rgb(workspaceStore.editFgColor);
            const pixelPayload = pixels.map(p => ({
              ...p, r: paintRgb.r, g: paintRgb.g, b: paintRgb.b, alpha: 1
            }));

            projectStore.paintEditPixels(pixelPayload, props.pipelineCanvas, props.canvas, workspaceStore.editBrushOpacity);
            projectStore.takeSnapshot();
            redrawDisplay();
            return false;
          }
          paintSegment(pos, pos);
          return true;
        },
        onPaintMove(prev, curr) {
          paintSegment(prev, curr);
        },
        onPaintEnd() {
          const toolsWithSnapshot = ['brush', 'pencil', 'eraser'];
          if (toolsWithSnapshot.includes(workspaceStore.activeTool)) {
            projectStore.takeSnapshot();
          }
        },
        onColorPick(pos) {
          workspaceStore.editFgColor = projectStore.getRawColorAt(pos.x, pos.y);
        },
        onZoomChange(newZoom) {
          workspaceStore.setEditZoom(newZoom);
        },
      },
    });

    const brushPreviewStyle = computed(() => {
      const isPencil = workspaceStore.activeTool === 'pencil';
      const isEraser = workspaceStore.activeTool === 'eraser';
      const size = isPencil ? 1 : (isEraser ? workspaceStore.editEraserSize : workspaceStore.editBrushSize);
      const pixelSize = size * workspaceStore.editZoom;

      return {
        width: `${pixelSize}px`,
        height: `${pixelSize}px`,
        left: `${mousePos.value.x}px`,
        top: `${mousePos.value.y}px`,
        display: isMouseOver.value && (workspaceStore.activeTool === 'brush' || workspaceStore.activeTool === 'eraser')
                 ? 'block'
                 : 'none',
        borderRadius: isEraser ? '0' : '50%',
      };
    });

    watch(() => props.canvas, (newCanvas, oldCanvas) => {
      redrawDisplay();
      if (!oldCanvas || newCanvas?.width !== oldCanvas?.width || newCanvas?.height !== oldCanvas?.height) {
        requestAnimationFrame(() => centerContent());
      }
    });
    
    watch(() => workspaceStore.editZoom, redrawDisplay);

    const viewportWidth = ref(0);
    const viewportHeight = ref(0);

    const canvasWidth = computed(() => projectStore.cols * workspaceStore.editZoom);
    const canvasHeight = computed(() => projectStore.rows * workspaceStore.editZoom);

    const paddingX = computed(() => Math.max(0, viewportWidth.value - canvasWidth.value / 3));
    const paddingY = computed(() => Math.max(0, viewportHeight.value - canvasHeight.value / 3));

    const workspaceWidth = computed(() => {
      if (viewportWidth.value === 0) return '100%';
      return `${canvasWidth.value + 2 * paddingX.value}px`;
    });

    const workspaceHeight = computed(() => {
      if (viewportHeight.value === 0) return '100%';
      return `${canvasHeight.value + 2 * paddingY.value}px`;
    });

    const viewportStyle = computed(() => ({
      width: workspaceWidth.value,
      height: workspaceHeight.value,
    }));

    const offset = { x: 0, y: 0 };
    const updateOffset = () => {
      const el = rootRef.value;
      if (!el) return;
      // Store the offset of the viewport center relative to the content center
      offset.x = (el.scrollLeft + el.clientWidth / 2) - (el.scrollWidth / 2);
      offset.y = (el.scrollTop + el.clientHeight / 2) - (el.scrollHeight / 2);
      
      // Persist absolute scroll position to workspace store
      workspaceStore.inputScrollX = el.scrollLeft;
      workspaceStore.inputScrollY = el.scrollTop;
    };

    const updateViewportSize = () => {
      const el = rootRef.value;
      if (el) {
        viewportWidth.value = el.clientWidth;
        viewportHeight.value = el.clientHeight;
      }
    };

    const handleResize = () => {
      const el = rootRef.value;
      if (!el) return;
      updateViewportSize();
      // Restore the viewport center relative to the (potentially new) content center
      el.scrollLeft = (el.scrollWidth / 2) + offset.x - (el.clientWidth / 2);
      el.scrollTop = (el.scrollHeight / 2) + offset.y - (el.clientHeight / 2);
    };

    let resizeObserver = null;

    onMounted(() => {
      redrawDisplay();

      updateViewportSize();

      if (rootRef.value) {
        rootRef.value.addEventListener('wheel', handleWheel, { passive: false });
        rootRef.value.addEventListener('scroll', updateOffset);
        
        // Restore previous scroll position or center if none exists
        // Use rAF to ensure layout is ready
        requestAnimationFrame(() => {
          if (!rootRef.value) return;

          if (workspaceStore.inputScrollX !== null && workspaceStore.inputScrollY !== null) {
            rootRef.value.scrollLeft = workspaceStore.inputScrollX;
            rootRef.value.scrollTop = workspaceStore.inputScrollY;
          } else {
            centerContent();
          }
          
          // CRITICAL: Update the relative offset AFTER restoring/centering 
          // so handleResize (via ResizeObserver) knows where we are.
          updateOffset();

          // Only start observing after we've established our initial position
          resizeObserver = new ResizeObserver(() => {
            handleResize();
          });
          resizeObserver.observe(rootRef.value);
        });
      }
    });

    onBeforeUnmount(() => {
      commitPaint();
      if (rootRef.value) {
        rootRef.value.removeEventListener('wheel', handleWheel);
        rootRef.value.removeEventListener('scroll', updateOffset);
        if (resizeObserver) {
          resizeObserver.disconnect();
        }
      }
      window.removeEventListener('resize', handleResize);
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
      brushPreviewStyle,
      zoomToViewCenter,
      viewportStyle,
    };
  },
  computed: {
    ...mapState(useWorkspaceStore, ['activeTool', 'editZoom']),
  },
};
</script>

<template>
  <article
      ref="root"
      @contextmenu.prevent
      @mouseenter="isMouseOver = true"
      @mouseleave="isMouseOver = false"
      @pointermove="onMouseMove"
      @pointerdown="startPaint"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
  >
    <div class="canvas-viewport" ref="container" :style="viewportStyle">
      <div class="canvas-container">
        <canvas ref="displayCanvas"/>
        <div v-if="editZoom >= 16" class="grid-overlay"></div>
        <div class="brush-preview" :style="brushPreviewStyle"></div>
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
      overflow-anchor: none;
      overscroll-behavior: none;
      /* Safari fix for scrollbars being hidden behind content */
      position: relative;
      z-index: 0;
      -webkit-transform: translate3d(0, 0, 0);
      transform: translate3d(0, 0, 0);
    }
    div.canvas-viewport {
    display: grid;
    place-items: center;
    }

div.canvas-container {
  position: relative;
  touch-action: none; /* Crucial: prevent browser default touch handling inside container */
}

canvas {
  display: block;
  image-rendering: pixelated;
  outline: 2px dashed var(--border-light);
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
