// The built page's Content-Security-Policy (vite.config.js): the web build's, and the desktop build's, which reaches
// nothing outside the app but the rooms' sockets.
import { describe, it, expect } from 'vitest';
import { contentSecurityPolicy } from '../../vite.config.js';

const HTML = '<html><head><script>window.a = 1;</script></head><body></body></html>';
const directive = (policy, name) => policy.split('; ').find((d) => d.startsWith(`${name} `));

describe('contentSecurityPolicy', () => {
  it('web CSP connects to the SOCIAL server and Turnstile, and hashes inline scripts', () => {
    const policy = contentSecurityPolicy(HTML, 'https://api.phosphor.work');
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self' https://api.phosphor.work wss://api.phosphor.work http://localhost:8787 ws://localhost:8787 https://challenges.cloudflare.com");
    expect(directive(policy, 'script-src')).toMatch(/^script-src 'self' https:\/\/challenges\.cloudflare\.com 'sha256-[^']+'$/);
    expect(directive(policy, 'frame-src')).toBe('frame-src https://challenges.cloudflare.com');
  });

  it('desktop CSP allows ws: and no https origin or Turnstile', () => {
    const policy = contentSecurityPolicy(HTML, 'https://api.phosphor.work', { desktop: true });
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self' ws:");
    expect(directive(policy, 'script-src')).toMatch(/^script-src 'self' 'sha256-[^']+'$/);
    expect(policy).not.toMatch(/https?:/);
    expect(policy).not.toContain('frame-src');
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
  });
});
