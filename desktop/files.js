// The files the desktop app opens and saves for the page: what it opens (as EditWorkspace's chooser takes), the files
// named on its command line (a file double-clicked on Windows and Linux), a save written whole or not at all, and the
// recently opened list (Open Recent), kept in the app's user data folder.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Pictures, projects, SVGs and art files (src/lib/ArtFile.js's ART_EXTENSIONS), as the page opens them.
export const OPENABLE = ['pho', 'phosphor', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg', 'ans', 'utf8ans', 'asc', 'txt', 'nfo', 'diz', 'xb', 'bin'];
export const isOpenable = (file) => OPENABLE.includes(path.extname(file).slice(1).toLowerCase());
// The form Save writes over: a .pho. An opened .phosphor or renamed .png project isn't written over; Save asks beside it.
export const isProject = (file) => path.extname(file).toLowerCase() === '.pho';

// Whether a save asks where (`box`) and the box's starting path: beside the file the project came from when it's one the
// page may write to (`isGranted`), else just the suggested name. Only a .pho is written over without asking, unless `as`.
export function saveBox({ file, name, as = false, isGranted = false }) {
  const known = typeof file === 'string' && isGranted;
  if (known && isProject(file) && !as) return { box: false };
  return { box: true, defaultPath: known ? path.join(path.dirname(file), path.basename(name)) : path.basename(name) };
}

// A path the save box returned, as a .pho path.
export const projectPath = (chosen) => (isProject(chosen) ? chosen : `${chosen}.pho`);

// The files on a command line the app can open, as full paths: not its flags, not Electron or main.js.
export const filesIn = (argv, cwd = process.cwd()) => argv
  .filter((arg) => !arg.startsWith('-') && isOpenable(arg))
  .map((arg) => path.resolve(cwd, arg))
  .filter((file) => existsSync(file) && statSync(file).isFile());

// Written beside it first and then moved over it, so a failed save leaves the file it would have replaced.
export async function writeWhole(file, bytes) {
  const temp = `${file}.${process.pid}-${Date.now()}.tmp`;
  try {
    await writeFile(temp, bytes);
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

// The recently opened and saved files, newest first, at most `max`, kept in `store` (a JSON file) as they change.
export function recentFiles(store, max = 10) {
  let list = [];
  try {
    const kept = JSON.parse(readFileSync(store, 'utf8'));
    if (Array.isArray(kept)) list = kept.filter((file) => typeof file === 'string' && path.isAbsolute(file)).slice(0, max);
  } catch {
    // none kept yet, or unreadable: an empty list
  }
  const keep = (next) => {
    list = next;
    try {
      writeFileSync(store, JSON.stringify(list));
    } catch {
      // not kept for the next launch, but still listed in this one
    }
  };
  return {
    list: () => [...list],
    add: (file) => keep([file, ...list.filter((other) => other !== file)].slice(0, max)),
    remove: (file) => keep(list.filter((other) => other !== file)),
    clear: () => keep([]),
  };
}
