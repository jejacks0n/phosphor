// An artist's side of sharing: slices held and sent, what's asked of the host, what's heard, and the project.
import { parseKey } from '@/document/editCells.js';
import { REFUSED_WORDS } from '@/social/messages.js';
import { MAX_CELLS } from '@/lib/Cells.js';
import { cellsFitAnyGrid } from '@/social/wire.js';
import { toast } from '@/composables/useToast.js';
import { settingsFromStranger } from '@/store/settings.js';
import { ASK_AGAIN_MS, HELD_FLOAT_MS, askForProject, flushSoon, readsAsHeard, stopAsking } from '@/store/project/sharing.js';

export const sharingArtistActions = {
  sendParts(stroke, parts) {
    for (const part of parts) this._sharing.send({ t: 'change', stroke, ...part });
  },

  // Each move of a float starts this over. Its own sharing, so it can't land on a later one.
  sendHeldSoon() {
    const sharing = this._sharing;
    clearTimeout(sharing.heldTimer);
    sharing.heldTimer = setTimeout(() => { if (this._sharing === sharing) this.sendHeld(); }, HELD_FLOAT_MS);
  },

  // A float left where it is goes out. One with nothing to send stays: its run can still go on.
  sendHeld() {
    const held = this._sharing?.held;
    if (!held?.parts.length) return;
    this._sharing.held = null;
    this.sendParts(held.stroke, held.parts);
  },

  // An artist's undo or redo goes to the host, except of a float's change that never left: that's between
  // this browser and Pending, for undo and for a redo of it.
  askForStroke(kind, stroke) {
    const sharing = this._sharing, { held, takenBack } = sharing;
    if (kind === 'undo' && held?.stroke === stroke) {
      sharing.held = null;
      sharing.takenBack = held;
      this.throughPending((pending) => held.parts.forEach(() => pending.retract()));
    } else if (kind === 'redo' && takenBack?.stroke === stroke) {
      sharing.takenBack = null;
      this.sendHeld();
      for (const part of takenBack.parts) {
        sharing.pending.add(stroke, part);
        sharing.screen.take();
        this.applyChange(part);
      }
      this.sendParts(stroke, takenBack.parts);
    } else {
      sharing.strokesAsked.push({ kind, stroke });
      sharing.send({ t: kind, stroke });
    }
  },

  // An undo or redo that can't be done: its step goes, here as anywhere it still is, and that's said. An older
  // one is still there for the next press. A host's own (ownStroke) asks no one; for an artist, a host's word on
  // anything not asked is nothing.
  strokeRefused(kind, stroke) {
    if (!this.forgetAsked(stroke, kind) && this._sharing?.role !== 'host') return;
    this.history.retain((entry) => entry.stroke !== stroke);
    this.historyVersion = this.history.version;
    toast(REFUSED_WORDS[kind]);
  },

  // Whether it had been asked. A number doesn't say which of the two it answers, so with no kind it's the oldest,
  // as the host answers them in order.
  forgetAsked(stroke, kind = null) {
    const asked = this._sharing?.strokesAsked, at = asked?.findIndex((ask) => ask.stroke === stroke && (!kind || ask.kind === kind)) ?? -1;
    if (at >= 0) asked.splice(at, 1);
    return at >= 0;
  },

  // fn(pending), then one write and one refresh for what it wrote, however many positions that was. For
  // what's in Pending that writes: heard, retract, and in time reapply and dropAll.
  throughPending(fn) {
    const { pending, screen } = this._sharing;
    const result = fn(pending);
    this.applyChange(screen.take());
    return result;
  },

  // An artist's message from the host, for the next frame. Off this document (a host is a stranger) it's
  // ignored; the check notices what that costs.
  hearDrawing(message) {
    const sharing = this._sharing;
    if (!sharing?.pending || !this.paintLayer) return;
    if (message.t !== 'check' && !readsAsHeard(this, message)) return;
    sharing.heard.push(message);
    flushSoon(this, sharing);
  },

  // A check heard in its place among the numbers, so what came before it has landed and Pending's sum is the
  // agreed one as of what's been heard. Only at the same number does that say anything, whatever's waiting
  // behind it. A mismatch asks for the project once, until one lands (or the connection's new, or a long wait
  // passes). The sum follows numbers, so it only sees drift at a position a number has since touched, or a
  // number that never landed once another follows: anything else stays unseen, by design, as nothing rescans.
  compareCheck({ n, sum }) {
    const sharing = this._sharing, { pending } = sharing;
    if (sharing.asked || sharing.opening || this._paused || pending.n !== n || pending.sum === sum) return;
    askForProject(sharing);
  },

  // A host is back and has said all it numbered of mine (what it had, in a project or a tail). What's still
  // unechoed never reached it, so it goes now, oldest first, on this connection. A float still held is in
  // Pending but never left: it goes when it's placed (sendHeld), as it would have. An undo or redo with no number
  // by now went with the last connection, and isn't asked again: the person has gone on since. Those are refused.
  resendPending() {
    const sharing = this._sharing;
    if (!sharing?.pending) return;
    stopAsking(sharing);
    const changes = sharing.pending.resend(), held = sharing.held?.parts.length ?? 0;
    for (const { stroke, cells, runs } of held ? changes.slice(0, -held) : changes) sharing.send({ t: 'change', stroke, cells, runs });
    for (const { kind, stroke } of [...sharing.strokesAsked]) this.strokeRefused(kind, stroke);
  },

  // A hello on a new connection, with drawing paused until it's answered: a host whose project is bad, or who says
  // nothing, doesn't leave it paused for good. No check will come to prompt this, as none is looked at while paused.
  waitForAnswer() {
    const sharing = this._sharing;
    if (!sharing?.pending) return;
    clearTimeout(sharing.askAgain);
    sharing.askAgain = setTimeout(() => askForProject(sharing), ASK_AGAIN_MS);
  },

  // Out of the room with what's agreed (commitPending lands what's been heard): what never got a number goes, and
  // the document's left as the host had it.
  dropWaiting() {
    this.commitPending();
    if (this._sharing?.pending?.size) this.throughPending((pending) => pending.dropAll());
  },

  // What's waiting for a number, a box in grid pixels for each stroke, for the screen to mark while paused.
  waitingBoxes() {
    const { pending } = this._sharing ?? {};
    if (!pending) return [];
    const boxes = new Map(), scale = this.paintLayer?.scale ?? 1;
    const grow = (stroke, x0, y0, x1, y1) => {
      const box = boxes.get(stroke);
      boxes.set(stroke, box ? { x0: Math.min(box.x0, x0), y0: Math.min(box.y0, y0), x1: Math.max(box.x1, x1), y1: Math.max(box.y1, y1) } : { x0, y0, x1, y1 });
    };
    for (const { stroke, cells, runs } of pending.waiting) {
      for (const [key] of cells) {
        const { col, row } = parseKey(key);
        grow(stroke, col, row * 2, col + 1, row * 2 + 2);
      }
      for (const [x, y, length] of runs) grow(stroke, x / scale, y / scale, (x + length) / scale, (y + 1) / scale);
    }
    return [...boxes.values()];
  },

  // A new connection to the host: an ask on the last one went with it, and the host counts `took` afresh.
  newConnection() {
    const sharing = this._sharing;
    if (!sharing?.pending) return;
    stopAsking(sharing);
    sharing.pending.newConnection();
  },

  // The project an artist was sent, from a stranger: only what could be a document's, kept past the grid as
  // a host's may be, and false with nothing changed for what isn't. The first is under a new documentId, so
  // what was open stays in the autosave list, and starts the sharing; one after that is the same document.
  // Its sum is what the scan says and what was mine and unnumbered goes back on top (in that order, as reapply
  // reads what's beneath), less what the host had handled by then (took), which it holds or refused. An open
  // stroke has gone out by then: openFromHost commits it, so no baseline moves past what's unsent. Numbers it
  // holds are gone with what was waiting; the room's Watch sees to any later. In the epoch I have, it's the same
  // document brought up to date: History only asks the host by stroke id, and the host still has those strokes,
  // so undo and the selection stay. A new epoch means the positions don't mean what they did, so both go.
  // documentId: what a reload had open as this art, so it's the one document in the autosave list.
  async takeProject(parts, { n, epoch = null, took = 0, filename, send, me, documentId }) {
    const cells = [...parts.editCells], settings = settingsFromStranger(parts.settings);
    if (!settings || cells.length > MAX_CELLS || !cellsFitAnyGrid(cells)) return false;
    const opening = this._sharing;
    if (opening) opening.opening = true; // no check says anything while this opens
    try {
      await this.openFromHost(
        { ...parts, settings, erasedCells: [], migrated: false },
        { filename, documentId: opening ? this.documentId : documentId, sameDocument: !!opening && epoch !== null && opening.epoch === epoch },
      );
    } catch (error) {
      console.warn('The room\'s art couldn\'t be opened.', error);
      if (!this.image) this.stopSharing();
      return false;
    } finally {
      if (opening) opening.opening = false;
    }
    const sharing = this._sharing;
    if (sharing) {
      this.ensureLayer();
      sharing.screen.take();
      const sum = this.editLayerSum();
      this.throughPending((pending) => {
        pending.seedSum(sum);
        pending.dropTaken(took);
        pending.reapply();
      });
    } else {
      this.startSharing({ send, role: 'artist', me });
    }
    stopAsking(this._sharing);
    this._sharing.epoch = epoch;
    this._sharing.pending.n = n;
    return true;
  },
};
