<script>
import { mapState, mapWritableState, mapActions } from 'pinia';
import { useCurrentFileStore } from '@/store/CurrentFile';
import { hex2rgb, rgb2hex } from '@/lib/ColorUtils';
import { applyTransforms } from '@/lib/PixelTransforms';

const ZOOM_STEPS = [1, 2, 4, 8, 16];

export default {
  name: 'EditToolbar',
  computed: {
    ...mapState(useCurrentFileStore, {
      activeTool: 'activeTool',
      editZoom: 'editZoom',
      editBrushSize: 'editBrushSize',
      previewTab: 'previewTab',
      hasEdits: (state) => state.hasEdits,
      hasPaint: (state) => state.hasPaint,
      brightness: 'brightness',
      contrast: 'contrast',
      saturation: 'saturation',
      hue: 'hue',
      invert: 'invert',
      canUndo: 'canUndo',
      canRedo: 'canRedo',
    }),
    ...mapWritableState(useCurrentFileStore, ['editFgColor']),
    effectiveColor() {
      const rgb = hex2rgb(this.editFgColor);
      const data = new Uint8ClampedArray([rgb.r, rgb.g, rgb.b, 255]);
      applyTransforms(data, this.brightness, this.contrast, this.saturation, this.hue, this.invert);
      return rgb2hex({ r: data[0], g: data[1], b: data[2] });
    },
    zoomLabel() {
      return `${this.editZoom}×`;
    },
    canZoomOut() {
      return ZOOM_STEPS.indexOf(this.editZoom) > 0;
    },
    canZoomIn() {
      return ZOOM_STEPS.indexOf(this.editZoom) < ZOOM_STEPS.length - 1;
    },
  },
  methods: {
    ...mapActions(useCurrentFileStore, ['setActiveTool', 'setEditZoom', 'setEditBrushSize', 'clearEditLayer', 'undo', 'redo', 'flattenEdits']),
    confirmClear() {
      if (!this.hasEdits) {
        this.clearEditLayer();
        return;
      }
      if (confirm('Are you sure you want to clear all edits?')) {
        this.clearEditLayer();
      }
    },
    confirmFlatten() {
      if (confirm('Apply all paint edits to the base image? This cannot be undone.')) {
        this.flattenEdits();
      }
    },
    zoomOut() {
      const idx = ZOOM_STEPS.indexOf(this.editZoom);
      if (idx > 0) this.setEditZoom(ZOOM_STEPS[idx - 1]);
    },
    zoomIn() {
      const idx = ZOOM_STEPS.indexOf(this.editZoom);
      if (idx < ZOOM_STEPS.length - 1) this.setEditZoom(ZOOM_STEPS[idx + 1]);
    },
  },
};
</script>

