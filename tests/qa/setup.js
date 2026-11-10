// What a QA run is before it starts: the person drawn from a seed, the browser that person has, the port
// and the folder the run uses, and the snippets a session runs while it waits. Plain ES modules with no
// Playwright import, since the Playwright config and the unit tests both load them.
import { pathToFileURL } from 'node:url';

export const PERSONAS = ['maya', 'dex', 'priya', 'juno', 'theo', 'sam', 'lea', 'walt'];
export const PARTNERS = ['maya', 'dex', 'priya', 'sam', 'walt'];

export const DEVICES = {
  desktop: { width: 1440, height: 900, touch: false },
  laptop: { width: 1280, height: 720, touch: false },
  tablet: { width: 1024, height: 768, touch: true },
  phone: { width: 390, height: 844, touch: true },
};

// Which devices each persona can have; the rest may have any.
const DEVICE_CHOICES = {
  lea: ['phone'],
  juno: ['desktop', 'laptop', 'tablet'],
  theo: ['desktop', 'laptop', 'tablet'],
};

// A small seeded generator, so a seed always gives the same run.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function drawTraits(persona, seed) {
  if (!PERSONAS.includes(persona)) throw new Error(`unknown persona "${persona}"`);
  const random = mulberry32(seed);
  const pick = (list) => list[Math.floor(random() * list.length)];
  // The order of these draws is fixed: changing it changes every seed's run.
  const device = pick(DEVICE_CHOICES[persona] || Object.keys(DEVICES));
  const input = pick(DEVICES[device].touch ? ['touch'] : ['mouse', 'trackpad']);
  const language = pick(['en', 'fr']);
  const theme = pick(['light', 'dark']);
  const interruption = pick(['none', 'reload', 'secondTab']);
  const account = persona === 'juno' || persona === 'theo' ? pick(['guest', 'signedIn']) : null;
  const partner = persona === 'juno' ? pick(PARTNERS) : null;
  return { persona, seed, device, input, language, theme, account, interruption, partner };
}

export function contextOptions(traits) {
  const { width, height, touch } = DEVICES[traits.device];
  const phone = traits.device === 'phone';
  return {
    viewport: { width, height },
    hasTouch: touch,
    isMobile: phone,
    deviceScaleFactor: phone ? 3 : 2,
    locale: traits.language === 'fr' ? 'fr-FR' : 'en-US',
    colorScheme: traits.theme,
  };
}

export function storageFor(traits) {
  return { 'phosphor.locale': traits.language, 'phosphor.theme': traits.theme };
}

// The port the QA build is served on. Never the dev server's or the end-to-end projects', so a run can't
// test someone else's build.
export function qaPort(env) {
  const raw = env.QA_PORT ?? '4210';
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port < 1024 || port > 65535) throw new Error(`QA_PORT must be a port number, not "${raw}"`);
  if ([5173, 4180, 4181].includes(port)) throw new Error(`QA_PORT ${port} belongs to something else`);
  return port;
}

// Named by the local day, the one the owner reads folders by.
export function runDirName(date, persona, seed) {
  const two = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}-${persona}-${seed}`;
}

// Runs a snippet file's default export with the given arguments, and records what came of it: its value,
// what it threw, or that it never settled.
export async function runSnippet(file, args, ms) {
  const start = Date.now();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  try {
    const run = async () => (await import(pathToFileURL(file).href)).default(args);
    const value = await Promise.race([run(), timeout]);
    return { ok: true, value, ms: Date.now() - start };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error), ms: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}
