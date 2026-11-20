// The marketplace's fetches (docs/plugins.md): the list (the web build's own /plugins.json; the desktop app asks the
// main process for phosphor.work's, desktop/pluginList.js) and a listed plugin's files on raw GitHub at the listed
// commit, each read no further than its cap and checked here against the list's hashes.
import { desktop } from '@/social/desktop';
import { readList, rawUrl } from './listing.js';
import { sha256 } from './hash.js';
import { ManifestError, MOST_MANIFEST_BYTES, MOST_SCRIPT_BYTES } from './manifest.js';

const MOST_LIST_BYTES = 4 * 1024 * 1024; // as desktop/pluginList.js's
const TIMEOUT_MS = 15_000;
const onDesktop = () => import.meta.env.VITE_DESKTOP === '1';

// A body of at most `most` bytes as text (a BOM dropped), or an Error. The desktop main process has its own copy.
async function webText(url, most) {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`status ${response.status}`);
  if (!response.body) return '';
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > most) {
      reader.cancel().catch(() => {});
      throw new Error('tooBig');
    }
    text += decoder.decode(value, { stream: true });
  }
}

// { built, entries }, or a ListError (not the list) or another Error (not reached).
export async function loadList() {
  return readList(onDesktop() ? await desktop.pluginList() : await webText('/plugins.json', MOST_LIST_BYTES));
}

// A listed file's text when its hash is the listed one. Not reached, a 404 or over the cap: listUnavailable.
async function listedFile(url, most, hash) {
  let text;
  try {
    text = onDesktop() ? await desktop.pluginFile(url, most) : await webText(url, most);
  } catch {
    throw new ManifestError('listUnavailable');
  }
  if (typeof text !== 'string' || (await sha256(text)) !== hash) throw new ManifestError('changedSinceListed');
  return text;
}

// An entry's manifest and script (null for a plugin with none) as served at its commit, or a ManifestError.
export async function fetchListed(entry) {
  const manifestText = await listedFile(rawUrl(entry, 'phosphor-plugin.json'), MOST_MANIFEST_BYTES, entry.manifestHash);
  const scriptText = entry.manifest.script
    ? await listedFile(rawUrl(entry, entry.manifest.script), MOST_SCRIPT_BYTES, entry.scriptHash)
    : null;
  return { manifestText, scriptText };
}
