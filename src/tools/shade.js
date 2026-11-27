// Draw with: Shade, the Pencil's and the Brush's (docs/model.md R16): each pass steps the cells it reaches one shade on,
// ░ ▒ ▓ █ in the foreground color, or back (Lighter, or Darker with Cmd or Ctrl held at the press), in every style.
import { t } from '@/i18n/index.js';
import { sayShadeOff } from '@/composables/useFontSetup';

// The choice on Draw with, after Half-block.
export const shadeChoice = { value: 'shade', get label() { return t('tools.drawWith.shade'); }, glyph: '░▓' };

// Whether a stroke in view (the editor's tab for the toolbar) shades: the options shown and the stroke agree.
export const shades = (ws, key, view = ws.editorTab) => view === 'output' && ws[key] === 'shade';

// Darker or Lighter, shown with Shade.
export const shadeWayOption = (key) => ({
  key: 'shadeLighter', get label() { return t('tools.drawWith.shadeWay'); }, type: 'segmented', views: ['output'], when: (ws) => shades(ws, key),
  choices: [
    { value: false, get label() { return t('tools.drawWith.darker'); } },
    { value: true, get label() { return t('tools.drawWith.lighter'); } },
  ],
});

let back = false; // this stroke's way, set at its press

// A Shade stroke's press: refused (and said) where the font lacks a shade or the full block; else its way, the option's,
// or the other one with Cmd or Ctrl held.
export function beginShade({ project, workspace }, event) {
  if (project.shadeOff) {
    sayShadeOff();
    return false;
  }
  back = workspace.shadeLighter !== !!(event?.metaKey || event?.ctrlKey);
  return true;
}

export const shade = (project, pixels) => project.shadeCells(pixels, { back });
