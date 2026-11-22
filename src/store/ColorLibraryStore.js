import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';
import { SLUG } from '@/lib/lospec.js';
import { MOST_COLORS } from '@/lib/colorList.js';
import shipped from '@/lib/colorPalettes.json';

export const SHIPPED = shipped;

const HEX = /^#[0-9a-f]{6}$/;
const cut = (s) => s.slice(0, 100);

// A stored entry as a favorite, or null when it isn't one: localStorage can hold anything.
const sound = (p) => {
  if (!p || typeof p !== 'object' || typeof p.slug !== 'string' || !SLUG.test(p.slug)) return null;
  if (typeof p.name !== 'string' || !p.name) return null;
  if (!Array.isArray(p.colors) || !p.colors.length || p.colors.length > MOST_COLORS) return null;
  if (!p.colors.every(c => typeof c === 'string' && HEX.test(c))) return null;
  return { slug: p.slug, name: cut(p.name), author: typeof p.author === 'string' ? cut(p.author) : '', colors: [...p.colors] };
};

// The color palettes you starred in the Colors dialog, kept in this browser, newest first.
export const useColorLibraryStore = defineStore('colorLibrary', {
  state: () => ({
    favorites: useLocalStorage('phosphor.colorFavorites', []), // { slug, name, author, colors }[]
  }),

  getters: {
    // One a slug, the first: a hand-edited store, or two tabs, can hold a slug twice.
    kept: (state) => {
      const seen = new Set();
      return (Array.isArray(state.favorites) ? state.favorites : []).map(sound).filter(p => p && !seen.has(p.slug) && seen.add(p.slug));
    },
    has() {
      return (slug) => this.kept.some(p => p.slug === slug);
    },
  },

  actions: {
    toggle(palette) {
      if (this.has(palette.slug)) this.favorites = this.kept.filter(p => p.slug !== palette.slug);
      else this.keep(palette);
    },

    // Stored as `kept` would read it back; an unsound palette stores nothing.
    keep(palette) {
      const p = sound(palette);
      if (p) this.favorites = [p, ...this.kept.filter(k => k.slug !== p.slug)];
    },
  },
});
