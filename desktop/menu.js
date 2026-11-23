// The desktop app's menu bar, as a template for Menu.buildFromTemplate: in the page's words (labels, in the language it
// shows, from its menu strings) and with what it can do now (state). The app's own actions go to the page as commands;
// cut, copy, paste, zoom and the window are the system's roles, and the links open in the browser.
//   labels   the page's menu strings (en.json's menu)
//   accelerators  { menu command: its Electron accelerator }, from the page's command table; a command with none has none
//   state    { hasImage, canChange, inRoom, hosting }: a drawing open, the document free to replace (not drawing in a
//            room someone else hosts), in a room, hosting it
//   recent   the recently opened files' paths, newest first
//   act      { command(name), newWindow(), openRecent(path), clearRecent(), openUrl(url) }
export const REPO = 'https://github.com/jejacks0n/phosphor';

const PLATFORMS = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };
// A new issue on GitHub, its body ending with this app's version and system, for the person to write above.
export const issueUrl = ({ version, platform, systemVersion, arch }) => {
  const system = `${PLATFORMS[platform] ?? platform} ${systemVersion} (${arch})`;
  return `${REPO}/issues/new?body=${encodeURIComponent(`\n\n---\nPhosphor ${version}, ${system}`)}`;
};

export function menuTemplate({ labels: l, accelerators = {}, state, recent, act, mac, packaged, version, platform, systemVersion, arch }) {
  const sep = { type: 'separator' };
  const command = (label, name, { enabled = true } = {}) => ({ label, accelerator: accelerators[name], enabled, click: () => act.command(name) });
  const link = (label, url) => ({ label, click: () => act.openUrl(url) });
  const basename = (file) => file.split(/[\\/]/).pop();

  const about = command(l.about, 'about');
  const updates = command(l.checkUpdates, 'checkUpdates');
  const plugins = command(l.plugins, 'plugins');
  const openRecent = recent.length
    ? [...recent.map((file) => ({ label: basename(file), click: () => act.openRecent(file) })), sep, { label: l.clearRecent, click: () => act.clearRecent() }]
    : [{ label: l.noRecent, enabled: false }];

  return [
    ...(mac ? [{
      label: 'Phosphor',
      submenu: [about, updates, plugins, sep, { role: 'services', label: l.services }, sep, { role: 'hide', label: l.hide }, { role: 'hideOthers', label: l.hideOthers }, { role: 'unhide', label: l.showAll }, sep, { role: 'quit', label: l.quit }],
    }] : []),
    {
      label: l.file,
      submenu: [
        command(l.new, 'new', { enabled: state.hasImage && state.canChange }),
        { label: l.newWindow, accelerator: 'CmdOrCtrl+Shift+N', click: act.newWindow },
        command(l.open, 'open'),
        { label: l.openRecent, submenu: openRecent },
        sep,
        command(l.save, 'save', { enabled: state.hasImage }),
        command(l.saveAs, 'saveAs', { enabled: state.hasImage }),
        command(l.export, 'export', { enabled: state.hasImage }),
        command(l.versions, 'versions', { enabled: state.hasImage && state.canChange }),
        sep,
        { role: 'close', label: l.closeWindow },
        ...(mac ? [] : [{ role: 'quit', label: l.quit }]),
      ],
    },
    {
      label: l.edit,
      submenu: [
        command(l.undo, 'undo'),
        command(l.redo, 'redo'),
        sep,
        { role: 'cut', label: l.cut },
        { role: 'copy', label: l.copy },
        { role: 'paste', label: l.paste },
        { role: 'selectAll', label: l.selectAll },
      ],
    },
    {
      label: l.room,
      submenu: [
        command(l.hostRoom, 'hostRoom', { enabled: !state.inRoom }),
        command(l.joinRoom, 'joinRoom', { enabled: !state.inRoom }),
        command(l.copyAddress, 'copyAddress', { enabled: state.hosting }),
        sep,
        command(state.hosting ? l.endRoom : l.leaveRoom, 'leaveRoom', { enabled: state.inRoom }),
      ],
    },
    {
      label: l.view,
      submenu: [
        { role: 'resetZoom', label: l.actualSize },
        { role: 'zoomIn', label: l.zoomIn },
        { role: 'zoomOut', label: l.zoomOut },
        sep,
        { role: 'togglefullscreen', label: l.fullScreen },
        // Unpackaged (npm run desktop): the page reloaded, as in a browser. Packaged, a reload is only by accident.
        ...(packaged ? [] : [sep, { role: 'reload' }]),
      ],
    },
    ...(mac ? [{ role: 'windowMenu', label: l.window }] : []),
    {
      role: 'help',
      label: l.help,
      submenu: [
        command(l.shortcuts, 'shortcuts'),
        sep,
        link(l.github, REPO),
        link(l.releaseNotes, `${REPO}/releases/tag/v${version}`),
        link(l.reportIssue, issueUrl({ version, platform, systemVersion, arch })),
        sep,
        ...(mac ? [] : [about, updates, plugins, sep]),
        // A plugin's theme that leaves the window unreadable is got out of by loading it without plugins.
        { label: l.troubleshooting, submenu: [{ role: 'toggleDevTools', label: l.devTools }, command(l.startPluginsOff, 'pluginsOff')] },
      ],
    },
  ];
}
