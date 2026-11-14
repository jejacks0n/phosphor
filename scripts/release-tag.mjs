// The desktop workflow's check of the tag it was pushed for: v and three numbers, with a pre-release after a dash if
// it is one (v1.2.3, v1.2.3-beta, v1.2.3-beta.2), package.json's version, and higher than every version tag before it
// by semver's order, where v1.2.3-beta comes before v1.2.3 and beta.2 before beta.10.
//   node scripts/release-tag.mjs <tag>   writes prerelease=true or prerelease=false to $GITHUB_OUTPUT, or fails with
//                                        ::error::
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { compare, parse } from '../src/lib/semver.js';

// The reason the tag can't be released, or null.
export const refusal = (tag, version, tags) => {
  if (!parse(tag)) return `The tag ${tag} isn't a version (v1.2.3 or v1.2.3-beta)`;
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
  const line = `prerelease=${parse(tag).pre.length > 0}`;
  console.log(line);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`);
}
