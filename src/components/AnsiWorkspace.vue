<script>
import { mapWritableState, mapActions } from 'pinia';
import { useCurrentFileStore, allKeys as allCurrentFileKeys } from '@/store/CurrentFile';
import { processImage } from '@/lib/ImageProcessor';

import PreviewTabs from './PreviewTabs.vue';
import ZeroState from './ZeroState.vue';
import SauceEditor from './SauceEditor.vue';
import DropZone from './DropZone.vue';
import AnsiPreview from './AnsiPreview.vue';
import SourcePreview from './SourcePreview.vue';

export default {
  name: 'AnsiWorkspace',
  components: {
    PreviewTabs,
    ZeroState,
    SauceEditor,
    DropZone,
    AnsiPreview,
    SourcePreview,
  },
  data() {
    return {
      outputCanvas: null,
    };
  },
  computed: {
    ...mapWritableState(useCurrentFileStore, allCurrentFileKeys),
    // Aggregate all settings that should trigger a re-process
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
      };
    },
  },
  mounted() {
    this.queueSetup();
  },
  watch: {
    processParams: {
      deep: true,
      handler() {
        this.queueSetup();
        this.markDirty();
      },
    },
  },
  methods: {
    ...mapActions(useCurrentFileStore, ['setImageFromFile', 'clearImage', 'markDirty', 'toggleSettings']),
    handleFileSelected(file) {
      if (this.image && this.isDirty) {
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

      const { canvas, blockData } = await processImage(this.image, this.processParams);
      this.blockData = blockData;
      this.outputCanvas = canvas.canvas;
    },
  },
};
</script>

<template>
  <section :class="{ 'settings-open': settingsOpen }" @click="settingsOpen && toggleSettings()">
    <PreviewTabs v-model="previewTab"/>
    <DropZone @file-dropped="handleFileSelected">
      <div class="viewport" v-if="image">
        <SourcePreview v-show="previewTab === 'source'" :canvas="outputCanvas"/>
        <AnsiPreview v-show="previewTab === 'ansi'"/>
        <SauceEditor v-show="previewTab === 'sauce'"/>
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
</style>
