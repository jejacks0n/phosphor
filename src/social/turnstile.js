// Cloudflare Turnstile, the check that a sign-up, a reset request, a confirmation mail sent again, or a
// sign-in to an account that's had too many tries comes from a person. Only when
// Phosphor is built with VITE_TURNSTILE_SITE_KEY: without one there's no widget and the token is null
// (the server skips the check then too).
export const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

let loading = null;

function loadScript() {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => {
      loading = null;   // the next form tries again
      reject(new Error('Turnstile did not load'));
    };
    document.head.append(script);
  });
  return loading;
}

// Renders the widget into el for an action ('signup', 'forgot', 'verify' or 'signin'), as wide as el, with Turnstile's own
// render options added (appearance: 'interaction-only' shows it only when it needs the person); resolves to the token getter, whose
// remove() takes the widget away when the page is left. A token is good for one try, so taking it starts
// the widget on the next (for a second try after an error). A page left before the script loaded gets none.
export async function mountTurnstile(el, action, options = {}) {
  if (!turnstileSiteKey) return () => null;
  const turnstile = await loadScript();
  if (!el.isConnected) return () => null;
  const id = turnstile.render(el, { sitekey: turnstileSiteKey, action, size: 'flexible', ...options });
  const token = () => {
    const response = turnstile.getResponse(id) || null;
    if (response) turnstile.reset(id);
    return response;
  };
  token.remove = () => turnstile.remove(id);
  return token;
}
