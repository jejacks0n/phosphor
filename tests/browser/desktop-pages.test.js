// SOCIAL's pages in the desktop build: the start page (your name, Join by address, Start a room), the host form with
// its port, the host's addresses and the joins waiting for a yes, and what the web's pages have that the desktop
// doesn't (sign-in, Block, Report, the hosted service's privacy policy). The room store is set as the room leaves it;
// what the store does with these is tests/browser/desktop-room-*.test.js.
import { test, expect, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp } from '../support/app.js';
import { useRoomStore } from '@/store/RoomStore';
import { useSocialStore } from '@/store/SocialStore';
import { useDrawingStore } from '@/store/DrawingStore';
import DesktopStartPage from '@/components/social/DesktopStartPage.vue';
import StartRoomPage from '@/components/social/StartRoomPage.vue';
import HostRoomPage from '@/components/social/HostRoomPage.vue';
import WatchRoomPage from '@/components/social/WatchRoomPage.vue';
import RoomPeople from '@/components/social/RoomPeople.vue';
import ChatPanel from '@/components/social/ChatPanel.vue';
import UserName from '@/components/social/UserName.vue';
import JoinAsks from '@/components/social/JoinAsks.vue';
import SocialDialogs from '@/components/social/SocialDialogs.vue';
import LegalDialog from '@/components/LegalDialog.vue';
import SidePanel from '@/components/SidePanel.vue';
import { useWorkspaceStore } from '@/store/WorkspaceStore';

let app = null, host = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = host = null;
  vi.restoreAllMocks();
});

async function mount(component, before = () => {}, props = {}) {
  await createTestApp();
  const room = useRoomStore(), social = useSocialStore();
  await before({ room, social, drawing: useDrawingStore() });
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(component, props).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  return { room, social };
}
const button = (name, within = host) => [...within.querySelectorAll('button')].find((b) => b.textContent.trim() === name);
const field = (label, within = host) => [...within.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(label))?.querySelector('input, textarea');
const type = async (input, text) => {
  input.value = text;
  input.dispatchEvent(new Event('input'));
  await nextTick();
};
const hosting = (fields) => ({ room }) => Object.assign(room, {
  role: 'host', id: 'abcdefghij', link: null, status: 'live', port: 31337, addresses: [],
  room: { name: 'Night shift', welcome: '', max: 12, count: 0 }, ...fields,
});
const claims = (fields) => ({ sub: 'me-sub-0000', name: 'me', guest: false, verified: true, key: 'k', exp: 0, ...fields });

test('DesktopStartPage needs a name before Host or Join', async () => {
  const { social } = await mount(DesktopStartPage);
  expect(host.textContent).toContain('The people you connect with see your IP address.');
  expect([button('Start a room').disabled, button('Join').disabled]).toEqual([true, true]);

  await type(field('Your name'), '  ansi-fan ');
  expect(social.desktopName).toBe('ansi-fan');
  expect([button('Start a room').disabled, button('Join').disabled]).toEqual([false, false]);

  button('Start a room').click();
  expect(social.page).toBe('start-room');

  await type(field('Your name'), '   ');
  expect([button('Start a room').disabled, button('Join').disabled]).toEqual([true, true]);
});

test('the side panel\'s Social tab is the start page, not the lobby', async () => {
  await mount(SidePanel, () => useWorkspaceStore().showSocial());
  await vi.waitFor(() => expect(host.querySelector('section.lobby h2')?.textContent).toBe('Join a room'));
  expect(host.textContent).not.toContain('Public rooms');
});

test('a join waiting counts as unread while the chat isn\'t showing', async () => {
  const { room } = await mount(SidePanel, ({ room, social }) => {
    social.claims = claims();
    hosting()({ room });
    useWorkspaceStore().sidePanelTab = 'layers';
  });
  const workspace = useWorkspaceStore();
  workspace.sidePanelTab = 'layers';
  await nextTick();
  workspace.sidePanelUnread = 0;
  room.asks = [{ ask: 'a1', sub: 'wren-sub', name: 'wren' }];
  await nextTick();
  expect(workspace.sidePanelUnread).toBe(1);
  room.asks = [];   // answered: nothing more
  await nextTick();
  room.asks = [{ ask: 'a2', sub: 'owl-sub', name: 'owl' }];
  await nextTick();
  expect(workspace.sidePanelUnread).toBe(2);
  workspace.sidePanelTab = 'social';   // the chat showing: read
  await nextTick();
  room.asks = [...room.asks, { ask: 'a3', sub: 'cy-sub', name: 'cy' }];
  await nextTick();
  expect(workspace.sidePanelUnread).toBe(0);
});

