// The drawing's bitmap font as document state: one undo step, saved with the project, gone on a new drawing.
import { test, expect } from 'vitest';
import { createTestApp } from '../support/app.js';
import { readProject, writeProject } from '@/document/projectIO.js';

const font = () => ({ name: 'Topaz', height: 8, bytes: Uint8Array.from({ length: 256 * 8 }, (_, i) => i % 251) });

async function blank() {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  return project;
}

test('setDrawingFont is one undo step', async () => {
  const project = await blank();
  const f = font();
  project.setDrawingFont(f);
  expect(project.drawingFont.height).toBe(8);
  expect(project.drawingFont.name).toBe('Topaz');
  expect([...project.drawingFont.bytes]).toEqual([...f.bytes]);
  project.undo();
  expect(project.drawingFont).toBeNull();
  expect(project.fontBitmap).toBe('');
  project.redo();
  expect([...project.drawingFont.bytes]).toEqual([...f.bytes]);
  const version = project.history.version;
  project.setDrawingFont(f);
  expect(project.history.version).toBe(version);
});

test('saves and restores the font with the project', async () => {
  const project = await blank();
  const f = font();
  project.setDrawingFont(f);
  const file = new File([await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() })], 'a.phosphor');
  const { project: other } = await createTestApp();
  await other.openParts(await readProject(file), { filename: 'other' });
  expect([...other.drawingFont.bytes]).toEqual([...f.bytes]);
  expect(other.drawingFont.name).toBe('Topaz');
});

test('a new drawing has no font', async () => {
  const project = await blank();
  project.setDrawingFont(font());
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  expect(project.drawingFont).toBeNull();
});
