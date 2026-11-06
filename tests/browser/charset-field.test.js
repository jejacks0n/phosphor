// The Characters field's ▾ (CharsetField.vue): its sets list their characters beside their names, except on iOS,
// whose picker draws the options in its own font, so the characters wouldn't look as they're drawn.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { i18n } from '@/i18n';
import CharsetField from '@/components/CharsetField.vue';

const PRESETS = [{ name: 'Shades', chars: ' ░▒▓█' }, { name: 'Halves', chars: ' ▀▄█' }];
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.restoreAllMocks();
});

async function options() {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(CharsetField, { id: 'chars', modelValue: PRESETS[0].chars, presets: PRESETS }) }).use(i18n);
  app.mount(host);
  await nextTick();
  return [...host.querySelectorAll('option')].map((option) => option.textContent);
}

test('elsewhere, each set shows its characters beside its name', async () => {
  expect(await options()).toEqual(['Shades ·  ░▒▓█', 'Halves ·  ▀▄█']);
});

test('on iOS, each set shows only its name', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE);
  expect(await options()).toEqual(['Shades', 'Halves']);
});

test('an iPad asking for the desktop site is iOS too', async () => {
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
  vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(5);
  expect(await options()).toEqual(['Shades', 'Halves']);
});
