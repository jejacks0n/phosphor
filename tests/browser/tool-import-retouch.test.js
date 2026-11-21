// Retouch's module imported before the tool list (tools/index.js); see tool-import-vshape.test.js.
import { expect, test } from 'vitest';
import { blur } from '@/tools/retouch';
import { TOOLS, getTool } from '@/tools';

test('Retouch imported before the tool list loads both', () => {
  expect(TOOLS.includes(blur)).toBe(true);
  expect(getTool(blur.id) === blur).toBe(true);
});
