// The start screen's "Pick up where you left off" rows (ZeroState.vue): the whole name with its extension, where that
// copy stands, and a time that tells two rows apart; on a phone, the name on its own line above the time and Open. And
// its buttons as a list: Up and Down move between Choose a file, Start blank and each Open, and Choose a file has focus
// in a fresh tab, so Tab goes on from it.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import ZeroState from '@/components/ZeroState.vue';
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
  expect(rows[0].querySelector('button').getAttribute('aria-label')).toBe('Open long-20261113-214338.ans');
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

test('a name too long for two lines is cut in the middle, keeping its end', () => {
  const name = `${'a very long name for a drawing '.repeat(4)}-20261113-214338`;
  const [li] = mount([row('a', { filename: name })]);
  const shown = text(li, '.name');
  expect(shown.length).toBeLessThan(name.length);
  expect(shown).toContain('…');
  expect(shown.endsWith('-20261113-214338.ans')).toBe(true);
  expect(li.querySelector('.name').title).toBe(`${name}.ans`);
});

test('Up and Down move between Choose a file, Start blank and each Open, past a drawing open in another tab, and the app\'s shortcuts don\'t hear them', () => {
  mount([row('a', { openElsewhere: true }), row('b'), row('c')]);
  const [browse, blank, elsewhere, openB, openC] = host.querySelectorAll('button');
  expect(elsewhere.disabled).toBe(true);
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

test('on a phone the name has its own line, whole, with the time, status and Open under it; wider, it\'s one line', async () => {
  let [li] = mount([row('a', { asOpened: true })], 358);
  const name = li.querySelector('.name'), open = li.querySelector('button');
  expect(name.getBoundingClientRect().bottom).toBeLessThanOrEqual(open.getBoundingClientRect().top + 1);
  expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth);
  expect(name.scrollHeight).toBeLessThanOrEqual(name.clientHeight);
  expect(open.getBoundingClientRect().right).toBeLessThanOrEqual(host.getBoundingClientRect().right);
  mounted.unmount();
  host.remove();

  [li] = mount([row('a', { asOpened: true })], 900);
  const top = (el) => Math.round(li.querySelector(el).getBoundingClientRect().top);
  expect(Math.abs(top('.name') - top('time'))).toBeLessThanOrEqual(2);

  await setLocale('fr', { persist: false });
  expect(text(li, '.status')).toBe('Inchangé');
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
