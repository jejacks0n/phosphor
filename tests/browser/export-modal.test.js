import { test, expect, vi, afterEach } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createApp, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import ExportModal from '@/components/ExportModal.vue';

afterEach(() => vi.restoreAllMocks());
// An export waits for a frame to show its note, then draws and packs the picture, on a machine that may be busy with
// other test files: up to 1.7 seconds for a small PNG, measured (png-export.test.js), so its waits get longer than the
// default second.
const PATIENT = { interval: 5, timeout: 10_000 };

// With the test's pinia, a late action of the test before (which makes its own pinia the active one) can't hand the
// modal that test's stores.
function mountModal(pinia = getActivePinia()) {
  const closed = vi.fn();
  const app = createApp(ExportModal, { onClose: closed }).use(i18n).use(pinia);
  app.mount(document.createElement('div'));
  return { closed, unmount: () => app.unmount() };
}

async function drawing() {
  const { project, workspace, pinia } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 6, rows: 4 });
  project.typeAt(1, 0, 'A', { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  return { project, workspace, pinia };
}

test('opens with ANS selected by default on a still drawing', async () => {
  await drawing();
  const { unmount } = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    expect(modal).toBeTruthy();
    const selected = modal.querySelector('.format-btn.selected');
    expect(selected.textContent).toContain('ANS');
    expect(selected.textContent).toContain('.ans');
  } finally {
    unmount();
  }
});

test('clicking another format selects it', async () => {
  await drawing();
  const { unmount } = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    const buttons = [...modal.querySelectorAll('.format-btn:not(:disabled)')];
    const pngBtn = buttons.find((b) => b.textContent.includes('PNG'));
    pngBtn.click();
    await nextTick();
    expect(pngBtn.classList.contains('selected')).toBe(true);
    expect(modal.querySelector('.format-btn.selected').textContent).toContain('PNG');
  } finally {
    unmount();
  }
});

test('Up and Down move between the formats, not on to the animated ones a still drawing can\'t use; the file name keeps its arrows', async () => {
  await drawing();
  const { unmount } = mountModal();
  const press = (key) => !document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  try {
    const modal = document.querySelector('.modal-dialog');
    const formats = [...modal.querySelectorAll('.format-btn:not(:disabled)')];
    formats[0].focus();
    formats.slice(1).forEach((format) => {
      expect(press('ArrowDown')).toBe(true);
      expect(document.activeElement).toBe(format);
    });
    press('ArrowDown'); // the last a still drawing has
    expect(document.activeElement).toBe(formats.at(-1));
    press('ArrowUp');
    expect(document.activeElement).toBe(formats.at(-2));
    expect(modal.querySelector('.format-btn.selected')).toBe(formats[0]); // focus moved; Enter or Space picks

    modal.querySelector('input.filename-input').focus();
    expect(press('ArrowDown')).toBe(false);
  } finally {
    unmount();
  }
});

test('animated formats are disabled on a still drawing', async () => {
  await drawing();
  const { unmount } = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    const disabled = [...modal.querySelectorAll('.format-btn:disabled')];
    expect(disabled.length).toBe(5); // gif, video, ansimation, utf8ansimation, cast
  } finally {
    unmount();
  }
});

test('export button calls exportFile with the right ext and closes', async () => {
  const { project } = await drawing();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const exported = vi.spyOn(project, 'exportFile').mockResolvedValue();
  const { closed, unmount } = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    modal.querySelector('button.primary').click();
    await vi.waitUntil(() => closed.mock.calls.length, PATIENT);
    expect(exported).toHaveBeenCalledWith('ans', expect.objectContaining({ smooth: expect.any(Boolean) }));
  } finally {
    unmount();
  }
});

test('a GIF shows a progress bar of the frames written while it exports, and an ANSI format none', async () => {
  const { project } = await drawing();
  project.animate = true;
  project.addFrame('blank');
  await settle(project);
  let tell, finish;
  vi.spyOn(project, 'exportAnimation').mockImplementation((format, { progress }) => { tell = progress; return new Promise((resolve) => { finish = resolve; }); });
  const { closed, unmount } = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    expect(modal.querySelector('.format-btn.selected').textContent).toContain('GIF');
    expect(modal.querySelector('progress')).toBeNull();
    modal.querySelector('button.primary').click();
    await nextTick();
    expect(modal.querySelector('progress').value).toBe(0);
    tell(0.5);
    await nextTick();
    expect(modal.querySelector('progress').value).toBe(0.5);
    expect(modal.querySelector('progress').getAttribute('aria-label')).toBe('Exporting…');
    finish();
    await vi.waitUntil(() => closed.mock.calls.length, PATIENT);
  } finally {
    unmount();
  }
  vi.spyOn(project, 'exportAnimation').mockResolvedValue();
  const again = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    await pick(modal, 'Cast');
    modal.querySelector('button.primary').click();
    await nextTick();
    expect(modal.querySelector('progress')).toBeNull();
  } finally {
    again.unmount();
  }
});

