// Opening older projects, and what counts as unsaved.
import { test, expect, vi, afterEach } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';

const fileFrom = async (url) => new File([await (await fetch(url)).blob()], url.slice(url.lastIndexOf('/') + 1));
afterEach(() => vi.restoreAllMocks());

// examples/aeonflux.phosphor and colortest.phosphor (files from an older version) have no
// renderStyle / charsAscii / colorize keys; the erased-cells fixture has no slider keys at all.
for (const url of ['/examples/aeonflux.phosphor', '/tests/fixtures/projects/erased-cells.phosphor']) {
  test(`${url}: opens the same whatever the previous document's settings were`, async () => {
    const { project } = await createTestApp();
    await project.loadProject(await fileFrom(url));
    await settle(project);
    const fresh = cellsKey(project), { renderStyle, brightness } = project;

    // Someone worked on another image first: ASCII style, brightness up (kept in localStorage).
    const again = await createTestApp();
    await loadImage(again.project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
    again.project.renderStyle = 'ascii';
    again.project.brightness = 200;
    again.project.edgeThickness = 3;
    await settle(again.project);
    await again.project.loadProject(await fileFrom(url));
    await settle(again.project);
    expect(again.project.renderStyle).toBe(renderStyle);
    expect(again.project.brightness).toBe(brightness);
    expect(cellsKey(again.project)).toEqual(fresh);
  });
}

// The unsaved-work guards (closing the tab, opening a file, Start New Project) commit the open
// typing run first, so a word typed a moment ago counts.
test('text just typed (typing run still open) counts as unsaved once the guard commits it', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  project.markSaved();
  project.typeAt(3, 3, 'Z', { fg: '#ffffff', bg: '#000000' });
  project.commitPending();
  expect(project.isDirty).toBe(true);
});
