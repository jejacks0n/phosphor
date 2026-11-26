import { rtcConfig } from './config.js';
import { openSocketPeer } from './socketPeer.js';

const MOST_CANDIDATES = 50;   // a stranger's candidates taken in all (held or applied): more is only work
const STUCK_MS = 1000;   // a channel that came open, back to connecting this long with no open event: asked again
const LOOK_EVERY_MS = 100;

// One WebRTC connection and its data channel, a room's host to one watcher. The host (the initiator)
// makes the channel "room" and the offer; the watcher takes the channel from ondatachannel. The
// signals (the descriptions and ICE candidates) travel by the caller: sendSignal sends ours, signal()
// takes theirs. onOpen fires once with the open channel; onClose fires once, for the channel closing,
// the connection failing, no open channel within connectWithinMs, or close(). failed means the
// channel never opened. A channel that came open and then went back to connecting for good sends the other side
// { again: true } once (see take), which a host answers with a new connection (hosting.js).
export function openRtcPeer({ initiator, sendSignal, onOpen, onClose, config = rtcConfig(), connectWithinMs = 20_000 }) {
  const pc = new RTCPeerConnection(config);
  let opened = false;
  let done = false;
  let remoteSet = false;
  let described = false;   // a remote description has come (it's set once it's remoteSet)
  let held = [];   // candidates that came before the remote description
  let candidates = 0;   // taken so far, MOST_CANDIDATES at most
  let channelTaken = initiator;   // the host makes its channel; the watcher takes the first one called room

  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    pc.close();
    onClose({ failed: !opened });
  };
  const timer = setTimeout(finish, connectWithinMs);

  // A channel the other side opened can be open already when it's taken: Chromium calls it open before its connection
  // is, and attaches what follows the connection's state a task later, which can post a state read just before the
  // real open landed, after it: the channel reads connecting from then on, with no event, and won't send. Only such a
  // channel is open when taken, so it's looked at for connectWithinMs: connecting for STUCK_MS with no open event after
  // asks the other side, once, for a new connection. ponytail: a poll; the stale state comes within a task or two of
  // the channel's making, so the long watch only costs looks.
  const take = (channel) => {
    channel.binaryType = 'arraybuffer';
    channel.onclose = finish;
    const opening = () => { opened = true; clearTimeout(timer); onOpen(channel); };
    if (channel.readyState !== 'open') {
      channel.onopen = opening;
      return;
    }
    opening();
    let since = null;
    const until = Date.now() + connectWithinMs;
    const look = setInterval(() => {
      if (done || Date.now() > until) return clearInterval(look);
      if (channel.readyState !== 'connecting') return void (since = null);
      since ??= Date.now();
      if (Date.now() - since < STUCK_MS) return;
      clearInterval(look);
      send({ again: true });
    }, LOOK_EVERY_MS);
  };
  // A signal that can't be sent just leaves the connection to time out, which says so plainly.
  const send = (data) => {
    try { Promise.resolve(sendSignal(data)).catch(() => {}); } catch { /* the same */ }
  };
  const addCandidate = (candidate) => pc.addIceCandidate(candidate).catch(() => {});   // one bad candidate isn't the end

  pc.onicecandidate = (e) => { if (e.candidate && !done) send({ candidate: e.candidate.toJSON() }); };
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') finish(); };
  pc.ondatachannel = (e) => {
    if (channelTaken || e.channel.label !== 'room') return e.channel.close();   // one channel only, whoever opens another
    channelTaken = true;
    take(e.channel);
  };

  const sendDescription = async () => {
    await pc.setLocalDescription();
    if (!done) send({ sdp: pc.localDescription.toJSON() });
  };

  if (initiator) {
    take(pc.createDataChannel('room'));
    sendDescription().catch(finish);
  }

  return {
    // One description, and MOST_CANDIDATES; once the channel is open, nothing more (a connection is made once).
    async signal(data) {
      if (done || opened) return;
      try {
        if (data.sdp) {
          if (described) return;
          described = true;
          await pc.setRemoteDescription(data.sdp);
          remoteSet = true;
          for (const candidate of held.splice(0)) await addCandidate(candidate);
          if (data.sdp.type === 'offer') await sendDescription();
        } else if (data.candidate && candidates < MOST_CANDIDATES) {
          candidates++;
          if (remoteSet) await addCandidate(data.candidate);
          else held.push(data.candidate);
        }
      } catch {
        finish();
      }
    },
    close: finish,
  };
}

// The desktop build's rooms connect over the room service's sockets, not WebRTC.
export const openPeer = import.meta.env.VITE_DESKTOP === '1' ? openSocketPeer : openRtcPeer;