test('Video is offered where the browser encodes video, with a progress bar as it exports; elsewhere it isn\'t', async () => {
  const { project } = await drawing();
  project.animate = true;
  project.addFrame('blank');
  await settle(project);
  let tell, finish;
  const exported = vi.spyOn(project, 'exportAnimation').mockImplementation((format, { progress }) => { tell = progress; return new Promise((resolve) => { finish = resolve; }); });
  const { closed, unmount } = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    await pick(modal, 'Video');
    expect(modal.querySelector('.filename-ext').textContent).toBe('.mp4');
    modal.querySelector('button.primary').click();
    await nextTick();
    expect(exported.mock.calls[0][0]).toBe('mp4');
    tell(0.5);
    await nextTick();
    expect(modal.querySelector('progress').value).toBe(0.5);
    finish();
    await vi.waitUntil(() => closed.mock.calls.length, PATIENT);
  } finally {
    unmount();
  }
  vi.stubGlobal('VideoEncoder', undefined);
  const without = mountModal();
  try {
    const names = [...document.querySelectorAll('.modal-dialog .format-name')].map((el) => el.textContent);
    expect(names).toContain('GIF');
    expect(names).not.toContain('Video');
  } finally {
    without.unmount();
    vi.unstubAllGlobals();
  }
});

test('Enter in the file name exports, as it saves in Save project', async () => {
  const { project } = await drawing();
  const exported = vi.spyOn(project, 'exportFile').mockResolvedValue();
  const { closed, unmount } = mountModal();
  try {
    const name = document.querySelector('.modal-dialog input.filename-input');
    name.focus();
    await userEvent.keyboard('{Enter}');
    await vi.waitUntil(() => closed.mock.calls.length, PATIENT);
    expect(exported).toHaveBeenCalledTimes(1);
    expect(exported).toHaveBeenCalledWith('ans', expect.anything());
  } finally {
    unmount();
  }
});

test('PNG format shows smooth/hard toggle when smoothText is on', async () => {
  const { workspace } = await drawing();
  workspace.smoothText = true;
  const { unmount } = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    const buttons = [...modal.querySelectorAll('.format-btn:not(:disabled)')];
    buttons.find((b) => b.textContent.includes('PNG')).click();
    await nextTick();
    expect(modal.textContent).toContain('Text rendering');
    expect(modal.textContent).toContain('Hard-edged');
    expect(modal.textContent).toContain('Smooth');
  } finally {
    unmount();
  }
});

test('PNG format shows no toggle when smoothText is off', async () => {
  const { workspace } = await drawing();
  workspace.smoothText = false;
  const { unmount } = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    [...modal.querySelectorAll('.format-btn:not(:disabled)')].find((b) => b.textContent.includes('PNG')).click();
    await nextTick();
    expect(modal.textContent).not.toContain('Text rendering');
  } finally {
    unmount();
  }
});

test('Cancel closes without exporting', async () => {
  const { project } = await drawing();
  const exported = vi.spyOn(project, 'exportFile');
  const { closed, unmount } = mountModal();
  try {
    document.querySelector('.modal-dialog button.cancel').click();
    expect(closed).toHaveBeenCalled();
    expect(exported).not.toHaveBeenCalled();
  } finally {
    unmount();
  }
});

