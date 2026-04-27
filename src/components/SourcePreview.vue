<script>
import { mapState, mapActions } from 'pinia';
import { useCurrentFileStore } from '@/store/CurrentFile';

export default {
  name: 'SourcePreview',
  props: {
    canvas: {
      type: HTMLCanvasElement,
      required: false,
    }
  },
  computed: {
    ...mapState(useCurrentFileStore, ['rows', 'cols', 'image', 'hasEdits']),
    gridHeight() {
      return ((Math.floor(this.rows * 0.5) * 1.22)) * 0.5 + 'em';
    },
    gridWidth() {
      return (this.cols * 0.528) * 0.5 + 'em';
    },
  },
  watch: {
    canvas: 'updatePreview',
  },
  mounted() {
    this.updatePreview();
  },
  methods: {
    ...mapActions(useCurrentFileStore, ['clearImage']),
    confirmClear() {
      if (this.hasEdits) {
        if (!confirm('You have unsaved changes. Are you sure you want to clear this image?')) {
          return;
        }
      }
      this.clearImage();
    },
    updatePreview() {
      if (!this.$refs.preview) return;
      this.$refs.preview.innerHTML = '';
      if (this.canvas) {
        this.$refs.preview.appendChild(this.canvas);
      }
    },
  },
};
</script>

<template>
  <article>
    <div ref="preview"></div>
    <button title="Clear Image" @click="confirmClear">×</button>
  </article>
</template>

<style scoped>
article {
  margin: auto;
  padding: 10px;
  position: relative;
}

article :deep(canvas) {
  display: block;
  image-rendering: pixelated;
  width: v-bind(gridWidth);
  height: v-bind(gridHeight);
  outline: 2px dashed var(--border-light);
}

button {
  display: flex;
  position: absolute;
  z-index: 10;
  top: 0;
  right: 0;
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 50%;
  justify-content: center;
  font-size: 20px;
  line-height: 1.2;
  transition: background-color, transform, border-color 0.2s ease;
  background: var(--surface-1);
  border: 2px solid var(--accent);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  color: var(--text);
}

button:hover {
  transform: scale(1.1);
  background: var(--accent-hot);
  border-color: var(--white);
  color: var(--white);
}
</style>
