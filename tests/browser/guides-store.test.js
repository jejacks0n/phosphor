// Guides and ruler zero points on the workspace: kept per drawing in this browser, and never an edit.
import { test, expect, beforeEach } from 'vitest';
import { createTestApp, settle } from '../support/app.js';

beforeEach(() => localStorage.clear());

async function setup() {
  const stores = await createTestApp();
  await stores.project.setBlankCanvas({ cols: 20, rows: 10 });
  await settle(stores.project);
  return stores;
}

test('guides belong to the drawing they were placed on', async () => {
  const { project, workspace } = await setup();
  const a = project.fileId;
  workspace.showGuidesFor(a);
  workspace.addGuide('v', 40);
  workspace.setRulerZero('x', 40.5);
  await project.setBlankCanvas({ cols: 20, rows: 10 });
  workspace.showGuidesFor(project.fileId);
  expect(workspace.guides).toEqual([]);
  expect(workspace.rulerZero).toEqual({ x: 0, y: 0 });
  workspace.showGuidesFor(a);
  expect(workspace.guides).toEqual([{ axis: 'v', pos: 40 }]);
  expect(workspace.rulerZero).toEqual({ x: 40.5, y: 0 });
});

test('closing the drawing leaves no guides', async () => {
  const { project, workspace } = await setup();
  workspace.showGuidesFor(project.fileId);
  workspace.addGuide('h', 2);
  project.clearImage();
  workspace.showGuidesFor(project.fileId);
  expect(workspace.guides).toEqual([]);
});

test('a guide changes nothing in the document', async () => {
  const { project, workspace } = await setup();
  workspace.showGuidesFor(project.fileId);
  const undoable = project.canUndo;
  workspace.addGuide('v', 1);
  workspace.moveGuide(0, 2);
  workspace.setRulerZero('y', 3);
  workspace.removeGuide(0);
  expect(project.isDirty).toBe(false);
  expect(project.canUndo).toBe(undoable);
});

test('Clear guides keeps the zero points', async () => {
  const { project, workspace } = await setup();
  workspace.showGuidesFor(project.fileId);
  workspace.addGuide('v', 1);
  workspace.addGuide('h', 2);
  workspace.setRulerZero('x', 5);
  workspace.clearGuides();
  expect(workspace.guides).toEqual([]);
  expect(workspace.rulerZero).toEqual({ x: 5, y: 0 });
});

test('with no file id they last until the page closes', async () => {
  const { workspace } = await setup();
  workspace.showGuidesFor(null);
  workspace.addGuide('h', 3);
  expect(workspace.guides).toEqual([{ axis: 'h', pos: 3 }]);
  expect(localStorage.getItem('phosphor.guides')).toBeNull();
});
