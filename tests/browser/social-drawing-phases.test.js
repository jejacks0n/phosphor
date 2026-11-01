// A host's phases, and that a move outside their table shows. The room here is a stand-in: only what's
// asked of a Host while gathering and handing over.
import { test, expect, vi } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';
import { useDrawingStore } from '@/store/DrawingStore';

const channelsOpen = (subs) => subs.map((sub) => ({ claims: { sub }, drawing: true, peer: sub }));

async function hostWith(subs, handOver = async () => true) {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 10, rows: 10 });
  project.ensureLayer();
  const drawing = useDrawingStore();
  const host = {
    roomId: 'room', gatherWithinMs: 60_000, serverAnswersWithinMs: 60_000,
    hold: vi.fn(), release: vi.fn(), send: vi.fn(() => true), sendAll: vi.fn(), sendCheck: vi.fn(), setArtists: vi.fn(), setArtistViews: vi.fn(),
    open: () => channelsOpen(subs), handOver,
  };
  drawing.hosted(host, { me: () => 'host' });
  drawing.peopleHere(subs.map((sub) => ({ sub, peer: sub, connected: true })));
  return { drawing, host };
}

test('a host gathering can\'t hand over, and one that gathered can', async () => {
  const warn = vi.spyOn(console, 'warn');
  const { drawing, host } = await hostWith(['ann']);
  drawing.resumeHosting({ artists: ['ann'] }, null);
  expect(drawing.paused).toBe(true);
  expect(await drawing.makeHost('ann')).toBe(false);
  drawing.hostCallbacks().onHello({ claims: { sub: 'ann' }, drawing: true }, { has: -1, epoch: null });
  await expect.poll(() => host.release.mock.calls.length).toBe(1);
  expect(drawing.paused).toBe(false);
  const made = drawing.makeHost('ann');
  await expect.poll(() => host.send.mock.calls.some(([msg]) => msg.type === 'hand-over')).toBe(true);
  drawing.becomeArtist();
  expect(await made).toBe(true);
  expect(warn).not.toHaveBeenCalled();
  drawing.close();
});

test('a host handing over can\'t start again until it\'s ended', async () => {
  let said;
  const { drawing, host } = await hostWith(['ann'], () => new Promise((resolve) => { said = resolve; }));
  drawing.artists = ['ann'];
  const made = drawing.makeHost('ann');
  await expect.poll(() => !!said).toBe(true);
  expect(await drawing.makeHost('ann')).toBe(false);
  said(false);
  expect(await made).toBe(false);
  expect(host.release).toHaveBeenCalledOnce();
  expect(drawing.paused).toBe(false);
  drawing.close();
});

test('gathering in the middle of a handover says so', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  let said;
  const { drawing } = await hostWith(['ann'], () => new Promise((resolve) => { said = resolve; }));
  drawing.artists = ['ann'];
  const made = drawing.makeHost('ann');
  await expect.poll(() => !!said).toBe(true);
  drawing.resumeHosting({ artists: ['ann'] }, null);
  expect(warn).toHaveBeenCalledWith('A host going from handing-over to gathering.');
  said(false);
  await made;
  drawing.close();
});
