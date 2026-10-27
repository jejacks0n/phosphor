import { rtcConfig } from './config.js';

const MOST_HELD = 50;   // a stranger's candidates kept before its description: more is only memory

// One WebRTC connection and its data channel, a room's host to one watcher. The host (the initiator)
// makes the channel "room" and the offer; the watcher takes the channel from ondatachannel. The
// signals (the descriptions and ICE candidates) travel by the caller: sendSignal sends ours, signal()
// takes theirs. onOpen fires once with the open channel; onClose fires once, for the channel closing,
// the connection failing, no open channel within connectWithinMs, or close(). failed means the
// channel never opened.
export function openPeer({ initiator, sendSignal, onOpen, onClose, config = rtcConfig(), connectWithinMs = 20_000 }) {
  const pc = new RTCPeerConnection(config);
  let opened = false;
  let done = false;
  let remoteSet = false;
  let held = [];   // candidates that came before the remote description, MOST_HELD at most
  let channelTaken = initiator;   // the host makes its channel; the watcher takes the first one called room

  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    pc.close();
    onClose({ failed: !opened });
  };
  const timer = setTimeout(finish, connectWithinMs);

  const take = (channel) => {
    channel.binaryType = 'arraybuffer';
    channel.onclose = finish;
    const opening = () => { opened = true; clearTimeout(timer); onOpen(channel); };
    if (channel.readyState === 'open') opening(); else channel.onopen = opening;
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
    async signal(data) {
      if (done) return;
      try {
        if (data.sdp) {
          await pc.setRemoteDescription(data.sdp);
          remoteSet = true;
          for (const candidate of held.splice(0)) await addCandidate(candidate);
          if (data.sdp.type === 'offer') await sendDescription();
        } else if (data.candidate) {
          if (remoteSet) await addCandidate(data.candidate);
          else if (held.length < MOST_HELD) held.push(data.candidate);
        }
      } catch {
        finish();
      }
    },
    close: finish,
  };
}
