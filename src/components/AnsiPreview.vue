<script>
import { mapState } from 'pinia';
import { useCurrentFileStore } from '@/store/CurrentFile';
import { calcMetrics, getContext } from '@/lib/AnsiRuntime';
import { render as renderText } from '@/lib/TextRenderer';

export default {
  name: 'AnsiPreview',
  computed: {
    ...mapState(useCurrentFileStore, ['blockData', 'cols', 'rows']),
  },
  watch: {
    blockData: 'render',
    cols: 'render',
    rows: 'render',
  },
  mounted() {
    this.render();
  },
  methods: {
    render() {
      if (!this.blockData || !this.blockData.length || !this.$refs.ansiPreview) return;

      if (!this._metrics) {
        this._metrics = calcMetrics(this.$refs.ansiPreview);
      }

      const context = getContext({
        element: this.$refs.ansiPreview,
        cols: this.cols,
        rows: Math.floor(this.rows * 0.5),
      }, this._metrics);

      const buffer = [];
      for (let j = 0; j < context.rows; j++) {
        const offs = j * context.cols;
        for (let i = 0; i < context.cols; i++) {
          const idx = i + offs;
          const pixelI = j * context.cols * 2 + i;
          const bg = this.blockData[pixelI];
          const fg = this.blockData[pixelI + context.cols];

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
    },
  },
};
</script>

<template>
  <article>
    <pre ref="ansiPreview"></pre>
  </article>
</template>

<style scoped>
article {
  margin: auto;
  padding: 60px;
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
  background: var(--surface-black);
  outline: 2px dashed var(--border-light);
}

@media (max-width: 768px) {
  article {
    padding: 10px;
  }
}
</style>
