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
    }
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
      handler: 'queueSetup',
    },
  },
  methods: {
    ...mapActions(useCurrentFileStore, ['setImageFromFile', 'clearImage']),
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
  <section>
    <PreviewTabs v-model="previewTab"/>
    <DropZone @file-dropped="setImageFromFile">
      <div class="viewport" v-if="image">
        <SourcePreview v-show="previewTab === 'source'" :canvas="outputCanvas"/>
        <AnsiPreview v-show="previewTab === 'ansi'"/>
        <SauceEditor v-show="previewTab === 'sauce'"/>
      </div>
      <ZeroState v-else @file-selected="setImageFromFile"/>
    </DropZone>
  </section>
</template>

<style scoped>
section {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
  background: #222;
  border-radius: 5px;
  border: 1px solid var(--accent);
}

div.viewport {
  display: inline-flex;
  min-width: 100%;
  min-height: 100%;
}
</style>
