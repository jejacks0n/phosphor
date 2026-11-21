// The built page's Content-Security-Policy (vite.config.js): the web build's, and the desktop build's, which reaches
// nothing outside the app but the rooms' sockets (its marketplace fetches are the main process's).
import { describe, it, expect, afterAll } from 'vitest';
import { build } from 'vite';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentSecurityPolicy, securityHeaders, previewHeaders } from '../../vite.config.js';

const HTML = '<html><head><script>window.a = 1;</script></head><body></body></html>';
const directive = (policy, name) => policy.split('; ').find((d) => d.startsWith(`${name} `));

describe('contentSecurityPolicy', () => {
  it('web CSP connects to the SOCIAL server, Turnstile and raw GitHub files (the marketplace), and hashes inline scripts', () => {
    const policy = contentSecurityPolicy(HTML, 'https://api.phosphor.work');
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self' https://api.phosphor.work wss://api.phosphor.work http://localhost:8787 ws://localhost:8787 https://challenges.cloudflare.com https://raw.githubusercontent.com");
    expect(directive(policy, 'script-src')).toMatch(/^script-src 'self' blob: https:\/\/challenges\.cloudflare\.com 'sha256-[^']+'$/);
    expect(directive(policy, 'frame-src')).toBe('frame-src https://challenges.cloudflare.com');
  });

  it('desktop CSP allows ws: and no https origin or Turnstile', () => {
    const policy = contentSecurityPolicy(HTML, 'https://api.phosphor.work', { desktop: true });
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self' ws:");
    expect(directive(policy, 'script-src')).toMatch(/^script-src 'self' blob: 'sha256-[^']+'$/);
    expect(policy).not.toMatch(/https?:/);
    expect(policy).not.toContain('raw.githubusercontent.com');
    expect(policy).not.toContain('frame-src');
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
  });
});

describe('the web build headers',() => {
  it('a header policy forbids framing, which a <meta> policy cannot say', () => {
    expect(contentSecurityPolicy(HTML, 'https://api.phosphor.work', { header: true })).toMatch(/; frame-ancestors 'none'$/);
    expect(contentSecurityPolicy(HTML, 'https://api.phosphor.work')).not.toContain('frame-ancestors');
  });

  it('_headers sends the policy and the other security headers for every path', () => {
    expect(securityHeaders('P')).toBe('/*\n  Content-Security-Policy: P\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n');
  });

  it('the preview server sends the /* headers of _headers, values whole', () => {
    expect(previewHeaders(securityHeaders("default-src 'self'; a: b"))).toEqual([
      ['Content-Security-Policy', "default-src 'self'; a: b"],
      ['X-Content-Type-Options', 'nosniff'],
      ['Referrer-Policy', 'strict-origin-when-cross-origin'],
      ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
    ]);
  });

  const out = mkdtempSync(join(tmpdir(), 'phosphor-csp-'));
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it('a web build writes _headers whose hashes match the page, leaves no <meta> policy and no 404.html', async () => {
    process.env.VITE_SOCIAL_STUN = 'none';
    await build({ configFile: join(process.cwd(), 'vite.config.js'), build: { outDir: out, emptyOutDir: true }, logLevel: 'silent' });
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    const headers = readFileSync(join(out, '_headers'), 'utf8');
    const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(([, code]) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`);
    expect(hashes.length).toBeGreaterThan(0);
    for (const hash of hashes) expect(headers).toContain(hash);
    expect(headers).toContain("frame-ancestors 'none'");
    expect(html).not.toMatch(/http-equiv="Content-Security-Policy"/);
    expect(existsSync(join(out, '404.html'))).toBe(false);
  }, 180000);
});
