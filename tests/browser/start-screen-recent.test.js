// The start screen (ZeroState.vue): a dashed line around the whole canvas, which is what takes a dropped file, with
// Choose a file and Start with a blank canvas side by side in its middle as two buttons of one height; on a phone no
// line, and the two a finger's size, one over the other. With recent work the two are the list's width, edge to edge:
// each half of it side by side, or one over the other where the canvas is too narrow for that, whatever the window's
// width. And its "Pick up where you left off" rows under them: the whole
// name with its extension, where that copy stands, and a time that tells two rows apart; every row two lines, the name
// over the time and state, with Resume beside both, on a computer and on a phone (in a sliver of canvas the state goes
// under the time, neither of them under Resume). And its buttons as a list: Up and Down move between
// Choose a file, Start blank and each row, and Choose a file has focus in a fresh tab, so Tab goes on from it.
import { test, expect, afterEach, onTestFinished, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick, ref } from 'vue';
import ZeroState from '@/components/ZeroState.vue';
import '@/assets/global.css'; // the app's colors and buttons, as the start screen is drawn with them
import { i18n, setLocale } from '@/i18n';

let mounted = null, host = null;
afterEach(async () => {
  mounted?.unmount();
  host?.remove();
  mounted = host = null;
  await setLocale('en', { persist: false });
});

const at = (text) => new Date(text).getTime();
const row = (id, extra) => ({ id, filename: 'long-20261113-214338', fileExt: 'ans', editedAt: at('2026-11-13T21:49:12'), openElsewhere: false, ...extra });

function mount(recent, width = 900) {
  host = Object.assign(document.createElement('div'), { style: `width: ${width}px; display: flex` });
  document.body.append(host);
  mounted = createApp(ZeroState, { recent, openRecent: () => {} }).use(i18n);
  mounted.mount(host);
  return [...host.querySelectorAll('.recent li')];
}
const text = (el, selector) => el.querySelector(selector).textContent.trim();

test('a row shows the whole name with its extension, and whether that copy is unchanged, changed or saved', () => {
  const rows = mount([
    row('a', { asOpened: true, savedToFile: true }), // a project opened and not touched: unchanged, though it's saved
    row('b', { fileExt: 'phosphor', dirty: true, savedToFile: true, editedAt: at('2026-11-13T20:00:00') }),
    row('c', { fileExt: 'phosphor', savedToFile: true, editedAt: at('2026-11-13T19:00:00') }),
    row('d', { fileExt: null, filename: 'Untitled', editedAt: at('2026-11-13T18:00:00') }),
  ]);
  expect(rows.map((li) => [text(li, '.name'), text(li, '.status')])).toEqual([
    ['long-20261113-214338.ans', 'Unchanged'],
    ['long-20261113-214338.phosphor', 'Changed'],
    ['long-20261113-214338.phosphor', 'Saved'],
    ['Untitled', 'Unchanged'],
  ]);
  expect(rows[0].querySelector('button').getAttribute('aria-label')).toBe('Resume long-20261113-214338.ans');
  expect(text(rows[0], '.go')).toBe('Resume ›');
});

test('two rows of the same name in the same minute show their seconds; the year shows only when it isn\'t this one', () => {
  const thisYear = new Date().getFullYear();
  const rows = mount([
    row('a', { editedAt: at(`${thisYear}-03-02T09:49:58`) }),
    row('b', { editedAt: at(`${thisYear}-03-02T09:49:12`) }),
    row('c', { fileExt: 'phosphor', editedAt: at(`${thisYear}-03-02T09:49:30`) }), // another name: no seconds
    row('d', { editedAt: at(`${thisYear - 1}-03-02T09:49:30`) }),
  ]);
  const times = rows.map((li) => text(li, 'time'));
  expect(times[0]).toMatch(/9:49:58/);
  expect(times[1]).toMatch(/9:49:12/);
  expect(times[2]).toMatch(/9:49\s?AM/);
  expect(times.slice(0, 3).join()).not.toContain(String(thisYear));
  expect(times[3]).toContain(String(thisYear - 1));
});

test('a name too long for its line ends in an ellipsis, the whole of it in the row\'s title', () => {
  const name = `${'a very long name for a drawing '.repeat(4)}-20261113-214338`;
  const [li] = mount([row('a', { filename: name })]);
  const shown = li.querySelector('.name');
  expect(shown.textContent).toBe(`${name}.ans`);
  expect(getComputedStyle(shown).textOverflow).toBe('ellipsis');
  expect(shown.scrollWidth).toBeGreaterThan(shown.clientWidth);
  expect(li.title).toBe(`${name}.ans`);
});