test('the start page\'s password field stays while Join checks, and goes when the address changes', async () => {
  const { room } = await mount(DesktopStartPage, ({ room, social }) => {
    social.setDesktopName('ansi-fan');
    room.needsPassword = { address: '192.168.1.20:31337', name: 'Night shift' };
  });
  expect(field('Your name').getAttribute('aria-describedby')).toBe(null);
  let answer;
  vi.spyOn(room, 'joinAddress').mockImplementation(() => {
    room.needsPassword = null;   // as joinAddress does before it asks what's there
    return new Promise((resolve) => { answer = resolve; });
  });
  await type(field('Password'), 'sesame');
  button('Join').click();
  await nextTick();
  expect(field('Password')).toBeTruthy();
  answer(false);
  await vi.waitFor(() => expect(button('Join').disabled).toBe(false));
  expect(field('Password')).toBe(undefined);   // the check failed (unreachable, say): no password asked now

  room.needsPassword = { address: '192.168.1.20:31337', name: 'Night shift' };
  await nextTick();
  await type(field('Address'), '192.168.1.21');
  expect(room.needsPassword).toBe(null);
  expect(field('Password')).toBe(undefined);
});

test('the name gate\'s help is the name field\'s description; Copy, Let in and Turn away say whom', async () => {
  await mount(DesktopStartPage);
  const help = document.getElementById(field('Your name').getAttribute('aria-describedby'));
  expect(help.textContent).toBe('Pick a name others will see first.');
  app.unmount();
  host.remove();
  await mount(HostRoomPage, hosting({ addresses: ['192.168.1.20:31337'], asks: [{ ask: 'a1', sub: 'wren-sub', name: 'wren' }] }));
  expect(button('Copy').getAttribute('aria-label')).toBe('Copy 192.168.1.20:31337');
  expect(button('Let in').getAttribute('aria-label')).toBe('Let wren in');
  expect(button('Turn away').getAttribute('aria-label')).toBe('Turn wren away');
});

test('HostRoomPage desktop: no "Set when the room started" with nothing set then', async () => {
  await mount(HostRoomPage, hosting({ hasPassword: false }));
  expect(host.textContent).not.toContain('Set when the room started');
});

test('Join with a password-asking room shows the password field', async () => {
  const { room } = await mount(DesktopStartPage, ({ social }) => social.setDesktopName('ansi-fan'));
  const asked = vi.spyOn(room, 'joinAddress').mockImplementation(async (text, { password } = {}) => {
    if (password) return true;
    room.needsPassword = { address: '192.168.1.20:31337', name: 'Night shift' };
    return false;
  });
  expect(field('Password')).toBe(undefined);
  await type(field('Address'), ' 192.168.1.20 ');
  button('Join').click();
  await vi.waitFor(() => expect(field('Password')).toBeTruthy());
  expect(asked).toHaveBeenLastCalledWith(' 192.168.1.20 ', { password: undefined });
  expect(host.textContent).toContain('This room needs a password');

  await type(field('Password'), 'sesame');
  button('Join').click();
  await vi.waitFor(() => expect(asked).toHaveBeenLastCalledWith(' 192.168.1.20 ', { password: 'sesame' }));
});

test('a wrong password brings the start page back with the address and the password field', async () => {
  // over() closed the room; the page comes again, asking
  await mount(DesktopStartPage, ({ room, social }) => {
    social.setDesktopName('ansi-fan');
    room.needsPassword = { address: '192.168.1.20:31337', name: 'Night shift' };
  });
  expect(field('Address').value).toBe('192.168.1.20:31337');
  expect(field('Password')).toBeTruthy();
});

test('StartRoomPage desktop: no public or guests, a password always, and the port kept from last time', async () => {
  const { room } = await mount(StartRoomPage, ({ room, social }) => {
    social.setDesktopName('ansi-fan');
    localStorage.setItem('phosphor-desktop-port', '4000');
    room.$reset();   // a new draft, as after the last room
  });
  expect(host.textContent).not.toContain('Who can join');
  expect(host.textContent).not.toContain('Allow guests');
  expect(host.textContent).not.toContain('Lobby card');
  expect(field('Password')).toBeTruthy();
  expect(field('Port').value).toBe('4000');

  const started = vi.spyOn(room, 'startRoom').mockResolvedValue(false);
  await type(field('Room name'), 'Night shift');
  await type(field('Port'), '4100');
  host.querySelector('form').requestSubmit();
  expect(started).toHaveBeenCalledWith(expect.objectContaining({ name: 'Night shift', port: 4100 }));
});

test('a new host form starts at the port kept, or 31337', async () => {
  await createTestApp();
  localStorage.setItem('phosphor-desktop-port', '4000');
  useRoomStore().$reset();
  expect(useRoomStore().startDraft.port).toBe(4000);
  localStorage.removeItem('phosphor-desktop-port');
  useRoomStore().$reset();
  expect(useRoomStore().startDraft.port).toBe(31337);
});

