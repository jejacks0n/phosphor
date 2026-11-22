// ColorList is the Custom color list's editor: the list as swatches, one picked, with the picked color's chip, hex,
// ◂ ▸ and Remove under them, and the count, Import and Export at the foot. It writes the `palette` setting only when
// something is edited, as lowercase #rrggbb with single spaces.
import { afterEach, expect, onTestFinished, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick, ref } from 'vue';
import { i18n } from '@/i18n';
import ColorList from '@/components/ColorList.vue';
import '@/assets/global.css';
import { closeToast, toast, toastAction, toastMessage } from '@/composables/useToast';

let app, host;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
  closeToast();
  vi.restoreAllMocks();
});

// The editor on its own, its list held as the settings column holds it; `wrap` puts it inside something, and with `takes`
// false the holder doesn't take what the editor writes (as the settings column while they're locked).
async function mount(value, wrap = (node) => node, { takes = true } = {}) {
  const list = ref(value), emitted = [], picks = [];
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({
    render: () => wrap(h(ColorList, {
      modelValue: list.value,
      name: 'art',
      'onUpdate:modelValue': (v) => { if (takes) list.value = v; emitted.push(v); },
      onPicking: (v) => picks.push(v),
    })),
  }).use(i18n);
  app.mount(host);
  await nextTick();
  return { list, emitted, picks };
}

const gone = () => {
  app.unmount();
  host.remove();
  app = host = null;
};
const swatches = () => [...host.querySelectorAll('div.swatches > button.swatch')];
const field = () => host.querySelector('input#palette');
const pressed = () => swatches().findIndex((s) => s.getAttribute('aria-pressed') === 'true');
const press = async (el) => {
  el.click();
  await nextTick();
};
const key = async (el, k) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  await nextTick();
};
const type = async (text) => {
  field().focus();
  field().value = text;
  field().dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
};
const fire = async (el, name) => {
  el.dispatchEvent(new Event(name, { bubbles: true }));
  await nextTick();
};
async function importFile(text, name) {
  const input = host.querySelector('input.hex-file');
  const files = new DataTransfer();
  files.items.add(new File([text], name));
  input.files = files.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(toastMessage.value).toBeTruthy());
  await nextTick();
}

test('the list shows as swatches in its order, the first picked, and writes nothing until something is edited', async () => {
  const { emitted } = await mount('#FFF, #a50;000');
  expect(swatches().map((s) => s.getAttribute('aria-label'))).toEqual(['#ffffff, 1 of 3', '#aa5500, 2 of 3', '#000000, 3 of 3']);
  expect(swatches()[0].getAttribute('aria-pressed')).toBe('true');
  expect(swatches()[1].getAttribute('aria-pressed')).toBe('false');
  expect(swatches()[1].style.backgroundColor).toBe('rgb(170, 85, 0)');
  expect(field().value).toBe('#ffffff');
  expect(host.querySelector('label[for=palette]').textContent).toBe('Palette colors');
  expect(host.querySelector('p.count').textContent).toBe('3 colors');
  expect(emitted).toEqual([]);
});

test('a hex typed changes the picked color on Enter; Escape puts the field back and a blur after it changes nothing', async () => {
  const { list, emitted } = await mount('#ffffff #aa5500 #000000');
  await press(swatches()[1]);
  expect(pressed()).toBe(1);
  expect(field().value).toBe('#aa5500');
  await type('#00FF00');
  await key(field(), 'Enter');
  expect(list.value).toBe('#ffffff #00ff00 #000000');
  expect(field().value).toBe('#00ff00');
  const count = emitted.length;
  await type('#123456');
  await key(field(), 'Escape');
  expect(field().value).toBe('#00ff00');
  field().blur();
  await nextTick();
  expect(emitted.length).toBe(count);
  expect(list.value).toBe('#ffffff #00ff00 #000000');
});

test('leaving the hex field applies what was typed, and Enter then a blur writes once', async () => {
  const { list, emitted } = await mount('#ffffff #000000');
  await type('#FFFFFF');
  field().blur();
  await nextTick();
  expect(emitted).toEqual([]); // the color it was, in capitals
  expect(field().value).toBe('#ffffff');
  await type('#123456');
  field().blur();
  await nextTick();
  expect(list.value).toBe('#123456 #000000');
  await type('#abcdef');
  await key(field(), 'Enter');
  field().blur();
  await nextTick();
  expect(emitted).toEqual(['#123456 #000000', '#abcdef #000000']);
});

test('a list with no colors (the old text box cleared) takes a color typed or picked as its first; + is off', async () => {
  const { list } = await mount('');
  expect(swatches()).toHaveLength(0);
  expect(field().value).toBe('');
  expect(host.querySelector('button.add').disabled).toBe(true);
  await type('#ff0000');
  await key(field(), 'Enter');
  expect(list.value).toBe('#ff0000');
  list.value = '';
  await nextTick();
  const chip = host.querySelector('input.chip');
  chip.value = '#00ff00';
  await fire(chip, 'input');
  expect(list.value).toBe('#00ff00');
});

