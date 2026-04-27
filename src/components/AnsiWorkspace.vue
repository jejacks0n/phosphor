<script>
import { mapState, mapWritableState, mapActions } from 'pinia';
import { useCurrentFileStore, allKeys as allCurrentFileKeys } from '@/store/CurrentFile';
import { processImage, getPaletteColors, applyQuantization } from '@/lib/ImageProcessor';
import { rgb2hex } from '@/lib/ColorUtils';
import Random from 'random-seed';
import Canvas from '@/lib/Canvas';

import WorkspaceTabs from './WorkspaceTabs.vue';
import ZeroState from './ZeroState.vue';
import SauceEditor from './SauceEditor.vue';
import DropZone from './DropZone.vue';
import AnsiPreview from './AnsiPreview.vue';
import SourcePreview from './SourcePreview.vue';
import AnsiEdit from './AnsiEdit.vue';
import SourceEdit from './SourceEdit.vue';
import EditToolbar from './EditToolbar.vue';

export default {
  name: 'AnsiWorkspace',
  components: {
    WorkspaceTabs,
    ZeroState,
    SauceEditor,
    DropZone,
    AnsiPreview,
    SourcePreview,
    AnsiEdit,
    SourceEdit,
    EditToolbar,
  },
  data() {
    return {
      pipelineCanvas: null,
      outputCanvas: null,
    };
  },
  computed: {
    ...mapWritableState(useCurrentFileStore, allCurrentFileKeys),
    ...mapState(useCurrentFileStore, ['hasEdits']),
    processParams() {
      return {
        seed: this.seed,
        cols: this.cols,
        rows: this.rows,
        chars: this.chars,
        smoothing: this.smoothing,
        invert: this.invert,
        brightness: this.brightness,
        contrast: this.contrast,
        saturation: this.saturation,
        sharpen: this.sharpen,
        flatten: this.flatten,
        edges: this.edges,
        edgeColor: this.edgeColor,
        edgeThickness: this.edgeThickness,
        hue: this.hue,
        quantize: this.quantize,
        palette: this.palette,
        colorCount: this.colorCount,
        image: this.image,
        alphaMode: this.alphaMode,
      };
    },
  },
  mounted() {
    this.queueSetup();
    window.addEventListener('keydown', this.handleGlobalKeyDown);
    window.addEventListener('keyup', this.handleGlobalKeyUp);
    window.addEventListener('contextmenu', this.handleContextMenu);
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.handleGlobalKeyDown);
    window.removeEventListener('keyup', this.handleGlobalKeyUp);
    window.removeEventListener('contextmenu', this.handleContextMenu);
  },
  watch: {
    processParams: {
      deep: true,
      handler() {
        this.queueSetup();
        this.markDirty();
      },
    },
    clearEditsFlag() {
      this.queueSetup();
    },
  },
  methods: {
    ...mapActions(useCurrentFileStore, [
      'setImageFromFile',
      'clearImage',
      'markDirty',
      'toggleSettings',
      'initEditCanvas',
      'compositeEditCanvas',
      'refreshBlockData',
      'applyCharEdits',
      'setActiveTool',
      'undo',
      'redo',
    ]),
    handleContextMenu(e) {
      if (this.activeTool === 'picker') {
        e.preventDefault();
      }
    },
    handleGlobalKeyDown(e) {
      // Undo/Redo shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
        return;
      }

      if (e.key === 'Control' && this.activeTool !== 'picker') {
        this.previousTool = this.activeTool;
        this.setActiveTool('picker');
      }
    },
    handleGlobalKeyUp(e) {
      if (e.key === 'Control' && this.previousTool) {
        this.setActiveTool(this.previousTool);
        this.previousTool = null;
      }
    },
    handleFileSelected(file) {
      if (this.image && this.hasEdits) {
        if (!confirm('You have unsaved changes. Are you sure you want to load a new image?')) {
          return;
        }
      }
      this.setImageFromFile(file);
    },
    queueSetup() {
      if (this._setupFrame) cancelAnimationFrame(this._setupFrame);
      this._setupFrame = requestAnimationFrame(() => this.setup());
    },
    async setup() {
      if (!this.image) return;

      const { canvas: pipelineCanvas, blockData: pipelineBlockData, paletteColors } = await processImage(this.image, this.processParams);
      this.pipelineCanvas = pipelineCanvas.canvas;
      this.activePalette = paletteColors;

      if (!this.editCanvas) {
        this.initEditCanvas(this.image.naturalWidth, this.image.naturalHeight);
      }

      // 1. Prepare final output canvas at grid resolution
      const oc = document.createElement('canvas');
      oc.width = this.cols;
      oc.height = this.rows;
      oc.getContext('2d', { willReadFrequently: true });

      // 2. Composite paint over filtered image
      this.compositeEditCanvas(this.pipelineCanvas, oc);

      // 3. Late-stage Quantization (forced into the LOCKED palette from the base image)
      if (this.activePalette) {
        const canvasWrapper = new Canvas(oc);
        applyQuantization(canvasWrapper, this.activePalette);
      }

      // 4. Generate blockData from final quantized pixels
      const rand = new Random(this.seed);
      const charset = this.chars || "▄";
      const targetDataLength = this.cols * this.rows;
      const finalBlockData = new Array(targetDataLength);
      
      const ctx = oc.getContext('2d', { willReadFrequently: true });
      const finalPixels = ctx.getImageData(0, 0, this.cols, this.rows).data;

      for (let i = 0; i < targetDataLength; i++) {
        const i4 = i * 4;
        const r = finalPixels[i4], g = finalPixels[i4 + 1], b = finalPixels[i4 + 2];
        const hex = rgb2hex({ r, g, b });

        finalBlockData[i] = {
          r, g, b,
          hex,
          c: [r, g, b],
          char: charset[rand(charset.length)]
        };
      }

      this.blockData = finalBlockData;
      this.pipelineBlockData = pipelineBlockData || [...finalBlockData];
      
      // Still apply char overrides on top
      this.applyCharEdits();

      this.outputCanvas = oc;
    },
  },
};
</script>

