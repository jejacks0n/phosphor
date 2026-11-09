// The side panel (SidePanel.vue): LAYERS, and Social, which is CHAT while you're in a room; its width from its edge's keys,
// kept in the browser and held between its narrowest and widest; folding to a rail; and the count of what
// was said while the chat wasn't showing. Dragging the edge with a real pointer is tests/e2e/side-panel.spec.js.
import { test, expect, afterEach } from 'vitest';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { toastMessage } from '@/composables/useToast';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import SidePanel, { SIDE_PANEL } from '@/components/SidePanel.vue';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
});

const row = (n, fields = {}) => ({ id: String(n).padStart(16, '0'), ts: 1_700_000_000_000 + n * 60_000, text: `m${n}`, sub: `u_${n}`, name: `name-${n}`, host: false, mine: false, deleted: false, ...fields });

async function mount(before = () => {}) {
  await createTestApp();
  before(useRoomStore());
  host = document.createElement('div');
  host.style.cssText = 'display:flex;height:600px';
  document.body.append(host);
  app = createApp(SidePanel).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  return { room: useRoomStore(), workspace: useWorkspaceStore() };
}
const panel = () => host.querySelector('.side-panel');
const words = (b) => [...b.childNodes].filter((n) => n.nodeType !== Node.COMMENT_NODE && !n.classList?.contains('beta')).map((n) => n.textContent).join('').trim().replace(/\s+/g, ' ');
const tabs = () => [...host.querySelectorAll('[role=tab]')].map((b) => [words(b), b.getAttribute('aria-selected')]);
const grip = () => host.querySelector('[role=separator]');
const press = async (key) => {
  grip().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  await nextTick();
};
const enter = async (room, chat = []) => {
  inRoom(room, chat);
  await nextTick();
};
const inRoom = (room, chat = []) => Object.assign(room, { role: 'watch', id: 'abcdefghij', status: 'live', room: { name: 'neon harbor', welcome: '' }, chat });
const say = async (room, ...said) => {
  room.chat = [...room.chat, ...said];
  await nextTick();
};

test('out of a room it has LAYERS and Social (marked Beta); its edge\'s keys resize it within its bounds, a double-click puts it back, and the width is kept', async () => {
  const { workspace } = await mount();
  expect(workspace.sidePanelFolded).toBe(false);   // open to begin with
  expect(panel().getBoundingClientRect().width).toBe(SIDE_PANEL.width);
  host.querySelector('button.fold').click();   // and a fold is kept in the browser
  await nextTick();
  expect(panel().getBoundingClientRect().width).toBe(28);
  expect(localStorage.getItem('phosphor.sidePanelFolded')).toBe('true');
  host.querySelector('button.open').click();
  await nextTick();
  expect(tabs()).toEqual([['Layers', 'true'], ['Social', 'false']]);
  expect(host.querySelectorAll('[role=tab]')[1].getAttribute('aria-description')).toBe('Beta');
  expect(host.querySelector('aside.layers').getAttribute('aria-label')).toBe('Layers');
  expect(panel().getBoundingClientRect().width).toBe(SIDE_PANEL.width);

  await press('ArrowLeft');   // the edge is on the left: Left widens
  expect(panel().getBoundingClientRect().width).toBe(SIDE_PANEL.width + SIDE_PANEL.step);
  expect(grip().getAttribute('aria-valuenow')).toBe(String(SIDE_PANEL.width + SIDE_PANEL.step));
  expect(localStorage.getItem('phosphor.sidePanelWidth')).toBe(String(SIDE_PANEL.width + SIDE_PANEL.step));
  await press('ArrowRight');
  await press('ArrowRight');
  expect(panel().getBoundingClientRect().width).toBe(SIDE_PANEL.width - SIDE_PANEL.step);
  await press('End');
  expect(panel().getBoundingClientRect().width).toBe(SIDE_PANEL.max);
  await press('ArrowLeft');
  expect(workspace.sidePanelWidth).toBe(SIDE_PANEL.max);
  await press('Home');
  await press('ArrowRight');
  expect(panel().getBoundingClientRect().width).toBe(SIDE_PANEL.min);

  workspace.sidePanelWidth = 5000;   // a width kept from elsewhere is held too
  await nextTick();
  expect(panel().getBoundingClientRect().width).toBe(SIDE_PANEL.max);
  grip().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await nextTick();
  expect(panel().getBoundingClientRect().width).toBe(SIDE_PANEL.width);
});

test('going into a room opens it on CHAT; what\'s said behind LAYERS or the fold is counted (not who came and went) until the chat shows; leaving shows the lobby there', async () => {
  const { room, workspace } = await mount();
  await enter(room, [row(0)]);
  expect(workspace.sidePanelFolded).toBe(false);
  expect(tabs()).toEqual([['Layers', 'false'], ['Chat', 'true']]);
  expect(host.querySelector('aside.chat').getAttribute('aria-label')).toBe('Chat');
  await say(room, row(1));
  expect(host.querySelector('span.count')).toBe(null);   // seen as it came

  host.querySelector('[role=tab]').click();   // LAYERS
  await say(room, row(2, { presence: 'joined' }));
  expect(host.querySelector('span.count')).toBe(null);
  await say(room, row(3));
  await say(room, row(4));
  expect(tabs()).toEqual([['Layers', 'true'], ['Chat 2', 'false']]);
  host.querySelectorAll('[role=tab]')[1].click();
  await nextTick();
  expect(host.querySelector('span.count')).toBe(null);

  host.querySelector('button.fold').click();
  await nextTick();
  expect(document.activeElement).toBe(host.querySelector('button.open'));
  expect(panel().getBoundingClientRect().width).toBe(28);
  expect(grip()).toBe(null);
  await say(room, row(5));
  expect(host.querySelector('.rail span.count').textContent).toBe('1');
  host.querySelector('button.open').click();
  await nextTick();
  expect(host.querySelector('span.count')).toBe(null);
  expect(panel().getBoundingClientRect().width).toBe(SIDE_PANEL.width);

  room.role = null;
  await nextTick();
  expect(tabs()).toEqual([['Layers', 'false'], ['Social', 'true']]);
  expect(host.querySelector('aside.chat')).toBe(null);
});

test('in a room already when it comes (a reload), it opens on CHAT; leaving with focus lost with what held it puts focus on the lobby\'s heading', async () => {
  const { room, workspace } = await mount((r) => inRoom(r, [row(0)]));
  expect(workspace.sidePanelFolded).toBe(false);
  expect(tabs()).toEqual([['Layers', 'false'], ['Chat', 'true']]);

  document.activeElement?.blur();   // the button that ended it, gone
  room.role = null;
  await nextTick();
  await nextTick();
  expect(document.activeElement).toBe(host.querySelector('section.lobby h2'));
});

test('in a room, what SOCIAL says (the lobby\'s notice line, not showing) is a toast; out of one it isn\'t', async () => {
  const { room } = await mount();
  const social = useSocialStore();
  toastMessage.value = null;
  social.notice = 'Something went wrong. Try again.';
  await nextTick();
  expect(toastMessage.value).toBe(null);   // the lobby shows it

  social.notice = null;
  await enter(room);
  social.notice = 'Something went wrong. Try again.';
  await nextTick();
  expect(toastMessage.value).toBe('Something went wrong. Try again.');
});
