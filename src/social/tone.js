// The little tone for someone else's chat message (RoomStore.chime decides when), made with Web Audio, so no
// file. A browser plays nothing until the page has been clicked or typed on: then, and with no Web Audio, it's
// silent, with no error. The desktop app may play from the start.
const DESKTOP = import.meta.env.VITE_DESKTOP === '1';

export const TONE_GAP_MS = 2000;   // one tone at most in this long, so a burst of messages is one tone

// Focus inside the chat panel, in a window that's in front: you're in the chat, so it stays quiet.
export const chatFocused = () => document.hasFocus() && !document.hidden && !!document.activeElement?.closest('aside.chat');

let context = null;

// An object, so a test can stub play.
export const tone = {
  play() {
    if (!DESKTOP && navigator.userActivation?.hasBeenActive === false) return;   // it would be refused
    try {
      context ??= new AudioContext();
      if (context.state === 'suspended') context.resume().catch(() => {});
      const now = context.currentTime;
      for (const [hz, at, peak] of [[880, 0, 0.05], [1320, 0.09, 0.035]]) {   // two soft notes, up a fifth
        const note = context.createOscillator(), gain = context.createGain();
        note.frequency.value = hz;
        gain.gain.setValueAtTime(0.0001, now + at);
        gain.gain.exponentialRampToValueAtTime(peak, now + at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.3);
        note.connect(gain).connect(context.destination);
        note.start(now + at);
        note.stop(now + at + 0.3);
      }
    } catch { /* no Web Audio: no tone */ }
  },
};