<template>
  <div class="edit-toolbar">
    <div class="color-group">
      <div class="color-preview-container">
        <input type="color" v-model="editFgColor" title="Select paint color"/>
        <div 
          class="effective-preview" 
          :style="{ backgroundColor: effectiveColor }"
          title="Effective color (after adjustments)"
        ></div>
      </div>
    </div>

    <div class="tool-group">
      <button
        :class="{ active: activeTool === 'pencil' }"
        title="Pencil (1px)"
        @click="setActiveTool('pencil')"
      ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M100.4 417.2C104.5 402.6 112.2 389.3 123 378.5L304.2 197.3L338.1 163.4C354.7 180 389.4 214.7 442.1 267.4L476 301.3L442.1 335.2L260.9 516.4C250.2 527.1 236.8 534.9 222.2 539L94.4 574.6C86.1 576.9 77.1 574.6 71 568.4C64.9 562.2 62.6 553.3 64.9 545L100.4 417.2zM156 413.5C151.6 418.2 148.4 423.9 146.7 430.1L122.6 517L209.5 492.9C215.9 491.1 221.7 487.8 226.5 483.2L155.9 413.5zM510 267.4C493.4 250.8 458.7 216.1 406 163.4L372 129.5C398.5 103 413.4 88.1 416.9 84.6C430.4 71 448.8 63.4 468 63.4C487.2 63.4 505.6 71 519.1 84.6L554.8 120.3C568.4 133.9 576 152.3 576 171.4C576 190.5 568.4 209 554.8 222.5C551.3 226 536.4 240.9 509.9 267.4z"/></svg></button>
      <button
        :class="{ active: activeTool === 'brush' }"
        title="Brush (soft 5×5)"
        @click="setActiveTool('brush')"
      ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M512.5 74.3L291.1 222C262 241.4 243.5 272.9 240.5 307.3C302.8 320.1 351.9 369.2 364.8 431.6C399.3 428.6 430.7 410.1 450.1 381L597.7 159.5C604.4 149.4 608 137.6 608 125.4C608 91.5 580.5 64 546.6 64C534.5 64 522.6 67.6 512.5 74.3zM320 464C320 402.1 269.9 352 208 352C146.1 352 96 402.1 96 464C96 467.9 96.2 471.8 96.6 475.6C98.4 493.1 86.4 512 68.8 512L64 512C46.3 512 32 526.3 32 544C32 561.7 46.3 576 64 576L208 576C269.9 576 320 525.9 320 464z"/></svg></button>
      <button
        :class="{ active: activeTool === 'eraser' }"
        title="Eraser"
        @click="setActiveTool('eraser')"
      ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M210.5 480L333.5 480L398.8 414.7L225.3 241.2L98.6 367.9L210.6 479.9zM256 544L210.5 544C193.5 544 177.2 537.3 165.2 525.3L49 409C38.1 398.1 32 383.4 32 368C32 352.6 38.1 337.9 49 327L295 81C305.9 70.1 320.6 64 336 64C351.4 64 366.1 70.1 377 81L559 263C569.9 273.9 576 288.6 576 304C576 319.4 569.9 334.1 559 345L424 480L544 480C561.7 480 576 494.3 576 512C576 529.7 561.7 544 544 544L256 544z"/></svg></button>
      <button
        :class="{ active: activeTool === 'picker' }"
        title="Color Picker"
        @click="setActiveTool('picker')"
      ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M405.6 93.2L304 194.8L294.6 185.4C282.1 172.9 261.8 172.9 249.3 185.4C236.8 197.9 236.8 218.2 249.3 230.7L409.3 390.7C421.8 403.2 442.1 403.2 454.6 390.7C467.1 378.2 467.1 357.9 454.6 345.4L445.2 336L546.8 234.4C585.8 195.4 585.8 132.2 546.8 93.3C507.8 54.4 444.6 54.3 405.7 93.3zM119.4 387.3C104.4 402.3 96 422.7 96 443.9L96 486.3L69.4 526.2C60.9 538.9 62.6 555.8 73.4 566.6C84.2 577.4 101.1 579.1 113.8 570.6L153.7 544L196.1 544C217.3 544 237.7 535.6 252.7 520.6L362.1 411.2L316.8 365.9L207.4 475.3C204.4 478.3 200.3 480 196.1 480L160 480L160 443.9C160 439.7 161.7 435.6 164.7 432.6L274.1 323.2L228.8 277.9L119.4 387.3z"/></svg></button>
      <button
        v-if="previewTab === 'ansi'"
        :class="{ active: activeTool === 'char' }"
        title="Character swap"
        @click="setActiveTool('char')"
      >░</button>
    </div>

    <template v-if="activeTool === 'brush' || activeTool === 'eraser'">
      <div class="divider"/>
      <div class="brush-size-group">
        <span class="brush-size-label">Size</span>
        <input
          type="range"
          min="1"
          max="10"
          :value="editBrushSize"
          @input="setEditBrushSize(+$event.target.value)"
          title="Brush size"
          class="brush-size-slider"
        />
        <span class="brush-size-value">{{ editBrushSize }}</span>
      </div>
    </template>

    <div class="divider"/>

    <template v-if="previewTab === 'source'">
      <div class="divider"/>
      <div class="zoom-group">
        <button @click="zoomOut" :disabled="!canZoomOut" title="Zoom out">−</button>
        <span class="zoom-label">{{ zoomLabel }}</span>
        <button @click="zoomIn" :disabled="!canZoomIn" title="Zoom in">+</button>
      </div>
    </template>

    <div class="spacer"/>

    <div class="history-group">
      <button
          @click="undo"
          :disabled="!canUndo" title="Undo (Cmd+Z)"
      ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M88 256L232 256C241.7 256 250.5 250.2 254.2 241.2C257.9 232.2 255.9 221.9 249 215L202.3 168.3C277.6 109.7 386.6 115 455.8 184.2C530.8 259.2 530.8 380.7 455.8 455.7C380.8 530.7 259.3 530.7 184.3 455.7C174.1 445.5 165.3 434.4 157.9 422.7C148.4 407.8 128.6 403.4 113.7 412.9C98.8 422.4 94.4 442.2 103.9 457.1C113.7 472.7 125.4 487.5 139 501C239 601 401 601 501 501C601 401 601 239 501 139C406.8 44.7 257.3 39.3 156.7 122.8L105 71C98.1 64.2 87.8 62.1 78.8 65.8C69.8 69.5 64 78.3 64 88L64 232C64 245.3 74.7 256 88 256z"/></svg></button>
      <button
          @click="redo"
          :disabled="!canRedo" title="Redo (Cmd+Shift+Z)"
      ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M552 256L408 256C398.3 256 389.5 250.2 385.8 241.2C382.1 232.2 384.1 221.9 391 215L437.7 168.3C362.4 109.7 253.4 115 184.2 184.2C109.2 259.2 109.2 380.7 184.2 455.7C259.2 530.7 380.7 530.7 455.7 455.7C463.9 447.5 471.2 438.8 477.6 429.6C487.7 415.1 507.7 411.6 522.2 421.7C536.7 431.8 540.2 451.8 530.1 466.3C521.6 478.5 511.9 490.1 501 501C401 601 238.9 601 139 501C39.1 401 39 239 139 139C233.3 44.7 382.7 39.4 483.3 122.8L535 71C541.9 64.1 552.2 62.1 561.2 65.8C570.2 69.5 576 78.3 576 88L576 232C576 245.3 565.3 256 552 256z"/></svg></button>
    </div>

    <button
      class="apply-btn"
      title="Bake paint into original image"
      :disabled="!hasPaint"
      @click="confirmFlatten"
    >Apply Edits</button>
    <button class="clear-btn" title="Clear all edits" @click="confirmClear">Clear Edits</button>
  </div>
