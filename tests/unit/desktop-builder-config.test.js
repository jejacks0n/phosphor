// The desktop app's packaging (electron-builder.yml) and its release workflow (.github/workflows/desktop.yml), read as
// text: what macOS asks people, what's signed, where it's published.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPENABLE } from '../../desktop/files.js';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
// The block under a top-level key, up to the next one.
const section = (yml, key) => new RegExp(`^${key}:\\n((?:[ #].*\\n|\\n)*)`, 'm').exec(yml)?.[1] ?? '';

test('builder config names the Local Network usage, opens projects and ANSI art, signs mac, publishes to github', () => {
  const yml = read('electron-builder.yml');
  assert.match(yml, /^appId: work\.phosphor\.app$/m);
  assert.match(yml, /^productName: Phosphor$/m);
  assert.match(yml, /^publish: github$/m);
  // Not dist/: that's the web build's.
  assert.match(yml, /^directories:\n\s+output: release$/m);
  for (const file of ['desktop/**', 'dist-desktop/**', 'package.json']) assert.match(section(yml, 'files'), new RegExp(`- ${file.replaceAll('*', '\\*')}$`, 'm'));

  // Double-clicked projects and ANSI art open in Phosphor: projects as theirs, ANSI art as one editor among others.
  const associations = section(yml, 'fileAssociations');
  assert.match(associations, /- ext: phosphor\n\s+name: Phosphor Project\n\s+role: Editor\n\s+rank: Owner\n\s+mimeType: application\/x-phosphor/);
  for (const ext of ['ans', 'utf8ans', 'diz']) assert.match(associations, new RegExp(`- ext: ${ext}\\n\\s+name: .+\\n\\s+role: Editor\\n\\s+rank: Alternate\\n\\s+mimeType: text/x-${ext}`));
  assert.match(associations, /- ext: xb\n\s+name: .+\n\s+role: Editor\n\s+rank: Alternate\n\s+mimeType: application\/x-xbin/);

  const mac = section(yml, 'mac');
  assert.match(mac, /NSLocalNetworkUsageDescription: "Phosphor connects to rooms on your local network\."/);
  assert.match(mac, /hardenedRuntime: true/);
  assert.match(mac, /notarize: true/);
  assert.match(mac, /target: dmg/);
  assert.match(mac, /target: zip/);
  assert.equal(mac.match(/arch: \[arm64, x64\]/g)?.length, 2);

  const win = section(yml, 'win');
  assert.match(win, /target: nsis/);
  assert.match(win, /arch: \[x64, arm64\]/);
  assert.doesNotMatch(win, /signAndEditExecutable: false/);

  const linux = section(yml, 'linux');
  assert.match(linux, /- AppImage$/m);
  assert.match(linux, /- deb$/m);
});

test('the release workflow runs only on a version tag higher than the last, and a release needs the signing secrets', () => {
  const yml = read('.github/workflows/desktop.yml');
  // A release (v1.2.3), a beta (v1.2.3-beta) or an alpha (v1.2.3-alpha), the last two published as GitHub pre-releases.
  assert.match(yml, /tags: \['v\[0-9\]\+\.\[0-9\]\+\.\[0-9\]\+', 'v\[0-9\]\+\.\[0-9\]\+\.\[0-9\]\+-\*'\]/);
  assert.match(yml, /EP_PRE_RELEASE: \$\{\{ needs\.version\.outputs\.prerelease \}\}/);
  assert.doesNotMatch(yml, /workflow_dispatch|branches:|\n {2}pull_request:/);
  // One check before the three builds: the tag is package.json's version and higher than every version tag before it
  // (scripts/release-tag.mjs, tested in desktop-release-tag.test.js).
  assert.match(yml, /needs: version/);
  assert.match(yml, /node scripts\/release-tag\.mjs "\$GITHUB_REF_NAME"/);
  assert.match(yml, /prerelease: \$\{\{ steps\.tag\.outputs\.prerelease \}\}/);
  assert.match(yml, /prod: \$\{\{ steps\.tag\.outputs\.prod \}\}/); // whether the tag publishes phosphor.work
  assert.match(yml, /fetch-depth: 0/);
  assert.match(yml, /os: \[macos-latest, windows-latest, ubuntu-latest\]/);
  assert.match(yml, /contents: write/);
  for (const secret of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) {
    assert.match(yml, new RegExp(`secrets\\.${secret} \\|\\| '' \\}\\}`), secret);
  }
  assert.doesNotMatch(yml, /WIN_CSC/); // Windows isn't signed
  assert.match(yml, /GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.match(yml, /::error::/);
  assert.match(yml, /--publish always/);
  assert.doesNotMatch(yml, /--publish never/);
  assert.match(yml, /node -e "require\('electron'\)"/);
});

test('the app icon electron-builder makes every platform’s from is a 1024 px square PNG (build/make-icon.mjs draws it)', () => {
  const png = readFileSync(new URL('../../build/icon.png', import.meta.url));
  assert.equal(png.toString('latin1', 1, 4), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1024, 1024]);
});

