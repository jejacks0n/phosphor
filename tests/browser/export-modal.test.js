import { test, expect, vi, afterEach } from 'vitest';
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
