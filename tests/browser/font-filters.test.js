// The Fonts page's filters: the library's tags in groups that fold, Machine's ten biggest first, each chip a toggle
// with its library-wide count.
import { test, expect, afterEach } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { i18n } from '@/i18n';
import FontFilters from '@/components/FontFilters.vue';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
});

const MACHINES = Array.from({ length: 12 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`); // M01 is the biggest
const GROUPS = [
  { group: 'machine', tags: MACHINES.map((m) => ({ key: `machine:${m}`, label: m })) },
  { group: 'shape', tags: [{ key: 'shape:8x8', label: '8×8' }, { key: 'shape:8x16', label: '8×16' }] },
  { group: 'other', tags: [{ key: 'ready', label: 'Ready to paint' }] },
];
const COUNTS = new Map([...MACHINES.map((m, i) => [`machine:${m}`, 12 - i]), ['shape:8x8', 5], ['shape:8x16', 3], ['ready', 4]]);

function mount({ picked = [], closed = [] } = {}) {
  const state = reactive({ picked, closed, toggled: [], updates: [] });
  host = document.body.appendChild(document.createElement('div'));
  app = createApp({
    render: () => h(FontFilters, {
      groups: GROUPS,
      counts: COUNTS,
      picked: state.picked,
      closed: state.closed,
      onToggle: (key) => state.toggled.push(key),
      'onUpdate:closed': (value) => state.updates.push(value),
    }),
  }).use(i18n);
  app.mount(host);
  return state;
}
const section = (group) => host.querySelector(`section.filter-group[data-group="${group}"]`);
const labels = (group) => [...section(group).querySelectorAll('.chip')].map((el) => el.firstChild.textContent.trim());
const chip = (label) => [...host.querySelectorAll('.chip')].find((el) => el.firstChild.textContent.trim() === label);

test('Machine shows its 10 biggest, picked ones first, and + N more shows them all by name', async () => {
  mount({ picked: ['machine:M12'] });
  expect(labels('machine')).toEqual(['M12', 'M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09']);
  const more = section('machine').querySelector('button.more');
  expect(more.textContent.trim()).toBe('+ 2 more');
  more.click();
  await nextTick();
  expect(labels('machine')).toEqual(MACHINES);
  expect(section('machine').querySelector('button.more')).toBeNull();
});

test('Find a machine… shows every machine it matches', async () => {
  mount();
  const find = section('machine').querySelector('input.find');
  expect(find.placeholder).toBe('Find a machine…');
  find.value = 'm1';
  find.dispatchEvent(new Event('input'));
  await nextTick();
  expect(labels('machine')).toEqual(['M10', 'M11', 'M12']);
  expect(section('machine').querySelector('button.more')).toBeNull();
});

test('a chip is a toggle with its library-wide count, never disabled', async () => {
  const state = mount();
  const m03 = chip('M03');
  expect(m03.getAttribute('aria-pressed')).toBe('false');
  expect(m03.querySelector('.count').textContent).toBe('10');
  expect(m03.disabled).toBe(false);
  m03.click();
  expect(state.toggled).toEqual(['machine:M03']);
  state.picked = ['machine:M03'];
  await nextTick();
  expect(chip('M03').getAttribute('aria-pressed')).toBe('true');
});

test("a group's header folds it and says how many are picked, or how many tags it has", async () => {
  const state = mount();
  const head = () => section('shape').querySelector('button.group-head');
  expect(head().querySelector('.name').textContent).toBe('Shape');
  expect(head().querySelector('.note').textContent).toBe('2');
  expect(head().getAttribute('aria-expanded')).toBe('true');
  state.picked = ['shape:8x8'];
  await nextTick();
  expect(head().querySelector('.note').textContent).toBe('1 picked');
  head().click();
  expect(state.updates).toEqual([['shape']]);
  state.closed = ['shape'];
  await nextTick();
  expect(head().getAttribute('aria-expanded')).toBe('false');
  expect(section('shape').querySelector('div.chips')).toBeNull();
  head().click();
  expect(state.updates.at(-1)).toEqual([]);
});