test('.ans lists each character it replaces and what it becomes; another format lists none', async () => {
  const { project } = await drawing();
  project.typeAt(2, 0, '漢', { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  project.render();
  await settle(project);
  const { unmount } = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    const rows = () => [...modal.querySelectorAll('ul[aria-label="Replacements"] li')].map((li) => li.textContent.replace(/\s+/g, ''));
    expect(rows()).toEqual(['漢→?1cell']);
    [...modal.querySelectorAll('.format-btn:not(:disabled)')].find((b) => b.textContent.includes('UTF-8 ANS')).click();
    await nextTick();
    expect(rows()).toEqual([]);
  } finally {
    unmount();
  }
});

// Walt's SAUCE: an accent CP437 has (é), and characters it lacks in two fields.
const WALT = { sauceAuthor: 'Wélt Kowałski €96 re', sauceGroup: 'Ïmpure Łodz Crew €XY' };
const pick = async (modal, name) => {
  [...modal.querySelectorAll('.format-btn')].find((b) => b.querySelector('.format-name').textContent.trim() === name).click();
  await nextTick();
};

test('every format that writes SAUCE lists the SAUCE characters CP437 lacks, with their fields; PNG lists none', async () => {
  const { project } = await drawing();
  Object.assign(project, WALT);
  const { unmount } = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    const list = () => modal.querySelector('ul[aria-label="SAUCE replacements"]');
    const rows = () => [...(list()?.querySelectorAll('li') ?? [])].map((li) => [...li.children].map((span) => span.textContent.trim()).join(' '));
    const expected = ['ł → ? Author', '€ → ? Author, Group', 'Ï → ? Group', 'Ł → ? Group'];
    expect(rows()).toEqual(expected);
    expect(modal.textContent).toContain('4 characters in SAUCE aren\'t in CP437 and will be substituted:');
    expect(modal.textContent).toContain('SAUCE is CP437 in every ANSI file. To choose your own stand-ins, change these on the SAUCE tab.');
    expect(modal.querySelector('ul[aria-label="Replacements"]')).toBeNull(); // the art's own are all CP437

    await pick(modal, 'UTF-8 ANS');
    expect(rows()).toEqual(expected);
    expect(modal.textContent).not.toContain('Export as .utf8ans to keep all original characters.');

    await pick(modal, 'PNG');
    expect(list()).toBeNull();

    project.sauceAuthor = 'Walt €';
    project.sauceGroup = '';
    await pick(modal, 'ANS');
    expect(rows()).toEqual(['€ → ? Author']);
    expect(modal.textContent).toContain('1 character in SAUCE isn\'t in CP437 and will be substituted:');
  } finally {
    unmount();
  }
});

test('the animated ANSI formats list SAUCE\'s too, GIF and Cast don\'t', async () => {
  const { project } = await drawing();
  project.animate = true;
  project.addFrame('blank');
  await settle(project);
  Object.assign(project, WALT);
  const { unmount } = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    const list = () => modal.querySelector('ul[aria-label="SAUCE replacements"]');
    for (const [name, listed] of [['Animated ANS', true], ['Animated UTF-8 ANS', true], ['GIF', false], ['Cast', false]]) {
      await pick(modal, name);
      expect(!!list(), name).toBe(listed);
    }
  } finally {
    unmount();
  }
});

test('the Export dialog repeats the comments\' warning when they run past 255 SAUCE lines, on every ANSI format', async () => {
  const { project } = await drawing();
  project.sauceRecord = 'none'; // an opened file's: none of Phosphor's own lines
  project.sauceUserComments = Array.from({ length: 300 }, (_, i) => `${String(i + 1).padStart(3, '0')} greets: the crew, the board, and everyone who kept these files alive`).join('\n');
  const { unmount } = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    const said = 'Comments: only the first 255 SAUCE lines fit. From line 128 ("files alive") on, they won\'t be in this file; they stay on the SAUCE tab.';
    expect(modal.textContent).toContain(said);
    await pick(modal, 'UTF-8 ANS');
    expect(modal.textContent).toContain(said);
    await pick(modal, 'PNG');
    expect(modal.textContent).not.toContain('SAUCE lines');
    project.sauceUserComments = 'two\nlines';
    await pick(modal, 'ANS');
    expect(modal.textContent).not.toContain('SAUCE lines'); // everything fits: nothing new
  } finally {
    unmount();
  }
});

