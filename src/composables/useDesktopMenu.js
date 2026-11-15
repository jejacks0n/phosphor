import { watchEffect } from 'vue';
import { locale, t } from '@/i18n';
import { desktop, fileFrom } from '@/social/desktop';
import { newerRelease } from '@/lib/semver';
import { toast } from '@/composables/useToast';
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { useDrawingStore } from '@/store/DrawingStore';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';

// The desktop app's menu bar (desktop/menu.js builds it): its words in the language showing, what can be done now and
// the drawing's name and project path (the window's title, and which window has a file open), sent whenever any
// changes, and its commands run here. Files the app is asked to open (double-clicked, Open
// Recent) go to EditWorkspace as if chosen there. App.vue calls it on the desktop build only.
export const MENU_LABELS = [
  'file', 'new', 'newWindow', 'open', 'openRecent', 'clearRecent', 'noRecent', 'save', 'saveAs', 'export', 'versions', 'closeWindow', 'quit',
  'edit', 'undo', 'redo', 'cut', 'copy', 'paste', 'selectAll',
  'room', 'hostRoom', 'joinRoom', 'copyAddress', 'leaveRoom', 'endRoom',
  'view', 'actualSize', 'zoomIn', 'zoomOut', 'fullScreen', 'window',
  'help', 'shortcuts', 'github', 'releaseNotes', 'reportIssue', 'troubleshooting', 'devTools',
  'about', 'checkUpdates', 'services', 'hide', 'hideOthers', 'showAll',
  'openableFiles', 'projectFiles',
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

const TYPED = 'input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=color]), textarea, [contenteditable]';

export function useDesktopMenu() {
  const project = useProjectStore(), workspace = useWorkspaceStore(), drawing = useDrawingStore(), room = useRoomStore(), social = useSocialStore();

  // Undo and Redo from the menu: a text field's own while one has focus, otherwise the drawing's (not on the room's tab,
  // as Cmd/Ctrl+Z).
  const undoOrRedo = (which) => {
    if (document.activeElement?.matches?.(TYPED)) document.execCommand(which);
    else if (workspace.editorTab !== 'room') project[which]();
  };

  const commands = {
    new: () => workspace.newProject(),
    open: () => workspace.openRequest++,
    save: () => workspace.saveFile(),
    saveAs: () => workspace.saveFile({ as: true }),
    export: () => { if (project.image) workspace.exportModal = true; },
    versions: () => { if (project.image && !drawing.offWithOthers) workspace.versionsOpen = true; },
    undo: () => undoOrRedo('undo'),
    redo: () => undoOrRedo('redo'),
    about: () => { workspace.showAboutModal = true; },
    shortcuts: () => { workspace.shortcutsOpen = true; },
    checkUpdates: checkForUpdates,
    hostRoom: () => {
      workspace.showSocial();
      if (social.desktopName) social.page = 'start-room';   // without a name, the page that asks for it first
    },
    joinRoom: () => {
      workspace.showSocial();
      social.page = 'lobby';
    },
    copyAddress: async () => {
      if (await room.copyLink()) toast(t('menu.addressCopied'));
    },
    // A host is asked first, as End room asks.
    leaveRoom: async () => {
      if (room.role !== 'host') room.leave();
      else if (await room.askToEnd()) room.endRoom();
    },
  };
  desktop.onMenu((name) => commands[name]?.());

  watchEffect(() => {
    void locale.value;   // a language picked in the footer: its words
    const labels = Object.fromEntries(MENU_LABELS.map((key) => [key, t(`menu.${key}`)]));
    const state = { hasImage: !!project.image, canChange: !drawing.offWithOthers, inRoom: !!room.role, hosting: room.role === 'host' };
    const art = { title: project.filename || 'Phosphor', file: project.filePath ?? null };
    desktop.setMenu(labels, state, art).catch((error) => console.warn('Could not set the menu', error));
  });

  desktop.onOpenedFile((file) => {
    if (file.missing) toast(t('menu.missing', { name: file.name }));
    else workspace.fileRequest = fileFrom(file);
  });
}
