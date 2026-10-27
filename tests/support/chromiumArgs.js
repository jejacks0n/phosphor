import { chromium } from '@playwright/test';

// Chromium keeps only the last --disable-features it's given, and Playwright passes its own list, so a
// feature we want off goes into that list: ours replaces Playwright's, with its features and ours.
export function mergeDisabledFeatures(defaultArgs, features) {
  const theirs = defaultArgs.find((arg) => arg.startsWith('--disable-features='));
  const all = [...(theirs?.slice('--disable-features='.length).split(',') ?? []), ...features];
  return { args: [`--disable-features=${all.join(',')}`], ignoreDefaultArgs: theirs ? [theirs] : [] };
}

// Launch options (args and ignoreDefaultArgs) that turn the features off and keep Playwright's. What
// Playwright passes is read from a browser launched for the purpose (automation lets us ask it), so
// a Playwright update changes nothing here.
export async function launchWithout(features, args = []) {
  const probe = await chromium.launch({ args: ['--enable-automation'] });
  try {
    const { arguments: defaults } = await (await probe.newBrowserCDPSession()).send('Browser.getBrowserCommandLine');
    const merged = mergeDisabledFeatures(defaults, features);
    return { args: [...args, ...merged.args], ignoreDefaultArgs: merged.ignoreDefaultArgs };
  } finally {
    await probe.close();
  }
}
