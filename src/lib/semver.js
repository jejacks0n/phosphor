// Version tags in semver's order (https://semver.org): v and three numbers, with a pre-release after a dash if it is
// one (v1.2.3, v1.2.3-beta, v1.2.3-beta.2). The desktop workflow's tag check (scripts/release-tag.mjs) and the desktop
// app's Check for Updates both use it.
const VERSION = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

// { numbers, pre } for a version tag, or null.
export const parse = (tag) => {
  const match = VERSION.exec(tag);
  return match && { numbers: match.slice(1, 4).map(Number), pre: match[4]?.split('.') ?? [] };
};

// Below 0, 0 or above 0, as a is before, the same as or after b.
export const compare = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x.numbers[i] !== y.numbers[i]) return x.numbers[i] - y.numbers[i];
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length; // a release is after its pre-releases
  for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i++) {
    const [p, q] = [x.pre[i], y.pre[i]];
    if (p === q) continue;
    const [pn, qn] = [/^\d+$/.test(p), /^\d+$/.test(q)];
    if (pn && qn) return Number(p) - Number(q);
    if (pn !== qn) return pn ? -1 : 1; // numbers before words
    return p < q ? -1 : 1;
  }
  return x.pre.length - y.pre.length;
};

// Check for Updates: the newest release after `version` (package.json's, with no v) among GitHub's ({ tag, prerelease,
// url }), or null. Pre-releases are offered only to someone on one.
export function newerRelease(version, releases) {
  const current = `v${version}`;
  if (!parse(current)) return null;
  const onPre = parse(current).pre.length > 0;
  const offered = releases.filter(({ tag, prerelease }) => parse(tag) && (onPre || (!prerelease && !parse(tag).pre.length)) && compare(tag, current) > 0);
  return offered.sort((a, b) => compare(a.tag, b.tag)).pop() ?? null;
}
