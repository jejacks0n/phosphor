// A selection stays while you use other tools, and the painting tools change only what's inside it.
import { test, expect } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';

const SEL = { c0: 5, r0: 5, c1: 9, r1: 7 };

async function scene() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  workspace.editorTab = 'output';
  return { project, workspace };
}

test('the selection stays when another tool is chosen, held or released', async () => {
  const { workspace } = await scene();
  workspace.selection = { ...SEL };
  for (const step of [() => workspace.setActiveTool('brush'), () => workspace.setActiveTool('hand'), () => workspace.setActiveTool('picker'),
    () => workspace.holdTool('picker', 'alt'), () => workspace.releaseTool()]) {
    step();
    expect(workspace.selection).toEqual(SEL);
  }
});
