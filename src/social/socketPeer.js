const STATES = ['connecting', 'open', 'closing', 'closed'];
const POLL_MS = 20;

// What Host and Watch use of an RTCDataChannel, over a WebSocket: readyState as a word, send, bufferedAmount,
// onbufferedamountlow (a socket has no such event, so it's polled), onmessage and close.
function channelOver(socket) {
  let above = false;   // the buffer has been over the threshold since the event last fired
  const poll = setInterval(() => {
    const over = socket.bufferedAmount > channel.bufferedAmountLowThreshold;
    if (over) above = true;
    else if (above) {
      above = false;
      channel.onbufferedamountlow?.();
    }
  }, POLL_MS);
  const channel = {
    bufferedAmountLowThreshold: 0,
    onbufferedamountlow: null,
    get readyState() { return STATES[socket.readyState]; },
    // A read that sees it backed up arms the event, so a drain between two polls isn't missed.
    get bufferedAmount() {
      const n = socket.bufferedAmount;
      if (n > channel.bufferedAmountLowThreshold) above = true;
      return n;
    },
    set onmessage(fn) { socket.onmessage = fn; },
    send: (data) => socket.send(data),
    close: () => socket.close(),
  };
  return { channel, stop: () => clearInterval(poll) };
}

// openPeer's contract over the desktop room service's /channel socket in place of WebRTC: the same
// return, and onOpen and onClose as openPeer has them. The host (initiator) opens its socket at once,
// signals an offer to start the guest's, and calls onOpen without waiting for the guest: the service
// holds what the host sends until the guest's side arrives. The guest opens its socket on the offer.
// failed means the socket never opened within connectWithinMs.
export function openSocketPeer({ initiator, peer, config, sendSignal, onOpen, onClose, connectWithinMs = 20_000, WebSocketImpl = WebSocket }) {
  let socket = null;
  let opened = false;
  let done = false;
  let stop = () => {};

  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    stop();
    try { socket?.close(); } catch { /* already gone */ }
    onClose({ failed: !opened });
  };
  const timer = setTimeout(finish, connectWithinMs);

  const connect = (url) => {
    socket = new WebSocketImpl(url);
    socket.binaryType = 'arraybuffer';
    socket.onclose = socket.onerror = finish;
    socket.onopen = () => {
      if (done) return;
      opened = true;
      clearTimeout(timer);
      if (initiator) {   // open before the guest pairs: the service holds frames, and closes an unpaired side after 20 s (onClose, failed false)
        try { Promise.resolve(sendSignal({ sdp: { type: 'offer' } })).catch(() => {}); } catch { /* the guest times out, which says so */ }
      }
      const made = channelOver(socket);
      stop = made.stop;
      onOpen(made.channel);
    };
  };

  try {
    if (initiator) connect(config.channelUrl(peer));
  } catch {
    queueMicrotask(finish);
  }

  return {
    signal(data) {
      if (initiator || socket || done || data?.sdp?.type !== 'offer') return;
      try { connect(config.channelUrl()); } catch { finish(); }
    },
    close: finish,
  };
}
