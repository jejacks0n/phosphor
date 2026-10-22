import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';
import { BUILTIN_PALETTES, normalizeGlyphs, forkName } from '@/lib/charPalettes';

const RECENT_CHARS = 24;
const newId = () => `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// The Text tool's character palettes: the built-ins plus yours, the active one, and recently used
// characters. Yours and the recents belong to you, not to a project (kept in localStorage).
export const usePaletteStore = defineStore('palettes', {
  state: () => ({
    userPalettes: useLocalStorage('phosphor.palettes', []),       // { id, name, glyphs }[]
    activeId: useLocalStorage('phosphor.activePalette', 'shades'),
    recentChars: useLocalStorage('phosphor.recentChars', []),
    flashIndex: null, // the F-key slot that just changed (the strip flashes it)
  }),

  getters: {
    // Saved palettes are read defensively: localStorage can hold anything.
    all: (state) => [
      ...BUILTIN_PALETTES,
      ...(Array.isArray(state.userPalettes) ? state.userPalettes : [])
        .filter(p => p && typeof p.id === 'string')
        .map(p => ({ ...p, name: String(p.name ?? 'Untitled palette'), glyphs: normalizeGlyphs(Array.isArray(p.glyphs) ? p.glyphs.map(g => (typeof g === 'string' ? g : '')) : '') })),
    ],
    active() {
      return this.all.find(p => p.id === this.activeId) ?? this.all[0];
    },
  },

  actions: {
    flip(delta) {
      const all = this.all;
      const i = all.findIndex(p => p.id === this.active.id);
      this.activeId = all[(i + delta + all.length) % all.length].id;
    },

    // Built-ins are locked: editing one edits your copy instead (made here, and made active if the
    // built-in was). forked: the copy's name when one was just made.
    ensureEditable(id) {
      const palette = this.all.find(p => p.id === id);
      if (!palette?.builtin) return { id, forked: null };
      const copy = { id: newId(), name: forkName(palette.name, this.all.map(p => p.name)), glyphs: [...palette.glyphs] };
      this.userPalettes = [...this.userPalettes, copy];
      if (this.activeId === id) this.activeId = copy.id;
      return { id: copy.id, forked: copy.name };
    },

    setSlot(id, index, char) {
      const result = this.ensureEditable(id);
      this.editGlyphs(result.id, (glyphs) => { glyphs[index] = char; });
      if (char) this.pushRecent(char);
      return result;
    },

    swapSlots(id, i, j) {
      const result = this.ensureEditable(id);
      this.editGlyphs(result.id, (glyphs) => { [glyphs[i], glyphs[j]] = [glyphs[j], glyphs[i]]; });
      return result;
    },

    create() {
      const palette = { id: newId(), name: 'Untitled palette', glyphs: normalizeGlyphs('') };
      this.userPalettes = [...this.userPalettes, palette];
      return palette.id;
    },

    duplicate(id) {
      const source = this.all.find(p => p.id === id);
      if (!source) return null;
      const palette = { id: newId(), name: `${source.name} copy`, glyphs: [...source.glyphs] };
      this.userPalettes = [...this.userPalettes, palette];
      return palette.id;
    },

    rename(id, name) {
      this.userPalettes = this.userPalettes.map(p => (p.id === id ? { ...p, name } : p));
    },

    remove(id) {
      this.userPalettes = this.userPalettes.filter(p => p.id !== id);
      if (this.activeId === id) this.activeId = BUILTIN_PALETTES[0].id;
    },

    pushRecent(char) {
      this.recentChars = [char, ...this.recentChars.filter(c => c !== char)].slice(0, RECENT_CHARS);
    },

    flash(index) {
      this.flashIndex = index;
      clearTimeout(this._flashTimer);
      this._flashTimer = setTimeout(() => { this.flashIndex = null; }, 1200);
    },

    // One of your palettes' glyphs, changed by fn (on a copy).
    editGlyphs(id, fn) {
      this.userPalettes = this.userPalettes.map((p) => {
        if (p.id !== id) return p;
        const glyphs = normalizeGlyphs(p.glyphs);
        fn(glyphs);
        return { ...p, glyphs };
      });
    },
  },
});