test('a list typed or pasted into the hex field replaces every color', async () => {
  const { list } = await mount('#ffffff #000000');
  await type('#111 #222 #333 #444');
  await key(field(), 'Enter');
  expect(list.value).toBe('#111111 #222222 #333333 #444444');
  expect(swatches()).toHaveLength(4);
  expect(field().value).toBe('#111111');
  await type('nothing here');
  await key(field(), 'Enter');
  expect(field().value).toBe('#111111'); // no colors: the field is put back
  expect(list.value).toBe('#111111 #222222 #333333 #444444');
});

test('◂ and ▸ move the picked color and keep it picked; a repeated color moves by its place', async () => {
  const { list } = await mount('#111111 #222222 #111111');
  await press(swatches()[2]);
  expect(host.querySelector('button.later').disabled).toBe(true);
  await press(host.querySelector('button.earlier'));
  expect(list.value).toBe('#111111 #111111 #222222');
  expect(pressed()).toBe(1);
  await press(swatches()[0]);
  expect(host.querySelector('button.earlier').disabled).toBe(true);
  expect(host.querySelector('button.later').disabled).toBe(false);
  await press(host.querySelector('button.later'));
  expect(list.value).toBe('#111111 #111111 #222222');
  expect(pressed()).toBe(1);
});

test('+ adds a copy of the picked color after the last and picks it; Remove takes the picked one out; one color always stays and 256 is the most', async () => {
  const { list } = await mount('#000000');
  expect(host.querySelector('button.remove').disabled).toBe(true);
  await press(host.querySelector('button.add'));
  expect(list.value).toBe('#000000 #000000');
  expect(pressed()).toBe(1);
  expect(host.querySelector('p.count').textContent).toBe('2 colors');
  await type('#ff0000');
  await key(field(), 'Enter');
  await press(swatches()[0]);
  await press(host.querySelector('button.remove'));
  expect(list.value).toBe('#ff0000');
  expect(pressed()).toBe(0);
  expect(host.querySelector('p.count').textContent).toBe('1 color');
  expect(host.querySelector('button.remove').disabled).toBe(true);

  list.value = Array.from({ length: 256 }, (_, i) => `#0000${i.toString(16).padStart(2, '0')}`).join(' ');
  await nextTick();
  expect(swatches()).toHaveLength(256);
  expect(host.querySelector('button.add').disabled).toBe(true);
  expect(host.querySelector('button.remove').disabled).toBe(false);
});

test('a holder that doesn\'t take the copy + adds leaves one of the list\'s colors picked, with its hex in the field', async () => {
  const { emitted } = await mount('#111111 #222222', undefined, { takes: false });
  await press(swatches()[1]);
  await press(host.querySelector('button.add'));
  expect(emitted).toEqual(['#111111 #222222 #222222']);
  expect(swatches()).toHaveLength(2);
  expect(pressed()).toBe(1);
  expect(field().value).toBe('#222222');
  expect(host.querySelector('button.later').disabled).toBe(true);
});

test('the picked place is kept in range when the list changes from outside', async () => {
  const { list } = await mount('#111111 #222222 #333333');
  await press(swatches()[2]);
  list.value = '#444444 #555555';
  await nextTick();
  expect(pressed()).toBe(1);
  expect(field().value).toBe('#555555');
});

test('the system picker recolors as it moves and says when the pick starts and ends, and ends it if the editor goes away', async () => {
  const { list, picks } = await mount('#ffffff #000000');
  const chip = host.querySelector('input.chip[type=color]');
  expect(chip.value).toBe('#ffffff');
  chip.value = '#ff0000';
  await fire(chip, 'input');
  expect(list.value).toBe('#ff0000 #000000');
  chip.value = '#ee0000';
  await fire(chip, 'input');
  expect(list.value).toBe('#ee0000 #000000');
  expect(picks).toEqual([true]);
  await fire(chip, 'change');
  expect(picks).toEqual([true, false]);
  chip.value = '#00ff00';
  await fire(chip, 'input');
  expect(picks).toEqual([true, false, true]);
  app.unmount();
  app = null;
  expect(picks.at(-1)).toBe(false);
});

// A browser fires input and no change when the picker is moved and brought back to where it started.
test('a pick ends when the chip loses focus, with no change from the picker', async () => {
  const { picks } = await mount('#ffffff #000000');
  const chip = host.querySelector('input.chip');
  chip.focus();
  chip.value = '#ff0000';
  await fire(chip, 'input');
  chip.value = '#ffffff';
  await fire(chip, 'input');
  chip.blur();
  await nextTick();
  expect(picks).toEqual([true, false]);
});

