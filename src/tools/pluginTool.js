import { optionValues } from '@/plugins/solvers.js';
import { beginRun, endRun } from '@/plugins/hangMark';
import { usePluginStore } from '@/store/PluginStore';
import { toast } from '@/composables/useToast';
import { t } from '@/i18n/index.js';

// What a plugin's tools share, whatever their kind ('brush': tools/pluginBrush.js, 'shape': tools/vshape.js): the
// options they declare as toolbar options, the first call of a visit run under the hang mark, and a failure said. A ref
// is unique only within its kind, so the kind is in every key kept here.

// The digits a step shows: those after its point, less its exponent when it's written 1e-7 style (toFixed takes up to 100).
const decimals = (step) => {
  const [digits, exponent] = String(step).split('e');
  return Math.min(100, Math.max(0, (digits.split('.')[1] ?? '').length - Number(exponent ?? 0)));
};

// The options a plugin's brush or shape declares are kept in workspace.pluginTools (and the browser) under its kind and
// ref, { [optionId]: value }, and read back through optionValues, so a value that no longer fits (a plugin's update
// changed a range) is its default.
const keptAt = (kind, ref) => `${kind}:${ref}`;
export const valuesOf = (workspace, kind, ref, def) => optionValues(def, workspace.pluginTools[keptAt(kind, ref)]);

// One declared option as a toolbar option: the plugin's words for its label, and get and set over the kept values.
export function toolOption(kind, ref, def, option) {
  const at = keptAt(kind, ref);
  const base = {
    key: `${ref}/${option.id}`, // RangeField's element id: unique on the page, whatever ids plugins pick
    label: option.name,
    title: option.name,
    get: (workspace) => valuesOf(workspace, kind, ref, def)[option.id],
    set: (workspace, value) => { workspace.pluginTools[at] = { ...workspace.pluginTools[at], [option.id]: value }; },
  };
  if (option.kind === 'slider') return { ...base, min: option.min, max: option.max, step: option.step, decimals: decimals(option.step), size: option.id === def.size };
  if (option.kind === 'checkbox') return { ...base, type: 'checkbox' };
  if (option.kind === 'color') return { ...base, type: 'color' };
  return { ...base, type: 'dropdown', choices: option.choices.map((label, value) => ({ value, label })) };
}

// The plugin calls that have run this visit, by kind, ref and script hash: the first of each (a brush's first move, a
// shape's first outline) runs under the hang mark (plugins/hangMark.js), so one that freezes the page is turned off next
// time.
const ran = new Set();
export function firstUnderMark(kind, ref, hash, pluginId, fn) {
  const run = `${kind}\u0000${ref}\u0000${hash}`;
  if (ran.has(run)) return fn();
  ran.add(run);
  const mark = beginRun(pluginId);
  try {
    return fn();
  } finally {
    endRun(mark);
  }
}

const MAX_MESSAGE = 200; // the longest of a plugin's own words shown in a toast and its row

// A plugin's brush or shape failed: its words (the locale's key, given the item's name and the error's message, read
// safely and cut short) in a toast and in its plugin's row until a Reload.
export function sayFailed(key, name, pluginId, error) {
  let message;
  try {
    message = String(error?.message ?? error).slice(0, MAX_MESSAGE);
  } catch {
    message = '?';
  }
  const words = t(key, { name, message });
  toast(words);
  usePluginStore().problems[pluginId] = words;
}
