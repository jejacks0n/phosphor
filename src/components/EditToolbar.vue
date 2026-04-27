<script>
import { mapState, mapWritableState, mapActions } from 'pinia';
import { useCurrentFileStore } from '@/store/CurrentFile';
import { hex2rgb, rgb2hex } from '@/lib/ColorUtils';
import { applyTransforms } from '@/lib/PixelTransforms';
import DropdownMenu from './DropdownMenu.vue';

export default {
  name: 'EditToolbar',
  components: {
    DropdownMenu
  },
  computed: {
    ...mapState(useCurrentFileStore, {
      activeTool: 'activeTool',
      editZoom: 'editZoom',
      editBrushSize: 'editBrushSize',
      editBrushOpacity: 'editBrushOpacity',
      editBrushFlow: 'editBrushFlow',
      editBrushHardness: 'editBrushHardness',
      editFillTolerance: 'editFillTolerance',
      editFillContiguous: 'editFillContiguous',
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
      activePalette: 'activePalette',
    }),
    ...mapWritableState(useCurrentFileStore, ['editFgColor']),
    effectiveColor() {
      const rgb = hex2rgb(this.editFgColor);
      const data = new Uint8ClampedArray([rgb.r, rgb.g, rgb.b, 255]);
      applyTransforms(data, this.brightness, this.contrast, this.saturation, this.hue, this.invert);

      let r = data[0], g = data[1], b = data[2];

      // Quantize to active palette if one exists
      if (this.activePalette && this.activePalette.length > 0) {
        let minDist = Infinity;
        let nearest = this.activePalette[0];
        for (const p of this.activePalette) {
          const dr = r - p.r, dg = g - p.g, db = b - p.b;
          const dist = dr * dr + dg * dg + db * db;
          if (dist < minDist) {
            minDist = dist;
            nearest = p;
          }
        }
        r = nearest.r; g = nearest.g; b = nearest.b;
      }

      return rgb2hex({ r, g, b });
    },
    zoomLabel() {
      const z = this.editZoom;
      return z < 10 ? `${z.toFixed(1)}×` : `${Math.round(z)}×`;
    },
    canZoomOut() {
      return this.editZoom > 0.5;
    },
    canZoomIn() {
      return this.editZoom < 32;
    },
    showSecondaryRow() {
      return ['brush', 'eraser', 'bucket'].includes(this.activeTool);
    }
  },
  methods: {
    ...mapActions(useCurrentFileStore, [
      'setActiveTool',
      'setEditZoom',
      'setEditBrushSize',
      'setEditBrushOpacity',
      'setEditBrushFlow',
      'setEditBrushHardness',
      'setEditFillTolerance',
      'setEditFillContiguous',
      'clearEditLayer',
      'undo',
      'redo',
      'flattenEdits'
    ]),
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
      if (this.editZoom > 2) {
        this.setEditZoom(this.editZoom - 1);
      } else {
        this.setEditZoom(this.editZoom - 0.5);
      }
    },
    zoomIn() {
      if (this.editZoom >= 2) {
        this.setEditZoom(this.editZoom + 1);
      } else {
        this.setEditZoom(this.editZoom + 0.5);
      }
    },
  },
};
</script>

