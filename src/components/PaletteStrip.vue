<script setup>
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { usePaletteStore } from '@/store/PaletteStore';
import { typeAtCursor } from '@/composables/useTextTool';
import CharPaletteLayer from '@/components/CharPaletteLayer.vue';

// The Text tool's F-key strip: the active palette's 12 glyphs (tap one to type it, which is how
// touch screens use F-keys), and the palette controls on the right. No palette name, so the strip
// never shifts; names are in the palette layer.
const project = useProjectStore();
const workspace = useWorkspaceStore();
const palettes = usePaletteStore();

const use = (glyph) => {
  if (!glyph) return;
  workspace.activeChar = glyph;
  typeAtCursor(project, workspace, glyph);
};
</script>

<template>
  <div class="palette-strip">
    <div class="keys">
      <button
          v-for="(glyph, i) in palettes.active.glyphs"
          :key="i"
          class="key"
          :class="{ flash: palettes.flashIndex === i, empty: !glyph }"
          :title="glyph ? `F${i + 1}: ${glyph}` : `F${i + 1}: empty`"
          :aria-label="`F${i + 1}`"
          @mousedown.prevent
          @click="use(glyph)"
      >
        <small>F{{ i + 1 }}</small>
        <span v-if="glyph">{{ glyph }}</span>
        <span v-else>&nbsp;</span>
      </button>
    </div>
    <div class="spacer"></div>
    <!-- Clicks don't take focus, so a following Space/Enter types instead of re-pressing the button. -->
    <button class="nav" title="Previous palette (Alt+←)" aria-label="Previous palette" @mousedown.prevent @click="palettes.flip(-1)">◂</button>
    <button
        class="nav"
        :class="{ on: workspace.paletteLayerOpen }"
        data-palette-toggle
        title="Palettes"
        aria-label="Palettes"
        @mousedown.prevent
        @click="workspace.paletteLayerOpen = !workspace.paletteLayerOpen"
    >▤</button>
    <button class="nav" title="Next palette (Alt+→)" aria-label="Next palette" @mousedown.prevent @click="palettes.flip(1)">▸</button>
    <CharPaletteLayer v-if="workspace.paletteLayerOpen" @close="workspace.paletteLayerOpen = false"/>
  </div>
</template>

<style scoped>
div.palette-strip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

div.keys {
  display: flex;
  gap: 3px;
}

button.key {
  width: 30px;
  padding: 2px 0 3px;
  border: none;
  border-radius: 4px;
  background: var(--surface-3);
  color: var(--text);
  text-align: center;
  cursor: pointer;
}

button.key small {
  display: block;
  font-size: 8px;
  color: var(--text-muted);
}

button.key span {
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  line-height: 18px;
}

button.key.empty {
  opacity: 0.5;
}

button.key.flash {
  animation: slot-flash 1.2s ease-out;
}

@keyframes slot-flash {
  0% { background: var(--accent-hot); }
  100% { background: var(--surface-3); }
}

.spacer {
  flex: 1;
}

button.nav {
  padding: 4px 9px;
  border: none;
  border-radius: 4px;
  background: var(--surface-3);
  color: var(--text-dim);
  cursor: pointer;
}

button.nav.on {
  background: var(--accent);
  color: var(--white);
}
</style>
