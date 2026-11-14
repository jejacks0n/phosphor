import { test, expect, vi, afterEach } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createApp, nextTick } from 'vue';
import { i18n } from '@/i18n';
import { createTestApp, settle } from '../support/app.js';
import ExportModal from '@/components/ExportModal.vue';

afterEach(() => vi.restoreAllMocks());

function mountModal() {
  const closed = vi.fn();
  const app = createApp(ExportModal, { onClose: closed }).use(i18n);
  app.mount(document.createElement('div'));
  return { closed, unmount: () => app.unmount() };
}

async function drawing() {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 6, rows: 4 });
  project.typeAt(1, 0, 'A', { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  return { project, workspace };
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

test('animated formats are disabled on a still drawing', async () => {
  await drawing();
  const { unmount } = mountModal();
  try {
    const modal = document.querySelector('.modal-dialog');
    const disabled = [...modal.querySelectorAll('.format-btn:disabled')];
    expect(disabled.length).toBe(4); // gif, ansimation, utf8ansimation, cast
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
    await vi.waitUntil(() => closed.mock.calls.length, { interval: 5 });
    expect(exported).toHaveBeenCalledWith('ans', expect.objectContaining({ smooth: expect.any(Boolean) }));
  } finally {
    unmount();
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
    await vi.waitUntil(() => closed.mock.calls.length, { interval: 5 });
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
