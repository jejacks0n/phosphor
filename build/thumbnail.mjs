// The macOS app's thumbnail extension (build/thumbnail/), named in electron-builder.yml twice: afterPack builds it into
// the packed app's PlugIns, and mac.sign signs it, sandboxed as an app extension must be, before electron-builder signs
// the rest (which leaves PlugIns alone) and seals the app around it.
import { execFile } from 'node:child_process';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import macCodeSign from 'app-builder-lib/out/codeSign/macCodeSign.js';

const run = promisify(execFile);
const here = new URL('./thumbnail/', import.meta.url).pathname;
const NAME = 'PhosphorThumbnail';
// electron-builder's Arch numbers, as the Swift compiler names them.
const TARGETS = { 1: 'x86_64', 3: 'arm64' };
const appex = (app) => join(app, 'Contents', 'PlugIns', `${NAME}.appex`);

export async function afterPack({ electronPlatformName, appOutDir, arch, packager }) {
  if (electronPlatformName !== 'darwin') return;
  const target = TARGETS[arch];
  if (!target) throw new Error(`The thumbnail extension is built for x64 or arm64 only, not arch ${arch}`);
  const bundle = appex(join(appOutDir, `${packager.appInfo.productFilename}.app`));
  await rm(bundle, { recursive: true, force: true });
  await mkdir(join(bundle, 'Contents', 'MacOS'), { recursive: true });
  const info = join(bundle, 'Contents', 'Info.plist');
  await copyFile(join(here, 'Info.plist'), info);
  for (const key of ['CFBundleShortVersionString', 'CFBundleVersion']) await run('plutil', ['-replace', key, '-string', packager.appInfo.version, info]);
  const sdk = (await run('xcrun', ['--show-sdk-path'])).stdout.trim();
  await run('xcrun', ['swiftc', '-O', '-parse-as-library', '-application-extension', '-module-name', NAME, '-sdk', sdk,
    '-target', `${target}-apple-macos12.0`, '-Xlinker', '-e', '-Xlinker', '_NSExtensionMain',
    '-o', join(bundle, 'Contents', 'MacOS', NAME), join(here, 'ThumbnailProvider.swift')]);
}

export async function sign(options) {
  await run('codesign', ['--sign', options.identity, '--force', '--options', 'runtime', '--timestamp',
    '--entitlements', join(here, 'entitlements.plist'), ...(options.keychain ? ['--keychain', options.keychain] : []), appex(options.app)]);
  return macCodeSign.sign(options);
}
