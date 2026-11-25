import { watchEffect } from 'vue';
import { locale, t } from '@/i18n';
import { desktop, fileFrom } from '@/social/desktop';
import { newerRelease } from '@/lib/semver';
import { typesIn } from '@/lib/fields';
import { COMMANDS, commandContext, reloading, runCommand } from '@/lib/commands';
import { accelerator, keysFor, parseKey } from '@/lib/keymap';
import { toast } from '@/composables/useToast';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { useRoomStore } from '@/store/RoomStore';

// The desktop app's menu bar (desktop/menu.js builds it): its words in the language showing, what can be done now and
// the drawing's name and project path (the window's title, and which window has a file open), sent whenever any
// changes, and its commands run here. Files the app is asked to open (double-clicked, Open
// Recent) go to EditWorkspace as if chosen there. App.vue calls it on the desktop build only.
export const MENU_LABELS = [
  'file', 'new', 'newWindow', 'open', 'openRecent', 'clearRecent', 'noRecent', 'save', 'saveAs', 'export', 'versions', 'closeWindow', 'quit',
  'edit', 'undo', 'redo', 'cut', 'copy', 'paste', 'selectAll',
  'room', 'hostRoom', 'joinRoom', 'copyAddress', 'leaveRoom', 'endRoom',
  'view', 'actualSize', 'zoomIn', 'zoomOut', 'fullScreen', 'window',
  'help', 'commandList', 'shortcuts', 'github', 'releaseNotes', 'reportIssue', 'troubleshooting', 'devTools',
  'about', 'checkUpdates', 'plugins', 'startPluginsOff', 'services', 'hide', 'hideOthers', 'showAll',
  'openableFiles', 'projectFiles', 'leaveQuit', 'leaveClose', 'leaveDetail', 'leave', 'stay',
];

// Check for Updates (the menu, and the Social tab when a room is on a newer version): the newest release after this
// one, offered for download from its page, or that there's none. Asked of GitHub only when someone checks.
export async function checkForUpdates() {
  let found;
  try {
    found = await desktop.releases();
  } catch (error) {
    console.warn('Could not check for updates', error);
    return toast(t('updates.failed'));
  }
  const next = newerRelease(found.version, found.releases);
  if (!next) return toast(t('updates.upToDate', { version: found.version }));
  if (confirm(t('updates.available', { version: next.tag.slice(1), current: found.version }))) window.open(next.url, '_blank');
}

export { reloading };

// The menu's commands that are the command table's, run by id as the command list runs them (where it holds and it's
// available), so the menu, the keys and the list share one run. Leave Room is a host's End Room.
const TABLE = {
  new: 'file.new', open: 'file.open', save: 'file.save', saveAs: 'file.saveAs', export: 'file.export', versions: 'file.versions',
  commandList: 'ui.commandList', plugins: 'panels.plugins', pluginsOff: 'panels.pluginsOff',
  hostRoom: 'rooms.start', joinRoom: 'rooms.join', copyAddress: 'rooms.copyAddress', leaveRoom: () => (useRoomStore().role === 'host' ? 'rooms.end' : 'rooms.leave'),
};

// The menu's accelerators: each menu command's key from the command table (the first with Cmd, Ctrl or Alt, since a bare key
// types; Keyboard Shortcuts has none, as a menu key would stop ¿ typing on a Mac), as Electron writes it. New is the menu's own: Cmd+N is the browser's, so the page has no row for it.
export const menuAccelerators = () => ({
  new: 'CmdOrCtrl+N',
  ...Object.fromEntries(COMMANDS.filter((c) => c.menu && c.keys).map((c) => {
    const keys = keysFor(c.keys);
    return [c.menu, accelerator(keys.find((key) => { const k = parseKey(key); return k.mod || k.ctrl || k.alt; }) ?? keys[0])];
  })),
});

export function useDesktopMenu() {
  const project = useProjectStore(), workspace = useWorkspaceStore(), drawing = useDrawingStore(), room = useRoomStore();

  // Undo and Redo from the menu: a text field's own while one has focus, otherwise the drawing's (not on the room's tab,
  // as Cmd/Ctrl+Z).
  const undoOrRedo = (which) => {
    if (typesIn(document.activeElement)) document.execCommand(which);
    else if (workspace.editorTab !== 'room') project[which]();
  };

  const commands = {
    ...Object.fromEntries(Object.entries(TABLE).map(([name, id]) => [name, () => runCommand(typeof id === 'function' ? id() : id, commandContext(project, workspace))])),
    undo: () => undoOrRedo('undo'),
    redo: () => undoOrRedo('redo'),
    about: () => { workspace.showAboutModal = true; },
    shortcuts: () => { workspace.shortcutsOpen = true; },
    reportIssue: () => { workspace.issueReportOpen = true; },   // Help > Report an Issue…, in every version (the banner's link is a pre-release's)   // always, as before: not the ? key's where (the color box open)
    checkUpdates: checkForUpdates,
  };
  desktop.onMenu((name) => commands[name]?.());

  watchEffect(() => {
    void locale.value;   // a language picked in the footer: its words
    const labels = Object.fromEntries(MENU_LABELS.map((key) => [key, t(`menu.${key}`)]));
    const state = { hasImage: !!project.image, canChange: !drawing.offWithOthers, inRoom: !!room.role, hosting: room.role === 'host' };
    const art = { title: project.filename || 'Phosphor', file: project.filePath ?? null };
    desktop.setMenu(labels, state, art, menuAccelerators()).catch((error) => console.warn('Could not set the menu', error));
  });

  desktop.onOpenedFile((file) => {
    if (file.missing) toast(t('menu.missing', { name: file.name }));
    else workspace.fileRequest = fileFrom(file);
  });
}
