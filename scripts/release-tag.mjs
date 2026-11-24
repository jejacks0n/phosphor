// The desktop workflow's check of the tag it was pushed for. A tag has one of three forms: a release (v1.2.3), a beta
// (v1.2.3-beta, v1.2.3-beta.2) or an alpha (v1.2.3-alpha, v1.2.3-alpha.2); any other (v1.2.3-rc.1) is refused. It's
// package.json's version, and higher than every version tag before it by semver's order, where v1.2.3-alpha comes
// before v1.2.3-beta, that before v1.2.3, and beta.2 before beta.10.
//   node scripts/release-tag.mjs <tag>   writes prerelease=true|false (a beta or an alpha is a GitHub pre-release) and
//                                        prod=true|false (a release or a beta publishes phosphor.work; an alpha's web
//                                        side is next.phosphor.work) to $GITHUB_OUTPUT, or fails with ::error::
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { compare, parse } from '../src/lib/semver.js';

const FORM = /^v[\d.]+(?:-(beta|alpha)(?:\.(?:0|[1-9]\d*))?)?$/;

// 'release', 'beta' or 'alpha' for a tag in one of the three forms, or null.
export const kindOf = (tag) => (parse(tag) && FORM.exec(tag) ? FORM.exec(tag)[1] ?? 'release' : null);

// What the workflow's later jobs go by.
export const outputs = (tag) => ({ prerelease: kindOf(tag) !== 'release', prod: kindOf(tag) !== 'alpha' });

// The reason the tag can't be released, or null. An older tag in another form (v1.2.3-rc.1) still has its place in the order.
export const refusal = (tag, version, tags) => {
  if (!kindOf(tag)) return `The tag ${tag} isn't a version (v1.2.3, v1.2.3-beta or v1.2.3-alpha; a beta or an alpha may end in a number, v1.2.3-beta.2)`;
  if (tag !== `v${version}`) return `The tag ${tag} isn't package.json's version, v${version}`;
  const higher = tags.filter((other) => other !== tag && parse(other) && compare(other, tag) >= 0).sort(compare).pop();
  return higher ? `The tag ${tag} isn't higher than the last version, ${higher}` : null;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const tag = process.argv[2];
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  const tags = execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const reason = refusal(tag, version, tags);
  if (reason) {
    console.log(`::error::${reason}`);
    process.exit(1);
  }
  const lines = Object.entries(outputs(tag)).map(([name, value]) => `${name}=${value}`).join('\n');
  console.log(lines);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines}\n`);
}
