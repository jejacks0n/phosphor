import { describe, it, expect, vi, afterEach } from 'vitest';
import { openSocketPeer } from '../../src/social/socketPeer.js';

class FakeSocket {
  static all = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.bufferedAmount = 0;
    this.sent = [];
    FakeSocket.all.push(this);
  }
  open() { this.readyState = 1; this.onopen?.(); }
  send(d) { this.sent.push(d); }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(); }
}

const make = (over = {}) => {
  FakeSocket.all = [];
  const spy = { onOpen: vi.fn(), onClose: vi.fn(), sendSignal: vi.fn() };
  const config = { channelUrl: vi.fn((peer) => `ws://h/channel?peer=${peer ?? 'me'}`) };
  const conn = openSocketPeer({ peer: 'p1', config, WebSocketImpl: FakeSocket, ...spy, ...over });
  return { conn, config, ...spy, socket: () => FakeSocket.all[0] };
};

afterEach(() => vi.useRealTimers());

describe('openSocketPeer', () => {
  it('host side opens its channel url for the peer and signals an offer', () => {
    const t = make({ initiator: true });
    expect(t.config.channelUrl).toHaveBeenCalledWith('p1');
    expect(t.socket().url).toBe('ws://h/channel?peer=p1');
    expect(t.socket().binaryType).toBe('arraybuffer');
    expect(t.sendSignal).not.toHaveBeenCalled();
    t.socket().open();
    expect(t.sendSignal).toHaveBeenCalledWith({ sdp: { type: 'offer' } });
    expect(t.onOpen).toHaveBeenCalledTimes(1);   // at once: the service holds frames until the guest arrives
  });

  it('guest side opens on the offer, not before', () => {
    const t = make({ initiator: false });
    t.conn.signal({ candidate: {} });
    t.conn.signal({ sdp: { type: 'answer' } });
    expect(FakeSocket.all).toHaveLength(0);
    t.conn.signal({ sdp: { type: 'offer' } });
    t.conn.signal({ sdp: { type: 'offer' } });
    expect(FakeSocket.all).toHaveLength(1);
    expect(t.config.channelUrl).toHaveBeenCalledWith();
    expect(t.onOpen).not.toHaveBeenCalled();
    t.socket().open();
    expect(t.onOpen).toHaveBeenCalledTimes(1);
    expect(t.sendSignal).not.toHaveBeenCalled();
  });

  it('onClose failed when it does not open in time', () => {
    vi.useFakeTimers();
    const t = make({ initiator: true, connectWithinMs: 1000 });
    vi.advanceTimersByTime(1000);
    expect(t.onClose).toHaveBeenCalledExactlyOnceWith({ failed: true });
    expect(t.socket().readyState).toBe(3);
  });

  it('onClose once, whether the socket closes or close() is called', () => {
    const t = make({ initiator: true });
    t.socket().open();
    t.socket().close();
    t.conn.close();
    expect(t.onClose).toHaveBeenCalledExactlyOnceWith({ failed: false });
    const u = make({ initiator: true });
    u.socket().open();
    u.conn.close();
    u.socket().close();
    expect(u.onClose).toHaveBeenCalledTimes(1);
  });

  describe('the channel it hands over', () => {
    it('reads readyState as a data channel does', () => {
      const t = make({ initiator: true });
      const s = t.socket();
      s.open();
      const ch = t.onOpen.mock.calls[0][0];
      expect(ch.readyState).toBe('open');
      s.readyState = 2;
      expect(ch.readyState).toBe('closing');
      s.readyState = 3;
      expect(ch.readyState).toBe('closed');
      s.readyState = 0;
      expect(ch.readyState).toBe('connecting');
    });

    it('sends, reports bufferedAmount and passes messages on', () => {
      const t = make({ initiator: true });
      t.socket().open();
      const ch = t.onOpen.mock.calls[0][0];
      ch.send('x');
      expect(t.socket().sent).toEqual(['x']);
      t.socket().bufferedAmount = 5;
      expect(ch.bufferedAmount).toBe(5);
      const got = vi.fn();
      ch.onmessage = got;
      t.socket().onmessage({ data: 'y' });
      expect(got).toHaveBeenCalledWith({ data: 'y' });
      ch.close();
      expect(t.socket().readyState).toBe(3);
    });

    it('fires onbufferedamountlow for a drain between two polls, after a read saw it backed up', () => {
      vi.useFakeTimers();
      const t = make({ initiator: true });
      t.socket().open();
      const ch = t.onOpen.mock.calls[0][0];
      const low = vi.fn();
      ch.bufferedAmountLowThreshold = 100;
      ch.onbufferedamountlow = low;
      t.socket().bufferedAmount = 500;
      expect(ch.bufferedAmount).toBe(500);
      t.socket().bufferedAmount = 0;   // drained before the poll looked
      vi.advanceTimersByTime(20);
      expect(low).toHaveBeenCalledTimes(1);
    });

    it('fires onbufferedamountlow when the buffer drains to its threshold', () => {
      vi.useFakeTimers();
      const t = make({ initiator: true });
      t.socket().open();
      const ch = t.onOpen.mock.calls[0][0];
      const low = vi.fn();
      ch.bufferedAmountLowThreshold = 100;
      ch.onbufferedamountlow = low;
      vi.advanceTimersByTime(100);
      expect(low).not.toHaveBeenCalled();   // never above it
      t.socket().bufferedAmount = 500;
      vi.advanceTimersByTime(100);
      expect(low).not.toHaveBeenCalled();
      t.socket().bufferedAmount = 100;
      vi.advanceTimersByTime(20);
      expect(low).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(100);
      expect(low).toHaveBeenCalledTimes(1);
      t.conn.close();
      t.socket().bufferedAmount = 500;
      vi.advanceTimersByTime(100);
      t.socket().bufferedAmount = 0;
      vi.advanceTimersByTime(100);
      expect(low).toHaveBeenCalledTimes(1);   // the polling stopped
    });
  });
});
