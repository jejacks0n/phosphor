// ChoiceDialog's choices and Cancel are a list: Up and Down move between them (arrowsBetween), stopping at the ends.
// Left and Right don't: the choices are stacked.
import { afterEach, expect, test } from 'vitest';
import { createApp, nextTick } from 'vue';
import { i18n } from '@/i18n';
import ChoiceDialog from '@/components/ChoiceDialog.vue';

let app = null;
afterEach(() => app?.unmount());

// A key pressed where focus is: true when it was taken.
const press = (key) => !document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

test('Up and Down move between the choices and Cancel, and stop at the ends', async () => {
  const choices = [{ id: 'exact', title: 'Exactly' }, { id: 'picture', title: 'Into the picture', text: 'It becomes part of the image.' }];
  app = createApp(ChoiceDialog, { title: 'Merge down?', sub: 'Choose how.', choices }).use(i18n);
  app.mount(document.createElement('div'));
  await nextTick();
  const [exact, picture] = document.querySelectorAll('dialog button.choice'), cancel = document.querySelector('dialog button.cancel');
  expect(document.activeElement).toBe(exact);

  expect(press('ArrowDown')).toBe(true);
  expect(document.activeElement).toBe(picture);
  press('ArrowDown');
  expect(document.activeElement).toBe(cancel);
  expect(press('ArrowDown')).toBe(true); // the end: it stays, and doesn't wrap
  expect(document.activeElement).toBe(cancel);

  press('ArrowUp');
  expect(document.activeElement).toBe(picture);
  press('ArrowUp');
  press('ArrowUp');
  expect(document.activeElement).toBe(exact);

  expect(press('ArrowRight')).toBe(false);
  expect(document.activeElement).toBe(exact);
});
