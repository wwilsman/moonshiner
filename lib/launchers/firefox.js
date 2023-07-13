import * as url from 'node:url';
import * as path from 'node:path';
import { createBrowserLauncher } from './browser.js';

async function getLatestRevision() {
  let res = await fetch('https://product-details.mozilla.org/1.0/firefox_versions.json');

  if (res.statusCode && res.statusCode >= 400)
    throw new Error(`Firefox version not found ${res.statusCode}`);

  try { return (await res.json()).FIREFOX_NIGHTLY; } catch {
    throw new Error('Firefox version not found');
  }
}

export const firefox = createBrowserLauncher({
  name: 'Firefox',
  revision: 'latest',
  optionsKey: 'firefox',

  downloadDir: ({ revision }) => path.resolve(
    url.fileURLToPath(import.meta.url),
    '../../../.local-firefox',
    revision
  ),

  downloadUrl: async ({ revision, platform }) => (
    'https://archive.mozilla.org/pub/firefox/nightly/latest-mozilla-central/' +
    `firefox-${revision === 'latest' ? await getLatestRevision() : revision}.en-US.` + {
      linux: 'linux-x86_64.tar.bz2',
      darwin: 'mac.dmg',
      darwinArm: 'mac.dmg',
      win64: 'win64.zip',
      win32: 'win32.zip'
    }[platform]
  ),

  executablePath: ({ platform }) => ({
    linux: path.join('firefox', 'firefox'),
    win64: path.join('firefox', 'firefox.exe'),
    win32: path.join('firefox', 'firefox.exe'),
    darwin: path.join('Firefox Nightly.app', 'Contents', 'MacOS', 'firefox'),
    darwinArm: path.join('Firefox Nightly.app', 'Contents', 'MacOS', 'firefox')
  }[platform]),

  launchArgs: ({ url, args, profile, headless, width, height }) => [
    // allow multiple processes
    '--no-remote',
    // make active
    '--foreground',
    // set window dimensions
    ['--width', width],
    ['--height', height],
    // add headless mode flags
    headless && '--headless',
    // use the provided profile directory
    profile && ['--profile', profile],
    // additional args
    args,
    // target url
    url
  ]
});

export default firefox;
