// The side panel (SidePanel.vue): LAYERS, and Social, which is CHAT while you're in a room; its width from its edge's keys,
// kept in the browser and held between its narrowest and widest; folding away on the » at its tabs' right end (and the « of EditTabs.vue in the same spot),
// and the count of what was said while the chat wasn't showing. Dragging the edge with a real pointer is tests/e2e/side-panel.spec.js.
import { test, expect, afterEach, beforeAll, afterAll, onTestFinished } from 'vitest';
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
const tabs = () => [...host.querySelectorAll('.side-panel [role=tab]')].filter((b) => b.getAttribute('aria-label') !== 'History').map((b) => [words(b), b.getAttribute('aria-selected')]);   // the dev-only History tab (tests run in dev) is history-tab.test.js's
const arrow = () => host.querySelector('button.panel');   // » in the panel's tabs while open, « in the nav while folded
const turned = () => getComputedStyle(arrow().querySelector('svg.arrow-icon')).rotate;   // » drawn as a double arrow pointing right, « turned half around
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
  expect([turned(), arrow().getAttribute('aria-label'), arrow().getAttribute('aria-expanded')]).toEqual(['0deg', 'Collapse panel', 'true']);
  expect(arrow().parentElement.matches('.side-panel div.tabs')).toBe(true);   // at the right end of the panel's tabs
  const mid = (el) => (el.getBoundingClientRect().top + el.getBoundingClientRect().bottom) / 2;
  expect(arrow().getBoundingClientRect().top - arrow().parentElement.getBoundingClientRect().top).toBeCloseTo(6.5, 1);   // where the « will be
  const layers = host.querySelector('.side-panel [role=tab]'), word = document.createRange();
  word.selectNodeContents(layers);
  expect(mid(word) - mid(layers)).toBeCloseTo(2, 0);   // a tab's word sits 2px under its middle
  expect(layers.getBoundingClientRect().height).toBe(layers.parentElement.getBoundingClientRect().height);   // in a tab as tall as the strip
  expect(arrow().previousElementSibling.matches('[role=tablist]')).toBe(true);
  expect(host.querySelector('nav button.panel')).toBe(null);
  arrow().click();   // folded, it takes no width at all; and a fold is kept in the browser
  await nextTick();
  expect(panel().getBoundingClientRect().width).toBe(0);
  expect(panel().checkVisibility()).toBe(false);
  expect(arrow().parentElement.matches('nav.workspace-tabs')).toBe(true);   // and the « is in the nav
  expect(mid(host.querySelector('label.animate')) - mid(arrow())).toBeCloseTo(1, 0);   // as high as the » was: 2px above the row's middle, where Animate is 1px above it
  await nextTick();
  expect(document.activeElement).toBe(arrow());   // focus went with it
  expect([turned(), arrow().getAttribute('aria-label'), arrow().getAttribute('aria-expanded')]).toEqual(['180deg', 'Expand panel', 'false']);
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

test('in a room already when it comes (the window widened, say), it opens on CHAT; leaving with focus lost with what held it puts focus on the lobby\'s heading', async () => {
  const { room, workspace } = await mount((r) => inRoom(r, [row(0)]));
  expect(workspace.sidePanelFolded).toBe(false);
  expect(tabs()).toEqual([['Layers', 'false'], ['Chat', 'true']]);

  document.activeElement?.blur();   // the button that ended it, gone
  room.role = null;
  await nextTick();
  await nextTick();
  expect(document.activeElement).toBe(host.querySelector('section.lobby h2'));
});

// A reload into the room: new stores, the fold as the browser kept it, and this load coming back to a room.
async function reloadInto(folded) {
  await nextTick();   // the chat, if it was shown, scrolled to its newest
  app.unmount();
  host.remove();
  return mount((r) => {
    useWorkspaceStore().sidePanelFolded = folded;
    useSocialStore()._roomGoesOn = true;
    inRoom(r, [row(0)]);
  });
}

