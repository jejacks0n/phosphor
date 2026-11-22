// Writes src/lib/colorPalettes.json, the sixteen-color palettes the Colors dialog ships with, from Lospec.
// `npm run colors`, by hand and never in CI: Lospec's terms forbid crawling, so this makes one documented request a
// palette (its per-palette API), 500 ms apart, and the file it writes is committed. A palette that can't be had, or
// isn't sixteen colors, stops the run with its slug.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { apiOf, readPalette } from '../src/lib/lospec.js';

export const SLUGS = [
  'sweetie-16', 'pico-8', 'dawnbringer-16', 'endesga-16', 'aap-16', 'arne-16', 'na16', 'steam-lords', 'lost-century',
  'fading-16', 'vanilla-milkshake', 'island-joy-16', 'bubblegum-16', 'taffy-16', 'night-16', 'europa-16', 'galaxy-flame',
  'go-line', 'cretaceous-16', 'jehkoba16', 'lump-16', 'simplejpc-16', 'antiquity16', 'shido-cyberneon',
  'commodore-vic-20', 'colodore', 'macintosh-ii', 'microsoft-windows', 'risc-os',
];

const OUT = fileURLToPath(new URL('../src/lib/colorPalettes.json', import.meta.url));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const set = [];
  for (const slug of SLUGS) {
    if (set.length) await pause(500);
    try {
      const response = await fetch(apiOf(slug));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { name, author, colors, of } = readPalette(await response.json(), slug);
      if (colors.length !== 16 || of) throw new Error(`${colors.length} colors, not 16`);
      set.push({ slug, name, author, colors });
    } catch (error) {
      console.error(`${slug}: ${error.message}`);
      process.exit(1);
    }
    console.log(slug);
  }
  await writeFile(OUT, `${JSON.stringify(set, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await run();