test('Include SAUCE: checked on every ANSI format and each time the dialog opens; unchecked, the export has no record and SAUCE\'s notes give way to what viewers lose', async () => {
  const { project } = await drawing();
  project.animate = true;
  project.addFrame('blank');
  await settle(project);
  Object.assign(project, WALT);
  const still = vi.spyOn(project, 'exportFile').mockResolvedValue();
  const animated = vi.spyOn(project, 'exportAnimation').mockResolvedValue();
  const { closed, unmount } = mountModal();
  const box = () => document.querySelector('.modal-dialog label.sauce-choice input');
  const lost = 'Without SAUCE, other viewers don\'t know';
  try {
    const modal = document.querySelector('.modal-dialog');
    for (const [name, offered] of [['ANS', true], ['UTF-8 ANS', true], ['PNG', false], ['GIF', false], ['Cast', false], ['Animated UTF-8 ANS', true], ['Animated ANS', true]]) {
      await pick(modal, name);
      expect(!!box(), name).toBe(offered);
      if (offered) expect(box().checked, name).toBe(true);
    }
    expect(modal.querySelector('ul[aria-label="SAUCE replacements"]')).not.toBeNull();
    expect(modal.textContent).not.toContain(lost);
    await userEvent.click(box());
    expect(modal.querySelector('ul[aria-label="SAUCE replacements"]')).toBeNull();
    expect(modal.textContent).toContain(lost);
    await pick(modal, 'UTF-8 ANS'); // the choice holds across formats while the dialog is open
    expect(box().checked).toBe(false);
    modal.querySelector('button.primary').click();
    await vi.waitUntil(() => closed.mock.calls.length, PATIENT);
    expect(still).toHaveBeenCalledWith('utf8ans', expect.objectContaining({ sauce: false }));
  } finally {
    unmount();
  }
  const again = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    await pick(modal, 'Animated ANS');
    expect(box().checked).toBe(true); // not remembered
    modal.querySelector('button.primary').click();
    await vi.waitUntil(() => again.closed.mock.calls.length, PATIENT);
    expect(animated).toHaveBeenCalledWith('ansimation', expect.objectContaining({ sauce: true }));
  } finally {
    again.unmount();
  }
});

// The browser's share sheet, standing in: canShare takes images, and share does what it's given.
function shareSheet(share = async () => {}) {
  const had = ['canShare', 'share'].map((key) => [key, Object.getOwnPropertyDescriptor(navigator, key)]);
  const sheet = { canShare: vi.fn(({ files }) => files.every((file) => file.type.startsWith('image/'))), share: vi.fn(share) };
  for (const key of ['canShare', 'share']) Object.defineProperty(navigator, key, { value: sheet[key], configurable: true });
  sheet.restore = () => had.forEach(([key, d]) => (d ? Object.defineProperty(navigator, key, d) : delete navigator[key]));
  return sheet;
}
const shareButton = (modal) => [...modal.querySelectorAll('.actions button')].find((b) => /^Share/.test(b.textContent.trim()));

test('Share sends a PNG to the share sheet in place of a download, and closes; formats it can\'t take have no Share', async () => {
  await drawing();
  const sheet = shareSheet();
  const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const { closed, unmount } = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    expect(shareButton(modal)).toBeUndefined(); // ANS
    await pick(modal, 'PNG');
    modal.querySelector('input.filename-input').value = 'mine';
    modal.querySelector('input.filename-input').dispatchEvent(new Event('input'));
    await nextTick();
    shareButton(modal).click();
    await vi.waitUntil(() => closed.mock.calls.length, PATIENT);
    const [{ files: [file] }] = sheet.share.mock.calls[0];
    expect([file.name, file.type]).toEqual(['mine.png', 'image/png']);
    expect(new Uint8Array(await file.slice(1, 4).arrayBuffer())).toEqual(new TextEncoder().encode('PNG'));
    expect(download).not.toHaveBeenCalled();
  } finally {
    unmount();
    sheet.restore();
  }
});

test('Share sends a video to the share sheet where it takes one, and Video has no Share where it doesn\'t', async () => {
  const { project } = await drawing();
  project.animate = true;
  project.addFrame('blank');
  await settle(project);
  const sheet = shareSheet();
  sheet.canShare.mockImplementation(({ files }) => files.every((file) => /^(image|video)\//.test(file.type)));
  vi.spyOn(project, 'exportAnimation').mockImplementation(async (format, { deliver }) => deliver(new Blob(['mp4'], { type: 'video/mp4' }), 'loop.mp4'));
  const { closed, unmount } = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    await pick(modal, 'Video');
    shareButton(modal).click();
    await vi.waitUntil(() => closed.mock.calls.length, PATIENT);
    const [{ files: [file] }] = sheet.share.mock.calls[0];
    expect([file.name, file.type]).toEqual(['loop.mp4', 'video/mp4']);
  } finally {
    unmount();
  }
  sheet.canShare.mockImplementation(({ files }) => files.every((file) => file.type.startsWith('image/')));
  const again = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    await pick(modal, 'Video');
    expect(shareButton(modal)).toBeUndefined();
  } finally {
    again.unmount();
    sheet.restore();
  }
});