test('Up and Down move between Choose a file, Start blank and each row, past a drawing open in another tab, and the app\'s shortcuts don\'t hear them', () => {
  mount([row('a', { openElsewhere: true }), row('b'), row('c')]);
  const [browse, blank, elsewhere, openB, openC] = host.querySelectorAll('button');
  expect(elsewhere.disabled).toBe(true);
  expect(text(elsewhere, '.go')).toBe('In another tab');
  expect(elsewhere.getAttribute('aria-label')).toBe('long-20261113-214338.ans (open in another tab)');
  const heard = vi.fn(); // where the app's shortcuts listen
  window.addEventListener('keydown', heard);
  const press = (key) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  try {
    browse.focus();
    const landed = ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp'].map((key) => {
      press(key);
      return document.activeElement;
    });
    expect(landed).toEqual([blank, openB, openC, openC, openB, blank, browse, browse]); // it stops at the ends
    expect(heard).not.toHaveBeenCalled();
    press('ArrowRight'); // not theirs
    expect(heard).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener('keydown', heard);
  }
});

// f16: long names took a second line and short ones didn't, so the times zigzagged and the rows differed in height.
test('every row is two lines, the name over the time and state, with Resume centered beside them, long name or short, on a phone too', async () => {
  for (const width of [900, 358]) {
    const rows = mount([
      row('a', { filename: 'rt15-long-fixed-20261118-222704-and-then-some-more-of-it' }),
      row('b', { filename: 'long' }),
      row('c', { filename: 'renamed-export-20261118-222216', fileExt: 'utf8ans', openElsewhere: true }),
    ], width);
    const box = (li, el) => li.querySelector(el).getBoundingClientRect();
    const heights = rows.map((li) => Math.round(li.getBoundingClientRect().height));
    expect(new Set(heights).size, `${width}: ${heights}`).toBe(1);
    for (const li of rows) {
      const name = box(li, '.name'), when = box(li, 'time'), go = box(li, '.go'), shown = li.getBoundingClientRect();
      expect(name.bottom).toBeLessThanOrEqual(when.top + 1);
      expect(Math.abs((go.top + go.bottom) / 2 - (name.top + when.bottom) / 2)).toBeLessThanOrEqual(2);
      expect(go.left).toBeGreaterThanOrEqual(name.right);
      expect(shown.right).toBeLessThanOrEqual(host.querySelector('.drop-zone').getBoundingClientRect().right);
    }
    expect(Math.round(box(rows[0], 'time').left)).toBe(Math.round(box(rows[1], 'time').left));
    mounted.unmount();
    host.remove();
  }
  mount([row('a', { asOpened: true })]);
  await setLocale('fr', { persist: false });
  expect(text(host, '.status')).toBe('Inchangé');
  expect(text(host, '.go')).toBe('Reprendre ›');
});

const rect = (selector) => host.querySelector(selector).getBoundingClientRect();
const middle = (box) => (box.left + box.right) / 2;
// These tests' window is a phone's; a computer's for the test that asks, and a phone's again after it.
const PHONE = [414, 896];
async function sized(width, height) {
  await page.viewport(width, height);
  await expect.poll(() => window.innerWidth).toBe(width); // the rules by width follow the window, a frame later
}
async function onAComputer() {
  await sized(1200, 800);
  onTestFinished(() => sized(...PHONE));
}

test('on a computer the dashed line runs around the whole canvas, list or no list, with the list a 480px column in its middle', async () => {
  await onAComputer();
  mount([row('a')]);
  const zone = host.querySelector('.drop-zone');
  expect(zone.contains(host.querySelector('section.recent'))).toBe(true);
  expect(getComputedStyle(zone).borderTopStyle).toBe('dashed');
  expect(rect('.drop-zone').width).toBe(900 - 2 * 16); // the canvas, less the gap the line keeps from its edge
  expect(rect('section.recent').width).toBe(480);
  expect(Math.abs(middle(rect('section.recent')) - middle(rect('.drop-zone')))).toBeLessThanOrEqual(1);
  expect(rect('.drop-zone p').left).toBeGreaterThan(rect('svg.icon').right); // the band: the arrow and the prompt on a line
  expect(Math.abs(middle(rect('.drop-zone p')) - middle(rect('svg.icon'))) > 20).toBe(true);
  expect(rect('svg.icon').bottom).toBeLessThanOrEqual(rect('.actions').top); // and the two starts under it
  expect(rect('.actions').bottom).toBeLessThanOrEqual(rect('section.recent').top);
  mounted.unmount();
  host.remove();
  mount([]);
  expect(host.querySelector('section.recent')).toBe(null);
  expect(rect('.drop-zone').width).toBe(900 - 2 * 16);
});

