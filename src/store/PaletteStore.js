import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';
import { BUILTIN_PALETTES, normalizeGlyphs, forkName, fitsGrid } from '@/lib/charPalettes';
import { t } from '@/i18n/index.js';
import { fontId } from '@/lib/BitmapFont.js';
import { useProjectStore } from '@/store/ProjectStore.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';

const RECENT_CHARS = 24;
const newId = () => `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// The Text tool's character palettes: the built-ins plus yours, the active one, and recently used
// characters. Yours and the recents belong to you, not to a project (kept in localStorage).
export const usePaletteStore = defineStore('palettes', {
  state: () => ({
    userPalettes: useLocalStorage('phosphor.palettes', []),       // { id, name, glyphs, font? }[]; font is { id, name, height } of the bitmap font it belongs to
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
        .map(p => ({ ...p, name: String(p.name ?? t('palette.untitled')), glyphs: normalizeGlyphs(Array.isArray(p.glyphs) ? p.glyphs.map(g => (typeof g === 'string' && fitsGrid(g) ? g : '')) : ''), font: p.font && typeof p.font.id === 'string' ? p.font : null })),
    ],
    // The drawing's bitmap font, as a palette's tie names it.
    currentFont() {
      const font = useProjectStore().drawingFont;
      return font ? { id: fontId(font), name: font.name, height: font.height } : null;
    },
    tied() {
      const id = this.currentFont?.id;
      return id ? this.all.filter(p => !p.builtin && p.font?.id === id) : [];
    },
    builtins: () => BUILTIN_PALETTES,
    general() {
      return this.all.filter(p => !p.builtin && !p.font);
    },
    shown() {
      return [...this.tied, ...this.builtins, ...this.general];
    },
    // Yours tied to a font that isn't in use and isn't kept in this browser.
    unloaded() {
      const known = new Set([this.currentFont?.id, ...(useWorkspaceStore().userFonts ?? []).map(f => f.id)]);
      return this.all.filter(p => p.font && !known.has(p.font.id));
    },
    countFor() {
      return (id) => this.all.filter(p => p.font?.id === id).length;
    },
    // The chosen palette when it's shown; else the font's first, else Shades (activeId stays as chosen).
    active() {
      return this.shown.find(p => p.id === this.activeId) ?? this.tied[0] ?? BUILTIN_PALETTES.find(p => p.id === 'shades');
    },
  },

  actions: {
    flip(delta) {
      const all = this.shown;
      const i = all.findIndex(p => p.id === this.active.id);
      this.activeId = all[(i + delta + all.length) % all.length].id;
    },

    // Built-ins are locked: editing one edits your copy instead (made here, and made active if the
    // built-in was). forked: the copy's name when one was just made.
    ensureEditable(id) {
      const palette = this.all.find(p => p.id === id);
      if (!palette?.builtin) return { id, forked: null };
      const copy = { id: newId(), name: forkName(palette.name, this.all.map(p => p.name)), glyphs: [...palette.glyphs], font: this.currentFont };
      this.userPalettes = [...this.userPalettes, copy];
      if (this.active.id === id) this.activeId = copy.id;
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
      const palette = { id: newId(), name: t('palette.untitled'), glyphs: normalizeGlyphs(''), font: this.currentFont };
      this.userPalettes = [...this.userPalettes, palette];
      return palette.id;
    },

    duplicate(id) {
      const source = this.all.find(p => p.id === id);
      if (!source) return null;
      const palette = { id: newId(), name: t('palette.copyName', { name: source.name }), glyphs: [...source.glyphs], font: source.builtin ? this.currentFont : source.font };
      this.userPalettes = [...this.userPalettes, palette];
      return palette.id;
    },

    // Ties one of yours to a font (or to none: it shows with any font).
    tie(id, font) {
      this.userPalettes = this.userPalettes.map(p => (p.id === id ? { ...p, font: font ? { id: font.id, name: font.name, height: font.height } : null } : p));
    },

    // Palettes from a file ({ name, glyphs, font }[]), kept under new ids and their own names (made unique). waiting:
    // the names of the fonts they're tied to that aren't loaded or in use; unused: those kept here but not in use.
    importPalettes(list) {
      const names = this.all.map(p => p.name);
      const added = list.map((p) => {
        const name = names.includes(p.name) ? forkName(p.name, names) : p.name; // a name already taken gets a suffix
        names.push(name);
        return { id: newId(), name, glyphs: [...p.glyphs], font: p.font ?? null };
      });
      this.userPalettes = [...this.userPalettes, ...added];
      const missing = new Set(this.unloaded.map(p => p.id));
      const waiting = [...new Set(added.filter(p => missing.has(p.id)).map(p => p.font.name))];
      const unused = [...new Set(added.filter(p => p.font && p.font.id !== this.currentFont?.id && !missing.has(p.id)).map(p => p.font.name))];
      return { added: added.length, waiting, unused };
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