test('a reload into the room shows the panel as it was: folded stays folded, and LAYERS or CHAT, whichever showed', async () => {
  sessionStorage.clear();
  const { room } = await mount();
  await enter(room, [row(0)]);
  host.querySelector('.side-panel [role=tab]').click();   // LAYERS
  arrow().click();
  await nextTick();
  expect(sessionStorage.getItem('phosphor.sidePanelRoomTab')).toBe('layers');
  expect(localStorage.getItem('phosphor.sidePanelFolded')).toBe('true');

  let again = await reloadInto(true);
  expect(again.workspace.sidePanelFolded).toBe(true);
  expect(again.workspace.sidePanelTab).toBe('layers');
  arrow().click();
  await nextTick();
  expect(tabs()).toEqual([['Layers', 'true'], ['Chat', 'false']]);
  host.querySelectorAll('.side-panel [role=tab]')[1].click();   // CHAT
  await nextTick();
  expect(sessionStorage.getItem('phosphor.sidePanelRoomTab')).toBe('social');

  again = await reloadInto(false);
  expect(again.workspace.sidePanelFolded).toBe(false);
  expect(tabs()).toEqual([['Layers', 'false'], ['Chat', 'true']]);

  host.querySelector('.side-panel [role=tab]').click();   // LAYERS, then out of the room, and into another from the lobby: that opens on CHAT
  await nextTick();
  expect(sessionStorage.getItem('phosphor.sidePanelRoomTab')).toBe('layers');
  arrow().click();
  again.room.role = null;
  await nextTick();
  again.workspace.sidePanelTab = 'social';   // the lobby, folded
  await nextTick();
  await enter(again.room);
  expect(again.workspace.sidePanelFolded).toBe(false);
  expect(tabs()).toEqual([['Layers', 'false'], ['Chat', 'true']]);
  expect(sessionStorage.getItem('phosphor.sidePanelRoomTab')).toBe('social');
  await nextTick();   // the chat, shown, scrolls to its newest
  sessionStorage.clear();
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

test('the marker on its picked tab is a line along its foot that slides to the tab picked', async () => {
  const { workspace } = await mount();
  const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const marker = () => host.querySelector('.side-panel div.tablist .indicator');
  const at = (i) => {
    const list = host.querySelector('.side-panel div.tablist').getBoundingClientRect(), tab = host.querySelectorAll('.side-panel [role=tab]')[i].getBoundingClientRect();
    return { transform: `translateX(${Math.round(tab.left - list.left)}px)`, width: `${Math.round(tab.width)}px` };
  };
  await new Promise((resolve) => setTimeout(resolve, 150));
  await frames();
  expect(marker()).toBeTruthy();
  expect({ transform: marker().style.transform, width: marker().style.width }).toEqual(at(0));
  workspace.sidePanelTab = 'social';
  await nextTick();
  await frames();
  expect({ transform: marker().style.transform, width: marker().style.width }).toEqual(at(1));
  expect(getComputedStyle(marker()).transitionProperty).toContain('transform'); // it moves there, not jumps
  const tab = host.querySelectorAll('.side-panel [role=tab]')[1].getBoundingClientRect();
  expect(Math.abs(marker().getBoundingClientRect().top - (tab.bottom - 1))).toBeLessThan(1.5); // along its foot, not its top
});

test('in a room, a speaker beside the fold turns the tone for new messages off and on, on CHAT and LAYERS alike; out of one there is none', async () => {
  const { room, workspace } = await mount();
  const speaker = () => host.querySelector('.side-panel div.tabs button.tone');
  expect(speaker()).toBe(null);
  await enter(room);
  expect(speaker().getAttribute('aria-label')).toBe('Sound for new messages');
  expect(speaker().nextElementSibling).toBe(arrow());
  expect(speaker().getAttribute('aria-pressed')).toBe('true');
  speaker().click();
  await nextTick();
  expect(workspace.chatTone).toBe(false);
  expect(speaker().getAttribute('aria-pressed')).toBe('false');
  workspace.sidePanelTab = 'layers';
  await nextTick();
  speaker().click();
  await nextTick();
  expect(workspace.chatTone).toBe(true);
  expect(speaker().getAttribute('aria-pressed')).toBe('true');
});

// A narrow screen: the panel over the art from the right, shut until « opens it. Its slide, and a screen's new width
// reaching it (a media query's change), each wait on a frame, and a machine busy with other test files draws few: five in
// a second and a half, measured, so these waits get longer than the default second.
const PATIENT = { timeout: 5000 };
async function narrow() {
  await page.viewport(414, 896);
  onTestFinished(() => page.viewport(1200, 800));
}

test('on a narrow screen it\'s shut until « opens it over the art, leaving a strip; », Escape and a tap on the strip shut it, and it and the settings drawer take turns', async () => {
  await narrow();
  const { workspace } = await mount();
  expect(panel().getBoundingClientRect().width).toBe(0);
  expect(host.querySelector('.scrim')).toBe(null);
  arrow().click();   // «
  await nextTick();
  await nextTick();
  expect(getComputedStyle(panel()).position).toBe('fixed');
  await expect.poll(() => panel().getBoundingClientRect().right, PATIENT).toBe(414);   // slid in
  expect(panel().getBoundingClientRect().width).toBe(SIDE_PANEL.width);   // 134 px of the art beside it
  expect(grip()).toBe(null);   // no edge to drag
  expect(document.activeElement).toBe(arrow());   // », in its tabs
  expect(workspace.sidePanelFolded).toBe(false);   // a wide screen's fold is its own

  arrow().click();   // »
  await nextTick();
  expect(panel().getBoundingClientRect().width).toBe(0);
  workspace.toggleSidePanel();
  await nextTick();
  panel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await nextTick();
  expect(workspace.sidePanelOpen).toBe(false);
  workspace.toggleSidePanel();
  await nextTick();
  host.querySelector('.scrim').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));   // a press on the art beside it
  await nextTick();
  expect([workspace.sidePanelOpen, panel().getBoundingClientRect().width]).toEqual([false, 0]);

  workspace.toggleSettings();
  workspace.toggleSidePanel();
  expect([workspace.sidePanelOpen, workspace.settingsOpen]).toEqual([true, false]);
  workspace.toggleSettings();
  expect([workspace.sidePanelOpen, workspace.settingsOpen]).toEqual([false, true]);
  workspace.settingsOpen = false;
});

