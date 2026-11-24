// What the session's log (actionLog.js) leaves out: the queries and render internals (the reading and rendering
// groups, but for the grid-size steps a person takes from the settings panel), what autosave calls on its own, and what
// watchers call as the document changes. And NAMES_ONLY, the stores whose actions are logged by name with nothing of
// what they were given.
import { readingActions } from '@/store/project/reading.js';
import { renderingActions } from '@/store/project/rendering.js';

const STEPS = ['updateCols', 'updateRows', 'setAspectLock']; // of the rendering group, a person's own

export const SKIPPED = new Set([
  ...Object.keys(readingActions),
  ...Object.keys(renderingActions).filter((name) => !STEPS.includes(name)),
  'commitPending', 'documentNumber', 'keepLedger', 'projectParts', // autosave's (useAutosave.js)
  'buildGhost', 'syncShapeLayers', 'viewMoved', 'showGuidesFor', 'autosavedBy', // watchers' (EditWorkspace, vector.js, EditorViewport, App.vue)
  'load', 'loadMarket', 'checkFollowed', // the plugins and the marketplace's list read on their own (useTheme.js, PluginsDialog), and a followed file looked at every second
  'projectFile', 'artDrawingCells', // the drawing made ready for an issue report as its dialog opens (IssueReportDialog.vue), and the cells its picture is drawn from: no step of the person's
  'sliderValues', // a query, which a getter asks each time the sliders or the filters change (ProjectStore's, of whether the picture is changed)
]);

// The SOCIAL stores, by the names Pinia knows them by (SocialStore, RoomStore, and DrawingStore with its host and artist
// parts): what their actions are given is a password, an email address, a two-factor code, a room's password or a line
// of chat as often as not, so none of it is ever kept. A new store that takes anything of the kind goes here.
export const NAMES_ONLY = new Set(['social', 'room', 'drawing']);
