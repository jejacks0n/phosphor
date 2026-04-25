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
    ...mapState(useCurrentFileStore, ['rows', 'cols', 'image', 'isDirty']),
    gridHeight() {
      return ((Math.floor(this.rows * 0.5) * 1.2) + 1) + 'em';
    },
    gridWidth() {
      return (this.cols * 0.53) + 'em';
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
      if (this.isDirty) {
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
  padding: 60px;
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
  top: 45px;
  right: 45px;
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 50%;
  justify-content: center;
  align-items: center;
  font-size: 20px;
  line-height: 1;
  transition: all 0.2s ease;
  background: var(--surface-1);
  border: 2px solid var(--accent);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  color: var(--text);
}

button:hover {
  background: var(--accent-hot);
  border-color: var(--text);
  transform: scale(1.1);
}
</style>