<template>
  <div class="edit-toolbar" :class="{ 'has-secondary': showSecondaryRow }">
    <div class="toolbar-row primary-row">
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
            :class="{ active: activeTool === 'hand' }"
            title="Hand Tool (Pan)"
            @click="setActiveTool('hand')"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320.5 64C295.2 64 273.3 78.7 262.9 100C255.9 97.4 248.4 96 240.5 96C205.2 96 176.5 124.7 176.5 160L176.5 325.5L173.8 322.8C148.8 297.8 108.3 297.8 83.3 322.8C58.3 347.8 58.3 388.3 83.3 413.3L171 501C219 549 284.1 576 352 576L368.5 576C370 576 371.5 575.9 373 575.6C464.7 569.4 538 496.2 544.1 404.5C544.4 403 544.5 401.5 544.5 400L544.5 224C544.5 188.7 515.8 160 480.5 160C475 160 469.6 160.7 464.5 162L464.5 160C464.5 124.7 435.8 96 400.5 96C392.6 96 385.1 97.4 378.1 100C367.7 78.7 345.8 64 320.5 64zM304.5 160.1L304.5 160L304.5 128C304.5 119.2 311.7 112 320.5 112C329.3 112 336.5 119.2 336.5 128L336.5 296C336.5 309.3 347.2 320 360.5 320C373.8 320 384.5 309.3 384.5 296L384.5 160C384.5 151.2 391.7 144 400.5 144C409.3 144 416.5 151.2 416.5 160L416.5 296C416.5 309.3 427.2 320 440.5 320C453.8 320 464.5 309.3 464.5 296L464.5 224C464.5 215.2 471.7 208 480.5 208C489.3 208 496.5 215.2 496.5 224L496.5 396.9C496.4 397.5 496.4 398.2 496.3 398.8C492.9 468.5 437 524.4 367.3 527.8C366.7 527.8 366 527.9 365.4 528L352 528C296.9 528 244 506.1 205 467.1L117.2 379.3C111 373.1 111 362.9 117.2 356.7C123.4 350.5 133.6 350.5 139.8 356.7L183.5 400.4C190.4 407.3 200.7 409.3 209.7 405.6C218.7 401.9 224.5 393.1 224.5 383.4L224.5 160C224.5 151.2 231.7 144 240.5 144C249.3 144 256.5 151.1 256.5 159.9L256.5 296C256.5 309.3 267.2 320 280.5 320C293.8 320 304.5 309.3 304.5 296L304.5 160.1z"/></svg></button>
        <button
            :class="{ active: activeTool === 'pencil' }"
            title="Pencil (1px)"
            @click="setActiveTool('pencil')"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M100.4 417.2C104.5 402.6 112.2 389.3 123 378.5L304.2 197.3L338.1 163.4C354.7 180 389.4 214.7 442.1 267.4L476 301.3L442.1 335.2L260.9 516.4C250.2 527.1 236.8 534.9 222.2 539L94.4 574.6C86.1 576.9 77.1 574.6 71 568.4C64.9 562.2 62.6 553.3 64.9 545L100.4 417.2zM156 413.5C151.6 418.2 148.4 423.9 146.7 430.1L122.6 517L209.5 492.9C215.9 491.1 221.7 487.8 226.5 483.2L155.9 413.5zM510 267.4C493.4 250.8 458.7 216.1 406 163.4L372 129.5C398.5 103 413.4 88.1 416.9 84.6C430.4 71 448.8 63.4 468 63.4C487.2 63.4 505.6 71 519.1 84.6L554.8 120.3C568.4 133.9 576 152.3 576 171.4C576 190.5 568.4 209 554.8 222.5C551.3 226 536.4 240.9 509.9 267.4z"/></svg></button>
        <button
            :class="{ active: activeTool === 'brush' }"
            title="Brush (soft)"
            @click="setActiveTool('brush')"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M512.5 74.3L291.1 222C262 241.4 243.5 272.9 240.5 307.3C302.8 320.1 351.9 369.2 364.8 431.6C399.3 428.6 430.7 410.1 450.1 381L597.7 159.5C604.4 149.4 608 137.6 608 125.4C608 91.5 580.5 64 546.6 64C534.5 64 522.6 67.6 512.5 74.3zM320 464C320 402.1 269.9 352 208 352C146.1 352 96 402.1 96 464C96 467.9 96.2 471.8 96.6 475.6C98.4 493.1 86.4 512 68.8 512L64 512C46.3 512 32 526.3 32 544C32 561.7 46.3 576 64 576L208 576C269.9 576 320 525.9 320 464z"/></svg></button>
        <button
            :class="{ active: activeTool === 'eraser' }"
            title="Eraser"
            @click="setActiveTool('eraser')"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M210.5 480L333.5 480L398.8 414.7L225.3 241.2L98.6 367.9L210.6 479.9zM256 544L210.5 544C193.5 544 177.2 537.3 165.2 525.3L49 409C38.1 398.1 32 383.4 32 368C32 352.6 38.1 337.9 49 327L295 81C305.9 70.1 320.6 64 336 64C351.4 64 366.1 70.1 377 81L559 263C569.9 273.9 576 288.6 576 304C576 319.4 569.9 334.1 559 345L424 480L544 480C561.7 480 576 494.3 576 512C576 529.7 561.7 544 544 544L256 544z"/></svg></button>
        <button
            :class="{ active: activeTool === 'bucket' }"
            title="Paint Bucket (fill)"
            @click="setActiveTool('bucket')"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M341.7 135.6L277.3 200L310.7 233.4C323.2 245.9 323.2 266.2 310.7 278.7C298.2 291.2 277.9 291.2 265.4 278.7L232 245.3L135.6 341.7C132.7 344.6 130.5 348.2 129.3 352L450.8 352L504.5 298.3C509.4 293.4 512.1 286.8 512.1 280C512.1 273.2 509.4 266.5 504.5 261.7L378.3 135.6C373.5 130.7 366.9 128 360 128C353.1 128 346.5 130.7 341.7 135.6zM90.3 296.4L186.7 200L137.3 150.6C124.8 138.1 124.8 117.8 137.3 105.3C149.8 92.8 170.1 92.8 182.6 105.3L232 154.7L296.4 90.3C313.3 73.5 336.1 64 360 64C383.9 64 406.7 73.5 423.6 90.3L549.7 216.4C566.5 233.3 576 256.1 576 280C576 303.9 566.5 326.7 549.7 343.6L343.6 549.7C326.7 566.5 303.9 576 280 576C256.1 576 233.3 566.5 216.4 549.7L90.3 423.6C73.5 406.7 64 383.9 64 360C64 336.1 73.5 313.3 90.3 296.4zM544 608C508.7 608 480 579.3 480 544C480 518.8 512.6 464.4 531.2 435.3C537.2 425.9 550.7 425.9 556.7 435.3C575.4 464.4 607.9 518.8 607.9 544C607.9 579.3 579.2 608 543.9 608z"/></svg></button>
        <button
            :class="{ active: activeTool === 'picker' }"
            title="Color Picker"
            @click="setActiveTool('picker')"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M405.6 93.2L304 194.8L294.6 185.4C282.1 172.9 261.8 172.9 249.3 185.4C236.8 197.9 236.8 218.2 249.3 230.7L409.3 390.7C421.8 403.2 442.1 403.2 454.6 390.7C467.1 378.2 467.1 357.9 454.6 345.4L445.2 336L546.8 234.4C585.8 195.4 585.8 132.2 546.8 93.3C507.8 54.4 444.6 54.3 405.7 93.3zM119.4 387.3C104.4 402.3 96 422.7 96 443.9L96 486.3L69.4 526.2C60.9 538.9 62.6 555.8 73.4 566.6C84.2 577.4 101.1 579.1 113.8 570.6L153.7 544L196.1 544C217.3 544 237.7 535.6 252.7 520.6L362.1 411.2L316.8 365.9L207.4 475.3C204.4 478.3 200.3 480 196.1 480L160 480L160 443.9C160 439.7 161.7 435.6 164.7 432.6L274.1 323.2L228.8 277.9L119.4 387.3z"/></svg></button>
        <button
            v-if="previewTab === 'ansi'"
            :class="{ active: activeTool === 'flip' }"
            title="Flip FG/BG Colors"
            @click="setActiveTool('flip')"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M544.1 256L552 256C565.3 256 576 245.3 576 232L576 88C576 78.3 570.2 69.5 561.2 65.8C552.2 62.1 541.9 64.2 535 71L483.3 122.8C439 86.1 382 64 320 64C191 64 84.3 159.4 66.6 283.5C64.1 301 76.2 317.2 93.7 319.7C111.2 322.2 127.4 310 129.9 292.6C143.2 199.5 223.3 128 320 128C364.4 128 405.2 143 437.7 168.3L391 215C384.1 221.9 382.1 232.2 385.8 241.2C389.5 250.2 398.3 256 408 256L544.1 256zM573.5 356.5C576 339 563.8 322.8 546.4 320.3C529 317.8 512.7 330 510.2 347.4C496.9 440.4 416.8 511.9 320.1 511.9C275.7 511.9 234.9 496.9 202.4 471.6L249 425C255.9 418.1 257.9 407.8 254.2 398.8C250.5 389.8 241.7 384 232 384L88 384C74.7 384 64 394.7 64 408L64 552C64 561.7 69.8 570.5 78.8 574.2C87.8 577.9 98.1 575.8 105 569L156.8 517.2C201 553.9 258 576 320 576C449 576 555.7 480.6 573.4 356.5z"/></svg></button>
        <button
            v-if="previewTab === 'ansi'"
            :class="{ active: activeTool === 'char' }"
            title="Character swap"
            @click="setActiveTool('char')"
        >░</button>
      </div>

      <template v-if="previewTab === 'source'">
        <div class="divider"/>
        <div class="zoom-group">
          <button class="desktop-only" @click="zoomOut" :disabled="!canZoomOut" title="Zoom out">−</button>
          <span class="zoom-label">{{ zoomLabel }}</span>
          <button class="desktop-only" @click="zoomIn" :disabled="!canZoomIn" title="Zoom in">+</button>
        </div>
      </template>
      <div class="spacer"/>

      <div class="desktop-only actions-container">
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
            class="final-btn"
            title="Bake paint into original image"
            :disabled="!hasPaint"
            @click="confirmFlatten"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M530.8 134.1C545.1 144.5 548.3 164.5 537.9 178.8L281.9 530.8C276.4 538.4 267.9 543.1 258.5 543.9C249.1 544.7 240 541.2 233.4 534.6L105.4 406.6C92.9 394.1 92.9 373.8 105.4 361.3C117.9 348.8 138.2 348.8 150.7 361.3L252.2 462.8L486.2 141.1C496.6 126.8 516.6 123.6 530.9 134z"/></svg></button>
        <button
            class="final-btn"
            title="Clear all edits"
            :disabled="!hasEdits"
            @click="confirmClear"
        ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M431.2 476.5L163.5 208.8C141.1 240.2 128 278.6 128 320C128 426 214 512 320 512C361.5 512 399.9 498.9 431.2 476.5zM476.5 431.2C498.9 399.8 512 361.4 512 320C512 214 426 128 320 128C278.5 128 240.1 141.1 208.8 163.5L476.5 431.2zM64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/></svg></button>
      </div>

      <div class="mobile-only">
        <DropdownMenu label="Edits">
          <button @click="undo" :disabled="!canUndo">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M88 256L232 256C241.7 256 250.5 250.2 254.2 241.2C257.9 232.2 255.9 221.9 249 215L202.3 168.3C277.6 109.7 386.6 115 455.8 184.2C530.8 259.2 530.8 380.7 455.8 455.7C380.8 530.7 259.3 530.7 184.3 455.7C174.1 445.5 165.3 434.4 157.9 422.7C148.4 407.8 128.6 403.4 113.7 412.9C98.8 422.4 94.4 442.2 103.9 457.1C113.7 472.7 125.4 487.5 139 501C239 601 401 601 501 501C601 401 601 239 501 139C406.8 44.7 257.3 39.3 156.7 122.8L105 71C98.1 64.2 87.8 62.1 78.8 65.8C69.8 69.5 64 78.3 64 88L64 232C64 245.3 74.7 256 88 256z"/></svg>
            Undo
          </button>
          <button @click="redo" :disabled="!canRedo">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M552 256L408 256C398.3 256 389.5 250.2 385.8 241.2C382.1 232.2 384.1 221.9 391 215L437.7 168.3C362.4 109.7 253.4 115 184.2 184.2C109.2 259.2 109.2 380.7 184.2 455.7C259.2 530.7 380.7 530.7 455.7 455.7C463.9 447.5 471.2 438.8 477.6 429.6C487.7 415.1 507.7 411.6 522.2 421.7C536.7 431.8 540.2 451.8 530.1 466.3C521.6 478.5 511.9 490.1 501 501C401 601 238.9 601 139 501C39.1 401 39 239 139 139C233.3 44.7 382.7 39.4 483.3 122.8L535 71C541.9 64.1 552.2 62.1 561.2 65.8C570.2 69.5 576 78.3 576 88L576 232C576 245.3 565.3 256 552 256z"/></svg>
            Redo
          </button>
          <button @click="confirmFlatten" :disabled="!hasPaint">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M530.8 134.1C545.1 144.5 548.3 164.5 537.9 178.8L281.9 530.8C276.4 538.4 267.9 543.1 258.5 543.9C249.1 544.7 240 541.2 233.4 534.6L105.4 406.6C92.9 394.1 92.9 373.8 105.4 361.3C117.9 348.8 138.2 348.8 150.7 361.3L252.2 462.8L486.2 141.1C496.6 126.8 516.6 123.6 530.9 134z"/></svg>
            Apply Edits
          </button>
          <button @click="confirmClear" :disabled="!hasEdits">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M431.2 476.5L163.5 208.8C141.1 240.2 128 278.6 128 320C128 426 214 512 320 512C361.5 512 399.9 498.9 431.2 476.5zM476.5 431.2C498.9 399.8 512 361.4 512 320C512 214 426 128 320 128C278.5 128 240.1 141.1 208.8 163.5L476.5 431.2zM64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320z"/></svg>
            Clear Edits
          </button>
        </DropdownMenu>
      </div>
    </div>

    <div class="toolbar-row secondary-row" v-if="showSecondaryRow">
      <div class="brush-size-group" v-if="activeTool === 'brush' || activeTool === 'eraser'">
        <span class="brush-size-label">Size</span>
        <input
            type="range"
            min="1"
            max="20"
            step="0.1"
            :value="editBrushSize"
            @input="setEditBrushSize(+$event.target.value)"
            title="Brush size"
            class="brush-size-slider"
        />
        <span class="brush-size-value">{{ editBrushSize.toFixed(1) }}</span>

        <div class="divider"/>

        <span class="brush-size-label">Opacity</span>
        <input
            type="range"
            min="1"
            max="100"
            :value="editBrushOpacity"
            @input="setEditBrushOpacity(+$event.target.value)"
            title="Brush opacity"
            class="brush-size-slider"
        />
        <span class="brush-size-value">{{ editBrushOpacity }}%</span>

        <div class="divider"/>

        <span class="brush-size-label">Flow</span>
        <input
            type="range"
            min="1"
            max="100"
            :value="editBrushFlow"
            @input="setEditBrushFlow(+$event.target.value)"
            title="Brush flow"
            class="brush-size-slider"
        />
        <span class="brush-size-value">{{ editBrushFlow }}%</span>

        <div class="divider"/>

        <span class="brush-size-label">Hardness</span>
        <input
            type="range"
            min="0"
            max="100"
            :value="editBrushHardness"
            @input="setEditBrushHardness(+$event.target.value)"
            title="Brush hardness"
            class="brush-size-slider"
        />
        <span class="brush-size-value">{{ editBrushHardness }}%</span>
      </div>

      <div class="brush-size-group" v-if="activeTool === 'bucket'">
        <span class="brush-size-label">Tolerance</span>
        <input
            type="range"
            min="0"
            max="100"
            :value="editFillTolerance"
            @input="setEditFillTolerance(+$event.target.value)"
            title="Fill tolerance"
            class="brush-size-slider"
        />
        <span class="brush-size-value">{{ editFillTolerance }}</span>
        <div class="divider"/>
        <label class="checkbox-group">
          <input
              type="checkbox"
              :checked="editFillContiguous"
              @change="setEditFillContiguous($event.target.checked)"
          />
          <span>Contiguous</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.edit-toolbar {
  display: flex;
  flex-direction: column;
  background: var(--surface-1);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  min-height: 34px;
}

