// The Turnstile widget: none and a null token without a site key; with one, Cloudflare's script is
// loaded once and each form renders its widget with its action. The script is stubbed (no network).
import { test, expect, vi, afterEach } from 'vitest';

const fakeTurnstile = () => {
  const turnstile = { render: vi.fn(() => `w${turnstile.render.mock.calls.length}`), getResponse: vi.fn(() => 'tok'), reset: vi.fn(), remove: vi.fn() };
  return turnstile;
};
const shownDiv = () => document.body.appendChild(document.createElement('div'));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('without a site key there\'s no widget, no script, and the token is null', async () => {
  const { mountTurnstile, turnstileSiteKey } = await import('@/social/turnstile');
  const append = vi.spyOn(document.head, 'append');
  const el = document.createElement('div');
  expect(turnstileSiteKey).toBeFalsy();
  const token = await mountTurnstile(el, 'signup');
  expect(token()).toBe(null);
  expect(append).not.toHaveBeenCalled();
  expect(el.childNodes.length).toBe(0);
});

test('with a site key the script loads once, each widget gets its action, and a token is handed over once', async () => {
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
  const { mountTurnstile } = await import('@/social/turnstile?with-key');
  const turnstile = fakeTurnstile();
  const append = vi.spyOn(document.head, 'append').mockImplementation((script) => {
    vi.stubGlobal('turnstile', turnstile);
    setTimeout(() => script.onload());
  });

  const signup = shownDiv();
  const token = await mountTurnstile(signup, 'signup');
  await mountTurnstile(shownDiv(), 'forgot');
  expect(append).toHaveBeenCalledTimes(1);
  expect(append.mock.calls[0][0].src).toBe('https://challenges.cloudflare.com/turnstile/v0/api.js');
  expect(turnstile.render.mock.calls).toEqual([
    [signup, expect.objectContaining({ sitekey: 'site-key', action: 'signup' })],
    [expect.any(HTMLElement), expect.objectContaining({ sitekey: 'site-key', action: 'forgot' })],
  ]);

  expect(token()).toBe('tok');
  expect(turnstile.getResponse).toHaveBeenCalledWith('w1');
  expect(turnstile.reset).toHaveBeenCalledWith('w1'); // a token is good once: the widget starts on the next
  turnstile.getResponse.mockReturnValue(undefined);
  expect(token()).toBe(null);

  token.remove(); // the page is left
  expect(turnstile.remove).toHaveBeenCalledWith('w1');
});

test('a page left before the script loaded gets no widget', async () => {
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
  const { mountTurnstile } = await import('@/social/turnstile?left-early');
  const turnstile = fakeTurnstile();
  let loaded;
  vi.spyOn(document.head, 'append').mockImplementation((script) => {
    vi.stubGlobal('turnstile', turnstile);
    loaded = () => script.onload();
  });
  const el = shownDiv();
  const mounting = mountTurnstile(el, 'signup');
  el.remove();
  loaded();
  const token = await mounting;
  expect(turnstile.render).not.toHaveBeenCalled();
  expect(token()).toBe(null);
});