test('the share sheet put away leaves the dialog; refused for coming too long after the tap, the file waits for Share now', async () => {
  const { project } = await drawing();
  const sheet = shareSheet(async () => { throw new DOMException('Share canceled', 'AbortError'); });
  const built = vi.spyOn(project, 'exportFile');
  const { closed, unmount } = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    await pick(modal, 'PNG');
    shareButton(modal).click();
    await vi.waitUntil(() => sheet.share.mock.calls.length === 1, PATIENT);
    await nextTick();
    expect([closed.mock.calls.length, shareButton(modal).textContent.trim(), modal.querySelector('.problem')]).toEqual([0, 'Share', null]);

    sheet.share.mockImplementationOnce(async () => { throw new DOMException('Must be handling a user gesture', 'NotAllowedError'); });
    shareButton(modal).click();
    await vi.waitUntil(() => shareButton(modal).textContent.trim() === 'Share now', PATIENT);
    expect(modal.querySelector('[role=status]').textContent).toContain('ready');
    expect(built).toHaveBeenCalledTimes(2);

    sheet.share.mockImplementationOnce(async () => {});
    shareButton(modal).click();
    await vi.waitUntil(() => closed.mock.calls.length, PATIENT);
    expect(built).toHaveBeenCalledTimes(2); // the file kept, not written again
    expect(sheet.share.mock.calls[2][0].files[0]).toBe(sheet.share.mock.calls[1][0].files[0]);
  } finally {
    unmount();
    sheet.restore();
  }
});

test('with no share sheet there is no Share', async () => {
  await drawing();
  const had = Object.getOwnPropertyDescriptor(navigator, 'canShare');
  Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  const { unmount } = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    await pick(modal, 'PNG');
    expect(shareButton(modal)).toBeUndefined();
  } finally {
    unmount();
    if (had) Object.defineProperty(navigator, 'canShare', had); else delete navigator.canShare;
  }
});

test('names the layers showing a stand-in', async () => {
  const { project } = await drawing();
  const { unmount } = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    const note = () => modal.querySelector('p.stand-ins')?.textContent;
    expect(note()).toBeUndefined();
    project.setLayerChars('edit', { charChoice: 'plugin:jane.lines/lines' }); // a plugin this browser doesn't have
    await nextTick();
    expect(note()).toBe('Layer 1 shows By shape in place of its plugin solver.');
    project.setLayerChars('base', { charChoice: 'plugin:jane.lines/lines' });
    await nextTick();
    expect(note()).toBe('Base and Layer 1 show By shape in place of their plugin solvers.');
  } finally {
    unmount();
  }
});

// XBin holds 16 colors: it's offered with CGA, and not with VGA, full color or a list past 16.
test('offers XBin only for 16 colors or fewer', async () => {
  const { project, pinia } = await drawing();
  const state = async (settings) => {
    Object.assign(project, settings);
    await settle(project);
    const { unmount } = mountModal(pinia);
    try {
      const modal = document.querySelector('.modal-dialog');
      [...modal.querySelectorAll('.format-btn')].find((b) => b.textContent.includes('XBin')).click();
      await nextTick();
      return { disabled: modal.querySelector('button[type=submit]').disabled, words: modal.textContent.includes('XBin holds 16 colors') };
    } finally {
      unmount();
    }
  };
  expect(await state({ quantize: 'cga' })).toEqual({ disabled: false, words: false });
  expect(await state({ quantize: 'vga' })).toEqual({ disabled: true, words: true });
  expect(await state({ quantize: 'none' })).toEqual({ disabled: true, words: true });
  const list = (n) => Array.from({ length: n }, (_, i) => '#' + (i + 1).toString(16).padStart(2, '0').repeat(3)).join(' ');
  expect(await state({ quantize: 'palette', palette: list(16) })).toEqual({ disabled: false, words: false });
  expect(await state({ quantize: 'palette', palette: list(17) })).toEqual({ disabled: true, words: true });
});