test('StartRoomPage desktop: Go live needs a name', async () => {
  await mount(StartRoomPage);
  expect(host.textContent).toContain('Pick a name others will see first.');
  expect(button('Go live').disabled).toBe(true);
});

test('HostRoomPage desktop lists addresses with copy buttons and the three notes', async () => {
  await mount(HostRoomPage, hosting({ addresses: ['192.168.1.20:31337', '100.101.2.3:31337', '100.128.0.1:31337'], hasPassword: true }));
  const rows = [...host.querySelectorAll('ul.addresses li')];
  expect(rows.map((li) => li.querySelector('.address').textContent)).toEqual(['192.168.1.20:31337', '100.101.2.3:31337', '100.128.0.1:31337']);
  expect(rows.map((li) => !!li.querySelector('.tag')?.textContent.includes('Tailscale'))).toEqual([false, true, false]);   // 100.64.0.0/10 only

  const copied = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  button('Copy', rows[1]).click();
  await vi.waitFor(() => expect(button('Copied', rows[1])).toBeTruthy());
  expect(copied).toHaveBeenCalledWith('100.101.2.3:31337');

  expect(host.textContent).toContain('Anyone who can reach this address can ask to join.');
  expect(host.textContent).toContain('Over the internet, forward port 31337 on your router.');
  expect(host.textContent).toContain('The connection isn\'t encrypted.');
  expect(host.textContent).not.toContain('Only this computer can join');
  for (const words of ['Allow guests', 'Listed in the lobby', 'Only with the link', 'Send the link', 'Copy link']) expect(host.textContent).not.toContain(words);
  expect(host.textContent).toContain('Password set');
});

test('HostRoomPage desktop: no addresses shows the loopback note', async () => {
  await mount(HostRoomPage, hosting({ addresses: [], port: 31338 }));
  expect([...host.querySelectorAll('ul.addresses .address')].map((el) => el.textContent)).toEqual(['127.0.0.1:31338']);
  expect(host.textContent).toContain('Only this computer can join. Connect to a network to share an address.');
});

test('an ask shows Let in and Turn away, which call letIn and turnAway', async () => {
  const { room } = await mount(HostRoomPage, hosting({ asks: [{ ask: 'a1', sub: 'wren-sub', name: 'wren' }, { ask: 'a2', sub: 'owl-sub', name: 'owl' }] }));
  const letIn = vi.spyOn(room, 'letIn').mockImplementation(() => {}), turnAway = vi.spyOn(room, 'turnAway').mockImplementation(() => {});
  const asks = [...host.querySelectorAll('.asks li')];
  expect(asks.map((li) => li.querySelector('p').textContent)).toEqual(['wren wants to join', 'owl wants to join']);
  button('Let in', asks[0]).click();
  button('Turn away', asks[1]).click();
  expect(letIn).toHaveBeenCalledWith('a1');
  expect(turnAway).toHaveBeenCalledWith('a2');
});

test('the host\'s chat panel shows the asks too', async () => {
  await mount(ChatPanel, ({ room, social }) => {
    social.claims = claims();
    hosting({ asks: [{ ask: 'a1', sub: 'wren-sub', name: 'wren' }] })({ room });
  });
  const ask = host.querySelector('.asks li');
  expect(ask.textContent).toContain('wren wants to join');
  expect([!!button('Let in', ask), !!button('Turn away', ask)]).toEqual([true, true]);
});

test('RoomPeople desktop has no Block, and Make host only for canBeHost', async () => {
  const watcher = (sub) => ({ peer: `p_${sub}`, sub, name: sub, guest: false, tracking: true, connected: true });
  await mount(RoomPeople, ({ room, drawing }) => {
    hosting({ peopleOpen: true, watchers: [watcher('ann'), watcher('bob')], hostable: { ann: ['192.168.1.30:31337'] } })({ room });
    drawing.artists = ['ann', 'bob'];
  });
  const menu = async (n) => {
    const row = host.querySelectorAll('li')[n];
    row.querySelector('.dropdown-trigger').click();
    await nextTick();
    return [...row.querySelectorAll('.dropdown-content button')].map((b) => b.textContent.trim());
  };
  const ann = await menu(0);
  expect(ann).toContain('Make host');
  expect(ann.some((words) => words.startsWith('Block'))).toBe(false);
  expect(ann.some((words) => words.startsWith('Report'))).toBe(false);
  expect(await menu(1)).not.toContain('Make host');
});