// The window's width doesn't tell the canvas's: a wide window with its panels open has a narrow one. The band was the
// arrow in a column of its own with the two starts beside it at their words' widths, short of the list's right edge,
// and in a narrow canvas one under the other at two widths.
test('with recent work the two starts are the list\'s width at any canvas width: each half of it side by side, or one over the other, each the whole of it', async () => {
  await onAComputer();
  // 560: the column is the canvas's, short of 480, with room to spare for both labels in the fonts of any computer the tests run on.
  for (const [width, stacked] of [[900, false], [560, false], [446, true], [300, true], [215, true]]) {
    mount([row('a'), row('b')], width);
    const browse = rect('button.browse'), blank = rect('button.blank'), list = rect('section.recent'), note = `canvas ${width}`;
    expect(Math.abs(browse.left - list.left), note).toBeLessThanOrEqual(0.5);
    expect(Math.abs(blank.right - list.right), note).toBeLessThanOrEqual(0.5);
    expect(Math.abs(blank.width - browse.width), note).toBeLessThanOrEqual(0.5);
    expect(blank.top >= browse.bottom, note).toBe(stacked);
    for (const button of host.querySelectorAll('.actions button')) expect(button.scrollHeight, note).toBeLessThanOrEqual(button.clientHeight); // its label in it
    for (const li of host.querySelectorAll('.recent li')) { // and a row's time and state never run under Resume
      const go = li.querySelector('.go').getBoundingClientRect();
      for (const part of li.querySelectorAll('time, .status')) expect(part.getBoundingClientRect().right, note).toBeLessThanOrEqual(go.left);
    }
    mounted.unmount();
    host.remove();
  }
});

test('the two starts are two buttons of one height, side by side under a drawn arrow; on a phone one over the other at a finger\'s size, with no dashed line', async () => {
  await onAComputer();
  mount([]);
  let browse = rect('button.browse'), blank = rect('button.blank');
  expect(host.querySelector('.drop-zone svg.icon path')).not.toBe(null); // drawn, not a character of some font
  expect(host.querySelector('.drop-zone').textContent).not.toContain('⬆');
  expect(blank.height).toBe(browse.height);
  expect(blank.top).toBe(browse.top);
  expect(blank.left - browse.right).toBeGreaterThanOrEqual(16); // room for the focus ring before the next button
  expect(rect('.drop-zone p').bottom).toBeLessThan(browse.top);
  expect(Math.abs((browse.left + blank.right) / 2 - middle(rect('.drop-zone')))).toBeLessThanOrEqual(1);
  mounted.unmount();
  host.remove();

  mount([], 346); // a canvas too narrow for both on a line: one over the other, the two one width
  browse = rect('button.browse');
  blank = rect('button.blank');
  expect(blank.top).toBeGreaterThan(browse.bottom);
  expect([blank.left, blank.width]).toEqual([browse.left, browse.width]);
  mounted.unmount();
  host.remove();

  await sized(...PHONE);
  mount([row('a')], 390);
  browse = rect('button.browse');
  blank = rect('button.blank');
  expect(getComputedStyle(host.querySelector('.drop-zone')).borderTopStyle).toBe('none');
  expect(browse.height).toBeGreaterThanOrEqual(44);
  expect(blank.height).toBe(browse.height);
  expect(blank.top).toBeGreaterThan(browse.bottom);
  expect([blank.left, blank.width]).toEqual([browse.left, browse.width]);
  expect(rect('section.recent').top).toBeGreaterThan(blank.bottom);
  expect(rect('section.recent').right).toBeLessThanOrEqual(rect('.zero-state').right);
  expect(rect('svg.icon').width).toBe(0); // the arrow and the prompt are a drop's, and a phone has none
});

// Mounted waiting (ready false), as a fresh tab's is: Choose a file takes focus once it's ready, unless something has it.
function mountWaiting(recent) {
  host = Object.assign(document.createElement('div'), { style: 'width: 900px; display: flex' });
  document.body.append(host);
  const ready = ref(false);
  mounted = createApp({ render: () => h(ZeroState, { ready: ready.value, recent, openRecent: () => {} }) }).use(i18n);
  mounted.mount(host);
  return ready;
}

test('in a fresh tab Choose a file has focus once the start screen is ready, unless something else already has it', async () => {
  let ready = mountWaiting([row('a')]);
  await nextTick();
  expect(document.activeElement).toBe(document.body);
  ready.value = true;
  await nextTick();
  await nextTick();
  expect(document.activeElement).toBe(host.querySelector('button.browse'));
  mounted.unmount();
  host.remove();

  const field = document.body.appendChild(document.createElement('input'));
  try {
    field.focus();
    ready = mountWaiting([row('a')]);
    ready.value = true;
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(field);
  } finally {
    field.remove();
  }
});

test('a start screen come back to, already ready (New project, leaving a room), leaves focus alone', async () => {
  document.activeElement?.blur();
  mount([row('a')]);
  await nextTick();
  await nextTick();
  expect(document.activeElement).toBe(document.body);
});
