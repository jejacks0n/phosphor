// Sends a snippet to a persona's running QA session and prints what it did:
//   npm run qa:send -- <persona> <snippet.mjs>   prints the snippet's outbox JSON
//   npm run qa:send -- <persona> --end           writes report.md, ends the session and prints its path
// It waits QA_WAIT seconds (180 by default) and exits 1 if nothing comes back.
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [persona, what] = process.argv.slice(2);
if (!persona || !what) {
  console.error('usage: npm run qa:send -- <persona> <snippet.mjs | --end>');
  process.exit(2);
}
const latest = fileURLToPath(new URL(`../../qa-runs/${persona}.latest`, import.meta.url));
if (!existsSync(latest)) {
  console.error(`no QA run for ${persona}: start one with QA_PERSONA=${persona} npm run qa`);
  process.exit(1);
}
const runDir = readFileSync(latest, 'utf8').trim();
const raw = process.env.QA_WAIT ?? '180';
if (!/^\d+$/.test(raw)) {
  console.error(`QA_WAIT must be a whole number of seconds, not "${raw}"`);
  process.exit(2);
}

// Into the inbox under a dot name first, which the session skips, so it never reads half a file.
function drop(name, write) {
  const part = join(runDir, 'inbox', `.${name}`);
  write(part);
  renameSync(part, join(runDir, 'inbox', name));
}

let answer;
if (what === '--end') {
  drop('end', (path) => writeFileSync(path, ''));
  answer = join(runDir, 'report.md');
} else {
  // npm runs scripts from the package's folder; the path is the caller's.
  const file = resolve(process.env.INIT_CWD ?? process.cwd(), what);
  const name = `${Date.now()}-${basename(file)}`;
  drop(name, (path) => copyFileSync(file, path));
  answer = join(runDir, 'outbox', `${name}.json`);
}

const until = Date.now() + Number(raw) * 1000;
while (!existsSync(answer)) {
  if (Date.now() > until) {
    console.error(`nothing came back in ${raw} s: is the ${persona} session running? (${runDir})`);
    process.exit(1);
  }
  await new Promise((done) => setTimeout(done, 200));
}
console.log(what === '--end' ? answer : readFileSync(answer, 'utf8'));
