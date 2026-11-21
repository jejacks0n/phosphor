// A tool's own module imported before the tool list (tools/index.js), as a test or a lazy import may: the stores it
// reaches must not come back round to the list while the tool is still being made. Its own file, for fresh modules
// (tool-import-retouch.test.js is the same from Retouch).
import { expect, test } from 'vitest';
import vshape from '@/tools/vshape.js';
import { TOOLS, getTool } from '@/tools';

test('the Shape tool imported before the tool list loads both', () => {
  expect(TOOLS.includes(vshape)).toBe(true);
  expect(getTool('vshape') === vshape).toBe(true);
});
