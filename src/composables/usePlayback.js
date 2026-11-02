// Playing an animation: frames swap on screen from what's built (FrameBuilder), ticking with the display and
// looping. Nothing here touches editCells or the frame being edited, so autosave stays quiet; pausing lands the
// editor on the frame showing. One at a time: the state is the workspace's.
import { useProjectStore } from '@/store/ProjectStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { frameDuration } from '@/document/frames';

const AHEAD = 8; // frames kept built ahead of the one showing, so a tick rarely waits

let running = null; // { project, workspace, document, frame: the rAF, last, spare, building }

function stop(run) {
  cancelAnimationFrame(run.frame);
  if (running === run) running = null;
  run.workspace.playing = false;
  run.workspace.played = null;
}

// The frames from the one showing on, built one to a display frame.
async function buildAhead(run) {
  if (run.building) return;
  run.building = true;
  try {
    const { project, workspace } = run;
    for (let k = 0; k < AHEAD && running === run; k++) {
      const n = project.frames.length, at = (workspace.playFrame + k) % n;
      if (project.frames[at]?.built) continue;
      const built = await project.builtFrame(at);
      if (running === run && at === workspace.playFrame && built) workspace.played = built; // a slider made it stale
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  } finally {
    run.building = false;
  }
}

function tick(run, now) {
  if (running !== run) return;
  const { project, workspace } = run;
  if (project._document !== run.document || !project.hasFrames || !project.animate) {
    stop(run);
    return;
  }
  run.spare += Math.min(now - run.last, 1000); // a tab left in the background doesn't race to catch up
  run.last = now;
  let at = workspace.playFrame % project.frames.length;
  for (;;) {
    const wait = frameDuration(project.frames[at], project.fps);
    if (run.spare < wait) break;
    const next = (at + 1) % project.frames.length;
    if (!project.frames[next].built) { // it isn't ready: this one stays until it is, and nothing's skipped
      run.spare = wait;
      break;
    }
    run.spare -= wait;
    at = next;
  }
  if (at !== workspace.playFrame) {
    workspace.playFrame = at;
    workspace.played = project.frames[at].built;
  }
  buildAhead(run);
  run.frame = requestAnimationFrame((time) => tick(run, time));
}

export function usePlayback() {
  const project = useProjectStore(), workspace = useWorkspaceStore();

  const play = async () => {
    if (workspace.playing || running || !project.hasFrames) return;
    project.commitPending();
    const document = project._document, at = project.frame;
    const built = await project.builtFrame(at);
    if (!built || workspace.playing || project._document !== document) return;
    workspace.playFrame = at;
    workspace.played = built;
    workspace.playing = true;
    running = { project, workspace, document, frame: null, last: performance.now(), spare: 0, building: false };
    const run = running;
    run.frame = requestAnimationFrame((time) => tick(run, time));
    buildAhead(run);
  };

  const pause = () => {
    if (!workspace.playing) return;
    const at = workspace.playFrame;
    if (running) stop(running);
    else workspace.playing = false;
    workspace.played = null;
    project.showFrame(at);
  };

  return {
    play,
    pause,
    toggle: () => (workspace.playing ? pause() : play()),
    get playing() { return workspace.playing; },
  };
}
