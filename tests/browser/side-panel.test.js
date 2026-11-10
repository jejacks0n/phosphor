// The side panel (SidePanel.vue): LAYERS, and Social, which is CHAT while you're in a room; its width from its edge's keys,
// kept in the browser and held between its narrowest and widest; folding away on the arrow by Animate (EditTabs.vue),
// and the count of what was said while the chat wasn't showing. Dragging the edge with a real pointer is tests/e2e/side-panel.spec.js.
import { test, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { toastMessage } from '@/composables/useToast';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import SidePanel, { SIDE_PANEL } from '@/components/SidePanel.vue';
import EditTabs from '@/components/EditTabs.vue';

let app = null, host = null;
beforeAll(() => page.viewport(1200, 800)); // a wide screen, where the side panel and its arrow are
afterAll(() => page.viewport(414, 896));
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
  app = createApp({ render: () => [h(EditTabs, { modelValue: 'input' }), h(SidePanel)] }).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  return { room: useRoomStore(), workspace: useWorkspaceStore() };
}
const panel = () => host.querySelector('.side-panel');
const words = (b) => [...b.childNodes].filter((n) => n.nodeType !== Node.COMMENT_NODE && !n.classList?.contains('beta')).map((n) => n.textContent).join('').trim().replace(/\s+/g, ' ');
const tabs = () => [...host.querySelectorAll('.side-panel [role=tab]')].map((b) => [words(b), b.getAttribute('aria-selected')]);
const arrow = () => host.querySelector('nav button.panel');
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
  expect([arrow().textContent, arrow().getAttribute('aria-label'), arrow().getAttribute('aria-expanded')]).toEqual(['»', 'Fold the panel', 'true']);
  expect(arrow().previousElementSibling.matches('label.animate')).toBe(true); // right next to Animate
  arrow().click();   // folded, it takes no width at all; and a fold is kept in the browser
  await nextTick();
  expect(panel().getBoundingClientRect().width).toBe(0);
  expect(panel().checkVisibility()).toBe(false);
  expect([arrow().textContent, arrow().getAttribute('aria-label'), arrow().getAttribute('aria-expanded')]).toEqual(['«', 'Open the panel', 'false']);
  expect(localStorage.getItem('phosphor.sidePanelFolded')).toBe('true');
  arrow().click();
  await nextTick();
  expect(tabs()).toEqual([['Layers', 'true'], ['Social', 'false']]);
  expect(host.querySelectorAll('.side-panel [role=tab]')[1].getAttribute('aria-description')).toBe('Beta');
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
  expect(host.querySelector('span.unread')).toBe(null);   // seen as it came

  host.querySelector('.side-panel [role=tab]').click();   // LAYERS
  await say(room, row(2, { presence: 'joined' }));
  expect(host.querySelector('span.unread')).toBe(null);
  await say(room, row(3));
  await say(room, row(4));
  expect(tabs()).toEqual([['Layers', 'true'], ['Chat 2', 'false']]);
  host.querySelectorAll('.side-panel [role=tab]')[1].click();
  await nextTick();
  expect(host.querySelector('span.unread')).toBe(null);

  arrow().click();
  await nextTick();
  expect(panel().getBoundingClientRect().width).toBe(0);
  expect(grip()).toBe(null);
  await say(room, row(5));
  expect(host.querySelector('nav span.unread').textContent).toBe('1');   // by the arrow
  arrow().click();
  await nextTick();
  expect(host.querySelector('span.unread')).toBe(null);
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

test('the lobby says how many of who\'s here are signed in and how many are guests', async () => {
  const { workspace } = await mount();
  workspace.showSocial();
  const social = useSocialStore();
  const person = (sub, guest) => [sub, { sub, name: sub, guest }];
  social.lobby = { rooms: new Map(), people: new Map([person('u_1', false), person('u_2', false), person('g_1', true)]) };
  await nextTick();
  expect(host.querySelector('h3.here span.count').textContent).toBe('2 signed in · 1 guest');
  social.lobby = { rooms: new Map(), people: new Map([person('g_1', true), person('g_2', true)]) };
  await nextTick();
  expect(host.querySelector('h3.here span.count').textContent).toBe('0 signed in · 2 guests');
});
