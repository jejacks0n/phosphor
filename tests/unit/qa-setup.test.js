// The QA personas' traits: drawn from a seed, the same every time, and kept to what each persona would use.
import { test, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PERSONAS, PARTNERS, DEVICES, drawTraits, contextOptions, storageFor, qaPort, runDirName, runSnippet } from '../qa/setup.js';
import { LOCALE_STORAGE_KEY } from '../../src/i18n/index.js';

const seeds = Array.from({ length: 500 }, (_, i) => i + 1);

test('a seed always draws the same traits; an unknown persona throws', () => {
  expect(drawTraits('maya', 7)).toEqual(drawTraits('maya', 7));
  expect(() => drawTraits('nobody', 1)).toThrow();
});

test('each persona keeps to its own devices, accounts and partners', () => {
  for (const persona of PERSONAS) {
    for (const seed of seeds) {
      const t = drawTraits(persona, seed);
      if (persona === 'lea') expect(t.device).toBe('phone');
      if (persona === 'juno' || persona === 'theo') {
        expect(t.device).not.toBe('phone');
        expect(['guest', 'signedIn']).toContain(t.account);
      } else expect(t.account).toBeNull();
      if (persona === 'juno') expect(PARTNERS).toContain(t.partner);
      else expect(t.partner).toBeNull();
      if (DEVICES[t.device].touch) expect(t.input).toBe('touch');
      else expect(['mouse', 'trackpad']).toContain(t.input);
    }
  }
});

test('across 500 seeds maya meets every device, input, language, theme and interruption', () => {
  const draws = seeds.map((s) => drawTraits('maya', s));
  const seen = (key) => new Set(draws.map((t) => t[key]));
  expect(seen('device')).toEqual(new Set(Object.keys(DEVICES)));
  expect(seen('input')).toEqual(new Set(['mouse', 'trackpad', 'touch']));
  expect(seen('language')).toEqual(new Set(['en', 'fr']));
  expect(seen('theme')).toEqual(new Set(['light', 'dark']));
  expect(seen('interruption')).toEqual(new Set(['none', 'reload', 'secondTab']));
});

test('the browser context follows the device, language and theme', () => {
  const phone = contextOptions({ ...drawTraits('lea', 1), language: 'fr', theme: 'dark' });
  expect(phone).toMatchObject({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3, locale: 'fr-FR', colorScheme: 'dark' });
  const desktop = contextOptions({ ...drawTraits('maya', 1), device: 'desktop', language: 'en', theme: 'light' });
  expect(desktop).toMatchObject({ isMobile: false, deviceScaleFactor: 2, colorScheme: 'light' });
});

test('storage holds the language and theme under the app\'s own keys', () => {
  const store = storageFor({ ...drawTraits('maya', 1), language: 'fr', theme: 'light' });
  expect(store).toEqual({ [LOCALE_STORAGE_KEY]: 'fr', 'phosphor.theme': 'light' });
});

test('the QA port is 4210 unless QA_PORT says otherwise, and never one the app or its e2e use', () => {
  expect(qaPort({})).toBe(4210);
  expect(qaPort({ QA_PORT: '4300' })).toBe(4300);
  for (const bad of ['5173', '4180', '4181', 'abc']) expect(() => qaPort({ QA_PORT: bad })).toThrow();
});

test('a run directory is the date, the persona and the seed', () => {
  expect(runDirName(new Date(2026, 10, 9, 23, 30), 'dex', 42)).toBe('2026-11-09-dex-42');
  expect(runDirName(new Date(2026, 0, 5, 0, 10), 'dex', 42)).toBe('2026-01-05-dex-42');
});

test('runSnippet records a value, a throw or a timeout', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-snippet-'));
  const make = (name, body) => {
    const file = join(dir, name);
    writeFileSync(file, body);
    return file;
  };
  expect(await runSnippet(make('ok.mjs', 'export default () => 3;'), {}, 1000)).toMatchObject({ ok: true, value: 3 });
  expect(await runSnippet(make('args.mjs', 'export default (a) => a.n * 2;'), { n: 4 }, 1000)).toMatchObject({ ok: true, value: 8 });
  expect(await runSnippet(make('boom.mjs', 'export default () => { throw new Error(\'boom\'); };'), {}, 1000)).toMatchObject({ ok: false, error: 'boom' });
  const hung = await runSnippet(make('hang.mjs', 'export default () => new Promise(() => {});'), {}, 200);
  expect(hung).toMatchObject({ ok: false, error: 'timed out after 200 ms' });
  expect(hung.ms).toBeGreaterThanOrEqual(190);
});
