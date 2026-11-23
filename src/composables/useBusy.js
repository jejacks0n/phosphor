import { ref } from 'vue';

// What's being opened or saved, for BusyNote. The note goes in as the work starts and fades in only past half a second: the
// delay is CSS's (BusyNote), so the compositor shows it on time while the page is too busy to run a timer. Work inside work (an
// art file read, then opened) keeps the first note.
export const busyMessage = ref(null);
const HIDDEN_TAB_MS = 100; // a hidden tab draws no frames

// After the next frame is drawn (the note in it, still clear), or a moment in a hidden tab. A message, not a timer, is the
// step past the frame, so tests with fake timers still get there.
const painted = () => new Promise((resolve) => {
  const go = () => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(null);
  };
  requestAnimationFrame(go);
  setTimeout(go, HIDDEN_TAB_MS);
});

let endedAt = -Infinity; // when the last busy work ended (performance.now(), the clock events are stamped by)

export async function busyWhile(message, work) {
  if (busyMessage.value) return work();
  busyMessage.value = message;
  try {
    await painted();
    return await work();
  } finally {
    busyMessage.value = null;
    endedAt = performance.now();
  }
}

// Whether a press came while busy work was up: now, or made while it ran and only dispatched after (the page can't
// take input while a fill runs, so a click then waits, and comes once the note's gone). Such a press starts nothing.
export const pressedWhileBusy = (event) => !!busyMessage.value || (event?.timeStamp ?? Infinity) <= endedAt;