// A system color panel that isn't modal (macOS's) can be left open after the color was moved and brought back, with no
// change or blur ever to come.
test('a pick that goes quiet ends by itself, so a panel left open can\'t hold a room\'s changes back for good; the next move starts another', async () => {
  vi.useFakeTimers();
  onTestFinished(() => vi.useRealTimers());
  const { picks } = await mount('#ffffff #000000');
  const chip = host.querySelector('input.chip');
  const move = async (hex) => {
    chip.value = hex;
    await fire(chip, 'input');
  };
  await move('#ff0000');
  expect(picks).toEqual([true]);
  vi.advanceTimersByTime(999);
  expect(picks).toEqual([true]);
  vi.advanceTimersByTime(1);
  expect(picks).toEqual([true, false]);
  await move('#ee0000');
  expect(picks).toEqual([true, false, true]);
  for (let i = 0; i < 6; i++) {
    vi.advanceTimersByTime(500);
    await move(`#${(0xd0 - i).toString(16)}0000`);
  }
  expect(picks).toEqual([true, false, true]);
});

test('a pick ended by its change or blur isn\'t ended again when the quiet time passes', async () => {
  vi.useFakeTimers();
  onTestFinished(() => vi.useRealTimers());
  const { picks } = await mount('#ffffff #000000');
  const chip = host.querySelector('input.chip');
  chip.value = '#ff0000';
  await fire(chip, 'input');
  await fire(chip, 'change');
  vi.advanceTimersByTime(2000);
  expect(picks).toEqual([true, false]);
});

test('with a mouse a swatch dragged onto another moves there and stays picked', async () => {
  await page.viewport(1200, 800);
  onTestFinished(() => page.viewport(414, 896));
  await vi.waitFor(() => expect(innerWidth).toBe(1200));
  const { list } = await mount('#111111 #222222 #333333');
  expect(swatches()[0].getAttribute('draggable')).toBe('true');
  swatches()[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
  const over = new DragEvent('dragover', { bubbles: true, cancelable: true });
  swatches()[2].dispatchEvent(over);
  expect(over.defaultPrevented).toBe(true);
  swatches()[2].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true }));
  await nextTick();
  expect(list.value).toBe('#222222 #333333 #111111');
  expect(pressed()).toBe(2);
});

test('Import replaces the list with a .hex file\'s colors and offers Put back; a file with no colors changes nothing', async () => {
  const { list, emitted } = await mount('#FFF #000');
  expect(host.querySelector('input.hex-file[type=file]').getAttribute('accept')).toBe('.hex,.txt,text/plain');
  await importFile('1a1c2c\r\n5d275d\r\n', 'sweetie.hex');
  expect(list.value).toBe('#1a1c2c #5d275d');
  expect(toastMessage.value).toBe('Palette colors replaced with sweetie.hex\'s.');
  expect(toastAction.value.label).toBe('Put back');
  toastAction.value.run();
  await nextTick();
  expect(list.value).toBe('#FFF #000');

  closeToast();
  const count = emitted.length;
  await importFile('hello', 'notes.txt');
  expect(toastMessage.value).toBe('No colors found in notes.txt.');
  expect(emitted.length).toBe(count);

  closeToast();
  await importFile(Array.from({ length: 300 }, (_, i) => (i % 256).toString(16).padStart(6, '0')).join('\n'), 'big.hex');
  expect(swatches()).toHaveLength(256);
  expect(toastMessage.value).toBe('Palette colors replaced with the first 256 of big.hex\'s 300.');
});

test('the import toast goes with the editor, so its Put back is never left doing nothing; another toast since is left alone', async () => {
  await mount('#FFF #000');
  await importFile('1a1c2c\n5d275d\n', 'sweetie.hex');
  gone();
  expect(toastMessage.value).toBe(null);

  await mount('#FFF #000');
  await importFile('1a1c2c\n', 'one.hex');
  toast('Something else.');
  gone();
  expect(toastMessage.value).toBe('Something else.');

  await mount('#FFF #000');
  toast('Something else.');
  gone();
  expect(toastMessage.value).toBe('Something else.'); // nothing imported, nothing closed
});

test('Export saves the list as <name>.hex', async () => {
  await mount('#FFF #a50 #000');
  const saved = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { saved.push({ blob }); return 'blob:x'; });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { saved.at(-1).name = this.download; });
  await press(host.querySelector('button.export'));
  expect(saved[0].name).toBe('art.hex');
  expect(await saved[0].blob.text()).toBe('ffffff\naa5500\n000000\n');
});

test('Export is off with no colors to save, as + is', async () => {
  await mount('');
  expect(host.querySelector('button.export').disabled).toBe(true);
  expect(host.querySelector('button.add').disabled).toBe(true);
});

test('inside a disabled fieldset every control of it is off', async () => {
  await mount('#ffffff #000000', (node) => h('fieldset', { disabled: true }, [node]));
  const controls = [...host.querySelectorAll('button, input')];
  expect(controls.length).toBeGreaterThan(8);
  expect(controls.filter((el) => !el.matches(':disabled'))).toEqual([]);
});
