// The desktop end-to-end run's setup (playwright.desktop.config.js): the desktop build, once, for every spec's apps.
import { execSync } from 'node:child_process';

export default function build() {
  execSync('npm run build:desktop', { stdio: 'inherit' });
}
