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

test('with unsaved work, it asks first (UnsavedDialog), keeping the drawing and the drawer until told to go on', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 8, rows: 4 });
  project.typeAt(1, 0, 'A', { fg: '#ffee00', bg: '#0044aa' });
  workspace.settingsOpen = true;
  workspace.newProject(); // the typing run still open counts
  expect(project.image).not.toBe(null);
  expect(workspace.settingsOpen).toBe(true);
  expect(workspace.unsavedAsk.name).toBe(null);
  workspace.unsavedAsk.go();
  expect([project.image, workspace.settingsOpen]).toEqual([null, false]);
});
