import { describe, it, expect } from 'vitest';
import { cleanIcon } from '../../src/plugins/icon.js';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

describe('cleanIcon', () => {
  const accepted = [
    ['a Font Awesome style icon', `<svg ${NS} viewBox="0 0 640 640"><path d="M512 74L291 222Z"/></svg>`,
      `<svg ${NS} viewBox="0 0 640 640"><path d="M512 74L291 222Z"></path></svg>`],
    ['currentColor', '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M0 0h4"/></svg>',
      `<svg ${NS} viewBox="0 0 24 24"><path fill="currentColor" d="M0 0h4"></path></svg>`],
    ['an xml header, comments, single quotes and whitespace',
      `<?xml version="1.0"?>\n<!-- hi -->\n<svg viewBox='0 0 16 16'>\n <g stroke="none" stroke-width="2.50">\n  <circle cx="8" cy="8" r="4"/>\n </g>\n</svg>\n`,
      `<svg ${NS} viewBox="0 0 16 16"><g stroke="none" stroke-width="2.5"><circle cx="8" cy="8" r="4"></circle></g></svg>`],
    ['shapes and points', '<svg viewBox="0 0 20 20"><polygon points="0,0 10 10, 5 5"/><rect x="1" y="1" width="3" height="3" opacity=".5"/></svg>',
      `<svg ${NS} viewBox="0 0 20 20"><polygon points="0 0 10 10 5 5"></polygon><rect x="1" y="1" width="3" height="3" opacity="0.5"></rect></svg>`],
  ];

  it.each(accepted)('accepts %s', (_n, input, output) => {
    const out = cleanIcon(input);
    expect(out).toBe(output);
    expect(out).not.toMatch(/\bon\w*=|href|style/);
  });

  const KB9 = `<svg viewBox="0 0 24 24"><path d="${'M0 0 '.repeat(1800)}"/></svg>`;
  it.each([
    ['script', '<svg viewBox="0 0 24 24"><script>x</script></svg>'],
    ['onload', '<svg viewBox="0 0 24 24"><path onload="x" d="M0 0"/></svg>'],
    ['a link', '<svg viewBox="0 0 24 24"><a href="javascript:x"></a></svg>'],
    ['style', '<svg viewBox="0 0 24 24"><path style="fill:red"/></svg>'],
    ['foreignObject', '<svg viewBox="0 0 24 24"><foreignObject/></svg>'],
    ['an entity', '<svg viewBox="0 0 24 24">&lt;</svg>'],
    ['an entity in a value', '<svg viewBox="0 0 24 24"><path d="M0 0&amp;"/></svg>'],
    ['a doctype', '<!DOCTYPE svg><svg viewBox="0 0 24 24"></svg>'],
    ['cdata', '<svg viewBox="0 0 24 24"><![CDATA[x]]></svg>'],
    ['a named fill', '<svg viewBox="0 0 24 24"><path fill="red"/></svg>'],
    ['a url fill', '<svg viewBox="0 0 24 24"><path fill="url(#g)"/></svg>'],
    ['transform', '<svg viewBox="0 0 24 24"><g transform="rotate(1)"/></svg>'],
    ['text between tags', '<svg viewBox="0 0 24 24">hi<g/></svg>'],
    ['an unclosed g', '<svg viewBox="0 0 24 24"><g></svg>'],
    ['crossed tags', '<svg viewBox="0 0 24 24"><g><path/></g></path></svg>'],
    ['9 KB', KB9],
    ['a small viewBox', '<svg viewBox="0 0 8 8"></svg>'],
    ['a short viewBox', '<svg viewBox="0 0 24 8"></svg>'],
    ['no viewBox', '<svg></svg>'],
    ['a three number viewBox', '<svg viewBox="0 0 24"></svg>'],
    ['a root g', '<g viewBox="0 0 24 24"></g>'],
    ['a second root', '<svg viewBox="0 0 24 24"></svg><svg viewBox="0 0 24 24"></svg>'],
    ['a nested svg', '<svg viewBox="0 0 24 24"><svg viewBox="0 0 24 24"/></svg>'],
    ['an unquoted value', '<svg viewBox=0><g/></svg>'],
    ['a duplicate attribute', '<svg viewBox="0 0 24 24"><g opacity="1" opacity="0"/></svg>'],
    ['a path with a letter', '<svg viewBox="0 0 24 24"><path d="M0 0 x"/></svg>'],
    ['a bad number', '<svg viewBox="0 0 24 24"><circle r="1px"/></svg>'],
    ['an uppercase attribute', '<svg viewBox="0 0 24 24"><g Fill="none"/></svg>'],
    ['an uppercase element', '<svg viewBox="0 0 24 24"><G/></svg>'],
    ['not a string', 5],
    ['nothing', ''],
  ])('refuses %s', (_n, input) => {
    expect(() => cleanIcon(input)).toThrow(new Error('icon'));
  });
});