test('on a narrow screen, going into a room leaves it shut on CHAT, « counting what\'s said; opened, the chat shows and the count goes', async () => {
  await narrow();
  const { room, workspace } = await mount();
  room.joinedAt = row(0).id;   // the history it came in on: nothing new
  await enter(room, [row(0)]);
  expect([workspace.sidePanelOpen, workspace.sidePanelTab]).toEqual([false, 'social']);
  expect(host.querySelector('span.unread')).toBe(null);
  await say(room, row(1));
  expect(host.querySelector('nav span.unread').textContent).toBe('1');
  arrow().click();
  await nextTick();
  expect(host.querySelector('span.unread')).toBe(null);
  expect(host.querySelector('aside.chat').checkVisibility()).toBe(true);
  expect(tabs()).toEqual([['Layers', 'false'], ['Chat', 'true']]);
});

test('a narrow screen\'s panel, open when the window widens, is the wide one (folded or not, as kept); narrowed again, it starts shut', async () => {
  await narrow();
  const { workspace } = await mount();
  arrow().click();
  await nextTick();
  await page.viewport(1200, 800);
  await expect.poll(() => getComputedStyle(panel()).position, PATIENT).toBe('relative');
  // Once it has slid in: the slide « began goes on after the window widens, and mid-slide the width reads a hair off
  // (279.99997, the rounding of a box that's moving).
  await expect.poll(() => panel().getBoundingClientRect().width, PATIENT).toBe(SIDE_PANEL.width);
  await page.viewport(414, 896);
  await expect.poll(() => panel().getBoundingClientRect().width, PATIENT).toBe(0);
  expect(workspace.sidePanelOpen).toBe(false);
});
