// Bug hunt: a drawing that a save can't bring back. Each test here fails because of a bug.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { rectShape } from '@/document/shapes.js';
import { readProject, writeProject } from '@/document/projectIO.js';
import { MOST_LAYERS } from '@/document/layerInfo.js';

const WHITE = { fg: '#ffffff', bg: '#000000' };

async function blank(cols = 20, rows = 20) {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ cols, rows });
  await settle(app.project);
  return app;
}

// The drawing as a file, read back: what a save, autosave and a reload do.
const roundTrip = async (project) => readProject(await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() }));

test('the first shape drawn with the most layers makes a 65th layer, and the file no longer opens', async () => {
  const { project, workspace } = await blank();
  while (project.layers.length < MOST_LAYERS) project.addLayer('cells', 'edit');
  expect(project.layers).toHaveLength(MOST_LAYERS);
  expect(project.hasVectorLayer).toBe(false);
  workspace.editorTab = 'vector'; // the VECTOR tab is still there: it picks the vector layer the first shape will bring
  project.addShape(rectShape(2, 2, 6, 6, { fill: '#ff0000' }));
  project.commitEdit();
  await settle(project);
  expect(project.shapes.size).toBe(1);
  await expect(roundTrip(project)).resolves.toBeTruthy(); // a save, an autosave: "Not a valid Phosphor project file"
  expect(project.layers.length).toBeLessThanOrEqual(MOST_LAYERS);
});

test('undoing an added layer in a movie leaves its keys on frames not showing, and the file no longer opens', async () => {
  const { project, workspace } = await blank();
  project.addLayer('cells', 'edit'); // L1 stays: the file is the stack form
  project.addFrame('blank');
  project.addFrame('blank');
  project.showFrame(0);
  const added = project.addLayer('cells', 'L1');
  workspace.pickLayer(added);
  project.showFrame(1);
  project.typeAt(1, 1, 'A', WHITE);
  project.commitEdit();
  project.showFrame(2);
  project.typeAt(2, 2, 'B', WHITE);
  project.commitEdit();
  project.showFrame(0);
  project.undo(); // B, on frame 2
  project.undo(); // A, on frame 1
  project.undo(); // the layer
  expect(project.layerById(added)).toBeUndefined();
  const file = await roundTrip(project);
  expect(file.framesLost).toBe(false);
  expect(file.animation.frames.length).toBe(3);
});

test('Make art layer with the base picked', async () => {
  const { project, workspace } = await blank();
  workspace.pickLayer('base');
  expect(project.editId).toBe('base');
  project.typeAt(2, 1, 'H', { fg: '#ff0000' });
  project.commitEdit();
  workspace.selection = { c0: 1, r0: 0, c1: 6, r1: 2 };
  const key = project.makeArtLayer();
  // Either it's refused, or it works; either way nothing of the base's lands in _layerData.
  expect([...project._layerData.keys()]).not.toContain('base');
  if (key) {
    expect(project.layers.length).toBeLessThanOrEqual(MOST_LAYERS);
    await expect(roundTrip(project)).resolves.toBeTruthy();
  }
});
