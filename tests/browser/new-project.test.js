// New project (workspace.newProject): asked first with unsaved work, then the start screen, with a phone's settings
// drawer closed so the start screen shows.
import { test, expect, vi, afterEach } from 'vitest';
import { createTestApp } from '../support/app.js';

afterEach(() => vi.unstubAllGlobals());

test('New project closes the settings drawer for the start screen', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 8, rows: 4 });
  workspace.settingsOpen = true;   // the drawer New project is pressed in, on a phone
  workspace.newProject();
  expect(project.image).toBe(null);
  expect(workspace.settingsOpen).toBe(false);
});

test('with unsaved work, saying no keeps the drawing and the drawer', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 8, rows: 4 });
  project.typeAt(1, 0, 'A', { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  workspace.settingsOpen = true;
  vi.stubGlobal('confirm', () => false);
  workspace.newProject();
  expect(project.image).not.toBe(null);
  expect(workspace.settingsOpen).toBe(true);
});