test('the desktop flows run on a virtual screen bigger than the app’s 1400 by 900 window, not xvfb-run’s own 640 by 480', () => {
  const step = read('.github/workflows/deploy.yml').split('\n').find((line) => line.includes('xvfb-run') && line.includes('test:e2e:desktop'));
  const [, width, height] = /-screen 0 (\d+)x(\d+)x24/.exec(step) ?? [];
  assert.ok(Number(width) >= 1400 && Number(height) >= 900, step);
});

// Every platform's associations hold only what no other app owns, as Windows makes Phosphor each one's default app; the
// rest of what it opens is offered on macOS (Alternate, never the default) and Linux (by its types), and nothing it opens
// is left out of both.
test('every file the app opens is associated, and only what no other app owns becomes Phosphor\'s on Windows', () => {
  const yml = read('electron-builder.yml');
  const exts = (text) => [...text.matchAll(/- ext: (?:\[(.+)\]|(\S+))$/gm)].flatMap(([, list, one]) => (list ?? one).split(', '));
  const everywhere = exts(section(yml, 'fileAssociations'));
  assert.deepEqual(everywhere, ['pho', 'phosphor', 'ans', 'utf8ans', 'diz', 'xb']);
  const mac = exts(section(yml, 'mac'));
  assert.deepEqual([...everywhere, ...mac].sort(), [...OPENABLE].sort());
  assert.equal(section(yml, 'mac').match(/rank: (\w+)/g).join(), 'rank: Alternate,rank: Alternate,rank: Alternate');
  assert.doesNotMatch(section(yml, 'win'), /fileAssociations/);
  const linux = /mimeTypes: \[(.+)\]/.exec(section(yml, 'linux'))[1].split(', ');
  for (const type of ['text/x-nfo', 'text/plain', 'image/png', 'image/jpeg', 'image/svg+xml']) assert.ok(linux.includes(type), type);
});