<template>
  <section
      :class="{ 'settings-open': settingsOpen, editing: editMode }"
      @click="settingsOpen && toggleSettings()"
  >
    <WorkspaceTabs v-model="previewTab"/>
    <EditToolbar v-if="alphaMode && image && editMode"/>
    <DropZone @file-dropped="handleFileSelected">
      <div class="viewport" :class="{ editing: editMode }" v-if="image">
        <SourcePreview v-if="previewTab === 'source' && !alphaMode" :canvas="outputCanvas"/>
        <SourceEdit
          v-if="previewTab === 'source' && alphaMode"
          :canvas="outputCanvas"
          :pipeline-canvas="pipelineCanvas"
        />
        <AnsiPreview v-if="previewTab === 'ansi' && !alphaMode"/>
        <AnsiEdit
          v-if="previewTab === 'ansi' && alphaMode"
          :pipeline-canvas="pipelineCanvas"
          :output-canvas="outputCanvas"
        />
        <SauceEditor v-if="previewTab === 'sauce'"/>
      </div>

      <ZeroState v-else @file-selected="handleFileSelected"/>
    </DropZone>
  </section>
</template>

<style scoped>
section {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
  border-radius: 5px;
  background: var(--surface-1);
  border: 1px solid var(--accent);
}

section.editing {
  background-color: var(--surface-0);
  background-image: linear-gradient(45deg, var(--surface-dark) 25%, transparent 25%),
  linear-gradient(-45deg, var(--surface-dark) 25%, transparent 25%),
  linear-gradient(45deg, transparent 75%, var(--surface-dark) 75%),
  linear-gradient(-45deg, transparent 75%, var(--surface-dark) 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0;
}

div.viewport {
  display: inline-flex;
  min-width: 100%;
  min-height: 100%;
}

@media (max-width: 768px) {
  section {
    position: absolute;
    width: 100vw;
    height: 100dvh;
    top: 0;
    left: 0;
    border: 0;
    border-radius: 0;
    transition: transform 0.2s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  section.settings-open {
    transform: translateX(260px);
  }
}

@media (prefers-reduced-motion: reduce) {
  section {
    transition: none;
  }
}
</style>
