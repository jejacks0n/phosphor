// The desktop workflow's library job: after `npm run fonts` mirrored the upstream collections, what the tag does about
// the new fonts. 'build': none, build the tag. 'commit': new fonts, the tag is main's head and a deploy key is there, so
// they're committed to main and the tag moved onto them. 'warn': new fonts but it can't, so the tag builds as it is.
//   CHANGED=<n> HAS_KEY=<true|false> node scripts/library-release.mjs   writes step=<value> to $GITHUB_OUTPUT, and
//                                                                      ::warning:: for 'warn'
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

export const libraryStep = ({ changed, tagSha, mainSha, hasKey }) => {
  if (!changed) return 'build';
  return hasKey && tagSha === mainSha ? 'commit' : 'warn';
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const hasKey = process.env.HAS_KEY === 'true';
  const tagSha = process.env.GITHUB_SHA;
  const mainSha = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
  const step = libraryStep({ changed: Number(process.env.CHANGED), tagSha, mainSha, hasKey });
  if (step === 'warn') {
    const why = hasKey ? "the tag isn't main's latest commit" : "the FONTS_DEPLOY_KEY secret isn't set";
    console.log(`::warning::The font library has updates upstream but wasn't updated: ${why}`);
  }
  console.log(`step=${step}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `step=${step}\n`);
}