// A .pho is a PNG, so each system's own PNG thumbnailer previews it once the system knows that (on macOS, the app's own).
test('a .pho is declared a kind of PNG on macOS, Windows and Linux', () => {
  const yml = read('electron-builder.yml');
  assert.match(section(yml, 'fileAssociations'), /- ext: pho\n\s+name: Phosphor Project\n\s+role: Editor\n\s+rank: Owner\n\s+mimeType: image\/x-phosphor/);

  // macOS: an exported type conforming to public.png, and the pho document type bound to it (electron-builder writes
  // only the extension).
  const mac = section(yml, 'mac');
  assert.match(mac, /UTExportedTypeDeclarations:\n\s+- UTTypeIdentifier: work\.phosphor\.pho\n\s+UTTypeConformsTo: \[public\.png, public\.image\]\n\s+UTTypeDescription: Phosphor Project\n\s+UTTypeTagSpecification:\n\s+public\.filename-extension: \[pho\]\n\s+public\.mime-type: image\/x-phosphor/);
  assert.match(mac, /CFBundleDocumentTypes:\n\s+- CFBundleTypeName: Phosphor Project\n(?:\s+\w+: .+\n)*?\s+LSItemContentTypes: \[work\.phosphor\.pho\]/);
  // Finder's thumbnail is the app's own extension's, as the system's image thumbnailer refuses a type it doesn't know:
  // built into the app after packing and signed sandboxed before the app (build/thumbnail.mjs), for that type only.
  assert.match(yml, /^afterPack: \.\/build\/thumbnail\.mjs$/m);
  assert.match(mac, /^ {2}sign: \.\/build\/thumbnail\.mjs$/m);
  const info = read('build/thumbnail/Info.plist');
  assert.match(info, /<key>CFBundleIdentifier<\/key>\s*<string>work\.phosphor\.app\.thumbnail<\/string>/);
  assert.match(info, /<key>NSExtensionPointIdentifier<\/key>\s*<string>com\.apple\.quicklook\.thumbnail<\/string>/);
  assert.match(info, /<key>QLSupportedContentTypes<\/key>\s*<array>\s*<string>work\.phosphor\.pho<\/string>\s*<\/array>/);
  assert.match(info, /<key>NSExtensionPrincipalClass<\/key>\s*<string>ThumbnailProvider<\/string>/);
  assert.match(read('build/thumbnail/ThumbnailProvider.swift'), /@objc\(ThumbnailProvider\)/);
  assert.match(read('build/thumbnail/entitlements.plist'), /<key>com\.apple\.security\.app-sandbox<\/key>\s*<true\/>/);

  // Windows: the installer points .pho at the system's photo thumbnail provider and takes it away on uninstall.
  assert.match(section(yml, 'nsis'), /include: build\/installer\.nsh/);
  const nsh = read('build/installer.nsh');
  const macro = (name) => new RegExp(`!macro ${name}\\n([\\s\\S]*?)!macroend`).exec(nsh)?.[1] ?? '';
  const thumbnails = 'SHCTX "Software\\Classes\\.pho\\ShellEx\\{e357fccd-a995-4576-b01f-234630154e96}"';
  assert.ok(macro('customInstall').includes(`WriteRegStr ${thumbnails} "" "{C7657C4A-9F68-40fa-A4DF-96BC08EB3551}"`));
  assert.ok(macro('customInstall').includes('WriteRegStr SHCTX "Software\\Classes\\.pho" "PerceivedType" "image"'));
  assert.ok(macro('customUnInstall').includes(`DeleteRegKey ${thumbnails}`));
  assert.ok(macro('customUnInstall').includes('DeleteRegValue SHCTX "Software\\Classes\\.pho" "PerceivedType"'));

  // Linux: the .deb installs image/x-phosphor as a subclass of image/png, beside the type electron-builder writes.
  assert.match(section(yml, 'deb'), /- build\/phosphor-mime\.xml=\/usr\/share\/mime\/packages\/phosphor-pho\.xml/);
  const xml = read('build/phosphor-mime.xml');
  assert.match(xml, /<mime-type type="image\/x-phosphor">[\s\S]*<sub-class-of type="image\/png"\/>[\s\S]*<glob pattern="\*\.pho"\/>[\s\S]*<\/mime-type>/);
  // and a thumbnailer for the type itself, for file managers that look thumbnailers up by the exact type.
  assert.match(section(yml, 'deb'), /- build\/phosphor\.thumbnailer=\/usr\/share\/thumbnailers\/phosphor\.thumbnailer/);
  const thumbnailer = read('build/phosphor.thumbnailer');
  assert.match(thumbnailer, /^\[Thumbnailer Entry\]$/m);
  assert.match(thumbnailer, /^TryExec=gdk-pixbuf-thumbnailer$/m);
  assert.match(thumbnailer, /^Exec=gdk-pixbuf-thumbnailer -s %s %u %o$/m);
  assert.match(thumbnailer, /^MimeType=image\/x-phosphor;$/m);
});