.secondary-row {
  background: var(--surface-dark);
  border-top: 1px solid var(--border);
  padding: 4px 10px;
  gap: 12px;
}

.tool-group,
.color-group,
.zoom-group,
.history-group,
.actions-container {
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
  min-width: 36px;
  height: 26px;
  border-radius: 4px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}
button svg {
  fill: var(--text-faint);
  width: 16px;
  height: 16px;
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
  fill: var(--white);
}

button:disabled {
  opacity: 0.35;
  cursor: default;
}

.color-group input[type=color] {
  width: 32px;
  height: 26px;
  padding: 3px;
  border-radius: 4px 0 0 4px;
  border: 1px solid var(--border);
  border-right: none;
  background: var(--surface-2);
  cursor: pointer;
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
  gap: 8px;
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
  width: 80px;
  cursor: pointer;
  accent-color: var(--accent);
}

.checkbox-group {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
}

.checkbox-group input {
  margin: 0;
  cursor: pointer;
}

.zoom-label {
  font-family: 'Simple Console', monospace;
  font-size: 12px;
  min-width: 26px;
  text-align: center;
  color: var(--text-muted);
}

.final-btn {
  border-color: transparent !important;
  background: transparent !important;
  padding: 3px 5px;
  height: 26px;
  min-width: auto;
}

.final-btn:hover:not(:disabled) svg {
  fill: var(--accent-hot);
}

.final-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.mobile-only {
  display: none;
}

@media (max-width: 768px) {
  .desktop-only, .zoom-group {
    display: none;
  }
  .mobile-only {
    display: block;
  }
}
</style>
