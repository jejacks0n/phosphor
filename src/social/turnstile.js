// Cloudflare Turnstile, the check that a sign-up or a reset request comes from a person. Only when
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

// Renders the widget into el for an action ('signup' or 'forgot'); resolves to the token getter. A token
// is good for one try, so taking it starts the widget on the next (for a second try after an error).
export async function mountTurnstile(el, action) {
  if (!turnstileSiteKey) return () => null;
  const turnstile = await loadScript();
  const id = turnstile.render(el, { sitekey: turnstileSiteKey, action });
  return () => {
    const token = turnstile.getResponse(id) || null;
    if (token) turnstile.reset(id);
    return token;
  };
}