</template>

<style scoped>
.edit-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--surface-1);
  border-bottom: 1px solid var(--border);
  min-height: 34px;
  flex-shrink: 0;
}

.tool-group,
.color-group,
.zoom-group,
.history-group {
  display: flex;
  align-items: center;
  gap: 3px;
  user-select: none;
}

.history-group {
  margin-right: 4px;
}

.divider {
  width: 1px;
  height: 18px;
  background: var(--border);
  margin: 0 2px;
  flex-shrink: 0;
}

.spacer {
  flex: 1;
}

button {
  padding: 3px 8px;
  font-size: 13px;
  min-width: 28px;
  height: 26px;
  border-radius: 4px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  padding: 3px 5px;
}
button svg {
  fill: var(--text-faint);
}

button:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text);
}

button:hover svg {
  fill: var(--text);
}

button.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--white);
}

button.active svg {
  fill: var(--text);
}

button:disabled {
  opacity: 0.35;
  cursor: default;
}
button svg {
  width: 18px;
  height: 18px;
}

.color-group label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  cursor: pointer;
}

.color-group input[type=color] {
  width: 32px;
  height: 26px;
  padding: 3px;
  border-radius: 4px 0 0 4px;
  border-right: none;
}

.color-preview-container {
  display: flex;
  align-items: center;
}

.effective-preview {
  width: 16px;
  height: 26px;
  border: 1px solid var(--border);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0 4px 4px 0;
  box-shadow: inset 0 0 4px rgba(0,0,0,0.2);
}

.brush-size-group {
  display: flex;
  align-items: center;
  gap: 5px;
}

.brush-size-label,
.brush-size-value {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  user-select: none;
}

.brush-size-value {
  min-width: 14px;
  text-align: right;
}

.brush-size-slider {
  width: 70px;
  cursor: pointer;
  accent-color: var(--accent);
}

.zoom-label {
  font-family: 'Simple Console', monospace;
  font-size: 12px;
  min-width: 26px;
  text-align: center;
  color: var(--text-muted);
}

.apply-btn,
.clear-btn {
  font-size: 11px;
  color: var(--text-faint);
  border-color: transparent;
  background: transparent;
  padding: 3px 5px;
  height: 26px;
}

.apply-btn:hover:not(:disabled),
.clear-btn:hover:not(:disabled) {
  color: var(--accent-hot);
  background: transparent;
  border-color: transparent;
}

.apply-btn:disabled,
.clear-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
</style>
