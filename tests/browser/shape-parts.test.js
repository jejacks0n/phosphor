// A key frame keeps only the parts of a shape changed on it: the rest comes from the key frames before, and follows
// them when they change; each part fades between the key frames that set it.
import { test, expect } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';
import { rectShape, translation, transformed, withShape } from '@/document/shapes.js';

async function animated() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  return { project, workspace };
}
const GRADIENT = { type: 'linear', stops: [[0, '#ff0000'], [1, '#0000ff']], m: [1, 0, 0, 1, 0, 0] };
const moveBy = (project, key, dx, dy) => project.updateShapes([[key, transformed(project.shapes.get(key), translation(dx, dy))]]);
const restyle = (project, key, fields) => project.updateShapes([[key, withShape(project.shapes.get(key), fields)]]);
const shown = (project, key, i) => project.resolvedOf(i).get(key)?.cell;
const looks = (project, key) => project.frames.map((_, i) => JSON.stringify(shown(project, key, i)));
const partsOf = (project, at, key) => {
  project.noteFrame();
  const set = project.frames[at].parts?.get(key);
  return set ? [...set].sort() : 'all';
};

// A red ball on frame 0, moved down 12 on frames 6 and 12 (Blank frames between); easings on 0 and 6 if given; frame 0 shows.
function ball(project, easings = []) {
  const key = project.addShape(rectShape(2, 2, 6, 6, { fill: '#ff0000', stroke: '#000000' }));
  for (let at = 1; at <= 12; at++) {
    project.addFrame('blank');
    if (at % 6 === 0) moveBy(project, key, 0, 12);
  }
  easings.forEach((easing, j) => {
    project.showFrame(j * 6);
    project.setTween([key], easing);
  });
  project.showFrame(0);
  return key;
}

for (const easings of [['easeIn', 'easeOut'], []]) {
  test(`a gradient given on the first key frame shows on every frame, with the moves made on later key frames kept (${easings.length ? 'tweened' : 'no tweens'})`, async () => {
    const { project } = await animated();
    const key = ball(project, easings);
    restyle(project, key, { fill: GRADIENT });
    const fill = project.shapes.get(key).fill;
    project.noteFrame();
    for (let i = 0; i < project.frames.length; i++) expect(shown(project, key, i).fill, `frame ${i}`).toEqual(fill);
    expect(shown(project, key, 6).m[5]).toBe(12);
    expect(shown(project, key, 12).m[5]).toBe(24);
  });
}

test('a key frame sets only what was changed on it, and what it left alone follows frame 1', async () => {
  const { project } = await animated();
  const key = ball(project);
  expect(partsOf(project, 6, key)).toEqual(['transform']);
  project.showFrame(12);
  restyle(project, key, { width: 3 });
  expect(partsOf(project, 12, key)).toEqual(['transform', 'width']);
  project.showFrame(0);
  restyle(project, key, { stroke: '#00ff00', cap: 'butt' });
  project.noteFrame();
  expect(shown(project, key, 12).stroke).toBe('#00ff00');
  expect(shown(project, key, 12).cap).toBe('butt');
  expect(shown(project, key, 12).width).toBe(3);
  expect(shown(project, key, 6).width).toBe(1);
});

test('editing another part of a key frame keeps what it set', async () => {
  const { project } = await animated();
  const key = ball(project);
  project.showFrame(12);
  restyle(project, key, { fill: '#0000ff' });
  moveBy(project, key, 1, 0);
  expect(partsOf(project, 12, key)).toEqual(['fill', 'transform']);
});

test('changing a part back to what the frame would have without it gives it back to the frames before', async () => {
  const { project } = await animated();
  const key = ball(project);
  project.showFrame(12);
  restyle(project, key, { fill: '#0000ff' });
  restyle(project, key, { fill: '#ff0000' });
  expect(partsOf(project, 12, key)).toEqual(['transform']);
  project.showFrame(0);
  restyle(project, key, { fill: '#00ff00' });
  project.noteFrame();
  expect(shown(project, key, 12).fill).toBe('#00ff00');
});

test('splitting a tween sets only what was changed, and the frame shows what it now works out to', async () => {
  const { project } = await animated();
  const key = ball(project, ['easeIn', 'easeIn']);
  project.showFrame(12);
  restyle(project, key, { fill: '#0000ff' });
  project.showFrame(3);
  moveBy(project, key, 1, 0);
  expect(partsOf(project, 3, key)).toEqual(['transform']);
  expect(project.frames[3].tweens.get(key)).toBe('easeIn');
  expect(project.frames[0].tweens.get(key)).toBe('easeIn');
  expect(project.shapes.get(key)).toEqual(shown(project, key, 3));
});

test('visiting and scrubbing set nothing', async () => {
  const { project } = await animated();
  const key = ball(project, ['easeIn', 'easeOut']);
  project.noteFrame();
  const before = project.frames.map((frame) => [frame.changes, JSON.stringify([...(frame.parts ?? [])].map(([k, set]) => [k, [...set]]))]);
  for (let i = 0; i < project.frames.length; i++) project.showFrame(i);
  project.showFrame(0);
  project.noteFrame();
  project.frames.forEach((frame, i) => {
    expect(frame.changes.has(key), `frame ${i}`).toBe(before[i][0].has(key));
    expect(JSON.stringify([...(frame.parts ?? [])].map(([k, set]) => [k, [...set]])), `frame ${i}`).toBe(before[i][1]);
  });
});

test('Bake keeps every frame looking as it did', async () => {
  const { project } = await animated();
  const key = ball(project, ['easeIn', 'easeOut']);
  restyle(project, key, { fill: GRADIENT });
  project.noteFrame();
  const was = looks(project, key);
  await project.bake();
  expect(looks(project, key)).toEqual(was);
});

test('deleting a key frame keeps the movie looking the same', async () => {
  const { project } = await animated();
  const key = ball(project);
  project.showFrame(7);
  restyle(project, key, { fill: '#0000ff' });
  project.noteFrame();
  const was = looks(project, key);
  project.showFrame(6);
  project.deleteFrame();
  expect(looks(project, key)).toEqual([...was.slice(0, 6), ...was.slice(7)]);
  expect(partsOf(project, 6, key)).toEqual(['fill', 'transform']);
});

test('a moved key frame keeps what it set, and takes the rest from where it lands', async () => {
  const { project } = await animated();
  const key = ball(project);
  project.showFrame(12);
  restyle(project, key, { fill: '#0000ff' });
  project.moveFrame(6, 12);
  project.noteFrame();
  expect(shown(project, key, 12).m[5]).toBe(12);
  expect(shown(project, key, 12).fill).toBe('#0000ff');
});

test("saving leaves every key frame's shape as it shows", async () => {
  const { project } = await animated();
  const key = ball(project);
  restyle(project, key, { fill: '#00ff00' });
  await project.projectParts();
  expect(project.frames[12].changes.get(key).cell.fill).toBe('#00ff00');
});