test('ChatPanel desktop: no Report and no Block on someone else\'s message', async () => {
  const { room } = await mount(ChatPanel, ({ room, social }) => {
    social.claims = claims();
    Object.assign(room, {
      role: 'watch', id: 'abcdefghij', status: 'live', room: { name: 'Night shift', welcome: '', host: 'cy', hostSub: 'cy-sub' },
      chat: [{ id: '0000000000000001', ts: 1_700_000_000_000, text: 'hi', sub: 'cy-sub', name: 'cy', host: true, mine: false, deleted: false }],
    });
  });
  expect([room.canReport, room.canReportRoom]).toEqual([false, false]);
  expect(host.querySelector('button.report, button.block, button.report-room')).toBe(null);
  expect(host.textContent).toContain('hi');
});

test('the chat foot has no account menu on desktop', async () => {
  await mount(ChatPanel, ({ room, social }) => {
    social.claims = claims();
    hosting()({ room });
  });
  expect(host.querySelector('footer .account-menu')).toBe(null);
  expect(button('Edit account')).toBe(undefined);
  expect(button('Sign out')).toBe(undefined);
  expect(host.querySelector('footer textarea')).toBeTruthy();
});

test('UserName adds the fingerprint only when two subs share the name', async () => {
  const { room } = await mount({
    render: () => [['wren', 'A1b2c3'], ['wren', 'Q9r8s7'], ['cy', 'cy-sub'], ['wren', undefined]].map(([name, sub]) => h(UserName, { name, sub })),
  }, ({ room, social }) => {
    social.claims = claims();
    hosting({ watchers: [{ peer: 'p1', sub: 'A1b2c3', name: 'wren', guest: false, tracking: true, connected: true }, { peer: 'p2', sub: 'cy-sub', name: 'cy', guest: false, tracking: true, connected: true }] })({ room });
  });
  const names = () => [...host.querySelectorAll(':scope > span')].map((el) => el.textContent);
  expect(names()).toEqual(['wren', 'wren', 'cy', 'wren']);   // one wren here so far
  room.chat = [{ id: '0000000000000001', ts: 0, text: 'hi', sub: 'Q9r8s7', name: 'wren', host: false, mine: false, deleted: false }];
  await nextTick();
  expect(names()).toEqual(['wren #A1b2', 'wren #Q9r8', 'cy', 'wren']);   // a name with no sub can't say which
});

test('WatchRoomPage says it waits to be let in until joined, then waits for the host as the web does', async () => {
  const { room } = await mount(WatchRoomPage, ({ room }) => Object.assign(room, { role: 'watch', id: 'abcdefghij', status: 'asked', room: { name: '', welcome: '' } }));
  expect(host.querySelector('h2').textContent).toBe('Waiting for the host to let you in.');
  room.status = 'waiting';   // joined: the host's art is on its way
  await nextTick();
  expect(host.querySelector('h2').textContent).toBe('Waiting for the host…');
});

test('a join asking under the name of someone here shows the start of its sub', async () => {
  await mount(JoinAsks, (ctx) => {
    ctx.social.claims = claims();
    hosting({
      watchers: [{ peer: 'p1', sub: 'B0b1sub', name: 'bob', guest: false, tracking: true, connected: true }],
      asks: [{ ask: 'a_1', sub: 'X9y8sub', name: 'bob' }, { ask: 'a_2', sub: 'cy-sub', name: 'cy' }],
    })(ctx);
  });
  expect([...host.querySelectorAll('li p')].map((p) => p.textContent.trim())).toEqual(['bob #X9y8 wants to join', 'cy wants to join']);
});

test('SocialDialogs desktop: no question, no account pages, no room link; Start a room\'s page shows', async () => {
  const { social } = await mount(SocialDialogs, async ({ social }) => {
    localStorage.clear();   // no consent kept: the desktop doesn't ask
    social.consentVersion = 0;
    await social.boot();
  });
  const dialog = () => document.querySelector('[role=dialog]');
  for (const page of ['sign-in', 'create', 'account', 'onboarding']) {
    social.page = page;
    await nextTick();
    expect(dialog()).toBe(null);
  }
  social.page = 'lobby';
  social.roomInvite = 'abcdefghij';
  await nextTick();
  expect(dialog()).toBe(null);
  social.roomInvite = null;
  social.page = 'start-room';
  await nextTick();
  expect(dialog().textContent).toContain('Set up your room');
});

test('LegalDialog desktop: the app\'s privacy note in place of the hosted service\'s policy; the Terms stay', async () => {
  await mount(LegalDialog, () => {}, { page: 'privacy' });
  const body = () => document.querySelector('.legal-body').textContent;
  expect(body()).toContain('This app sends nothing to Phosphor. In a room, the people you connect with see your IP address.');
  expect(body()).not.toContain('phosphor.work');
  app.unmount();
  app = createApp({ render: () => h(LegalDialog, { page: 'terms' }) }).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  expect(document.querySelector('.legal-body h1').textContent).toBe('Terms');
});
