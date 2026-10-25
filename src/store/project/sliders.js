// The Transforms, Adjustments and Image Filters sliders as undo steps: a drag, a run of key nudges, a
// color pick, RESET and RESET ALL are one step each. Owns _sliderBefore (the values before a move)
// and _lastSlider (the step a nudge can extend).
import { SLIDER_KEYS, NUDGE_MS } from '@/store/project/shared.js';
import { RESET_GROUPS, groupDefaults } from '@/store/settings.js';

export const sliderActions = {
  // RESET ALL and a group's RESET: one undo step each.
  resetSliders() {
    this._sliderBefore ??= this.sliderValues();
    RESET_GROUPS.forEach(group => this.$patch(groupDefaults(group)));
    this.commitSliders();
  },

  resetGroup(group) {
    this._sliderBefore ??= this.sliderValues();
    this.$patch(groupDefaults(group));
    this.commitSliders();
  },

  sliderValues() {
    return Object.fromEntries(SLIDER_KEYS.map(key => [key, this[key]]));
  },

  // A slider moving (a drag, a nudge, a color being picked): the values from before it are noted
  // once, and commitSliders makes the move one undo step when it ends.
  setSlider(key, value) {
    this._sliderBefore ??= this.sliderValues();
    this[key] = value;
  },

  // The move ended: one undo step from the noted values to these, none if nothing changed. A key
  // nudge on the same slider a moment after the last nudge, with nothing else recorded between,
  // extends that step (a drag is always a step of its own).
  commitSliders(key = null, { nudge = false } = {}) {
    const before = this._sliderBefore;
    this._sliderBefore = null;
    if (!before) return;
    const after = this.sliderValues(), last = this._lastSlider;
    if (nudge && last?.key === key && last.version === this.history.version && Date.now() - last.at < NUDGE_MS) {
      last.at = Date.now();
      last.entry.after = after;
      return;
    }
    if (SLIDER_KEYS.every(k => before[k] === after[k])) return;
    this.commitPending();
    const entry = { settingsOnly: true, after, undo: () => this.$patch(before), redo: () => this.$patch(entry.after) }; // settingsOnly: kept when the grid changes (rendering.js dropEdits)
    this.pushEdit(entry);
    this._lastSlider = nudge ? { key, entry, version: this.history.version, at: Date.now() } : null;
  },
};
