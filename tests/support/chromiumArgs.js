import { chromium } from '@playwright/test';

// Where the launch options are kept for the run: Playwright loads its config again in every worker, and
// a worker inherits the environment of the run that made it.
const KEPT = 'PHOSPHOR_CHROMIUM_LAUNCH';

// Chromium keeps only the last --disable-features it's given, and Playwright passes its own list, so a
// feature we want off goes into that list: ours replaces Playwright's, with its features and ours. No
// list to merge into throws: ours beside one we missed would turn its features back on, or ours off.
export function mergeDisabledFeatures(defaultArgs, features) {
  const theirs = defaultArgs.find((arg) => arg.startsWith('--disable-features='));
  if (!theirs) throw new Error('Playwright\'s --disable-features wasn\'t found in its command line');
  const all = [...theirs.slice('--disable-features='.length).split(','), ...features];
  return { args: [`--disable-features=${all.join(',')}`], ignoreDefaultArgs: [theirs] };
}

// Launch options (args and ignoreDefaultArgs) that turn the features off and keep Playwright's. What
// Playwright passes is read from a browser launched for the purpose (automation lets us ask it), so
// a Playwright update changes nothing here; once a run, the rest of it (its workers) reading the answer
// from the environment.
export async function launchWithout(features, args = []) {
  if (process.env[KEPT]) return JSON.parse(process.env[KEPT]);
  const probe = await chromium.launch({ args: ['--enable-automation'] });
  try {
    const { arguments: defaults } = await (await probe.newBrowserCDPSession()).send('Browser.getBrowserCommandLine');
    const merged = mergeDisabledFeatures(defaults, features);
    const options = { args: [...args, ...merged.args], ignoreDefaultArgs: merged.ignoreDefaultArgs };
    process.env[KEPT] = JSON.stringify(options);
    return options;
  } finally {
    await probe.close();
  }
}
