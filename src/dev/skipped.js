// What the development log (actionLog.js) leaves out: the queries and render internals (the reading and rendering
// groups, but for the grid-size steps a person takes from the settings panel), what autosave calls on its own, and what
// watchers call as the document changes.
import { readingActions } from '@/store/project/reading.js';
import { renderingActions } from '@/store/project/rendering.js';

const STEPS = ['updateCols', 'updateRows', 'setAspectLock']; // of the rendering group, a person's own

export const SKIPPED = new Set([
  ...Object.keys(readingActions),
  ...Object.keys(renderingActions).filter((name) => !STEPS.includes(name)),
  'commitPending', 'documentNumber', 'keepLedger', 'projectParts', // autosave's (useAutosave.js)
  'buildGhost', 'syncShapeLayers', 'viewMoved', 'showGuidesFor', 'autosavedBy', // watchers' (EditWorkspace, vector.js, EditorViewport, App.vue)
  'load', 'checkFollowed', // the plugins read on their own (useTheme.js, PluginsDialog), and a followed file looked at every second
]);
