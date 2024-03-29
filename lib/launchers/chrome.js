import * as url from 'node:url';
import * as path from 'node:path';
import { getFreePort } from '../utils/port.js';
import { createBrowserLauncher } from './browser.js';

const channels = ['Stable', 'Beta', 'Dev', 'Canary'];

async function getLatestRevision(channel) {
  let res = await fetch('https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json');

  if (res.statusCode && res.statusCode >= 400)
    throw new Error(`Google Chrome for Testing version not found ${res.statusCode}`);

  try { return (await res.json()).channels[channel].version; } catch {
    throw new Error('Google Chrome for Testing version not found');
  }
}

export const chrome = createBrowserLauncher({
  name: 'Google Chrome for Testing',
  revision: 'Stable',
  optionsKey: 'chrome',

  downloadDir: ({ revision }) => path.resolve(
    url.fileURLToPath(import.meta.url),
    '../../../.local-chrome',
    revision
  ),

  downloadUrl: async ({ revision, platform }) => (
    'https://storage.googleapis.com/chrome-for-testing-public/' +
    `${channels.includes(revision) ? await getLatestRevision(revision) : revision}/` + {
      linux: 'linux64/chrome-linux64.zip',
      darwin: 'mac-x64/chrome-mac-x64.zip',
      darwinArm: 'mac-arm64/chrome-mac-arm64.zip',
      win64: 'win64/chrome-win64.zip',
      win32: 'win32/chrome-win32.zip'
    }[platform]
  ),

  executablePath: ({ name, platform }) => ({
    linux: path.join('chrome-linux64', 'chrome'),
    win32: path.join('chrome-win64', 'chrome.exe'),
    win64: path.join('chrome-win64', 'chrome.exe'),
    darwin: path.join('chrome-mac-x64', `${name}.app`, 'Contents', 'MacOS', name),
    darwinArm: path.join('chrome-mac-arm64', `${name}.app`, 'Contents', 'MacOS', name)
  }[platform]),

  devtoolsPort: () => getFreePort(),
  launchArgs: ({ url, args, profile, debug, headless, devtoolsPort, width, height }) => [
    // disable the translate popup
    '--disable-features=Translate',
    // disable several subsystems which run network requests in the background
    '--disable-background-networking',
    // disable task throttling of timer tasks from background pages
    '--disable-background-timer-throttling',
    // disable backgrounding renderer processes
    '--disable-renderer-backgrounding',
    // disable backgrounding renderers for occluded windows (reduce nondeterminism)
    '--disable-backgrounding-occluded-windows',
    // disable crash reporting
    '--disable-breakpad',
    // disable client side phishing detection
    '--disable-client-side-phishing-detection',
    // disable default component extensions with background pages for performance
    '--disable-component-extensions-with-background-pages',
    // disable installation of default apps on first run
    '--disable-default-apps',
    // work-around for environments where a small /dev/shm partition causes crashes
    '--disable-dev-shm-usage',
    // disable extensions
    '--disable-extensions',
    // disable hang monitor dialogs in renderer processes
    '--disable-hang-monitor',
    // disable inter-process communication flooding protection for javascript
    '--disable-ipc-flooding-protection',
    // disable web notifications and the push API
    '--disable-notifications',
    // disable the prompt when a POST request causes page navigation
    '--disable-prompt-on-repost',
    // disable syncing browser data with google accounts
    '--disable-sync',
    // disable site-isolation to make network requests easier to intercept
    '--disable-site-isolation-trials',
    // disable the first run tasks, whether or not it's actually the first run
    '--no-first-run',
    // disable the sandbox for all process types that are normally sandboxed
    '--no-sandbox',
    // enable indication that browser is controlled by automation
    '--enable-automation',
    // specify a consistent encryption backend across platforms
    '--password-store=basic',
    // use a mock keychain on Mac to prevent blocking permissions dialogs
    '--use-mock-keychain',
    // enable remote debugging on the first available port
    `--remote-debugging-port=${devtoolsPort}`,
    // set an explicit window size to launch at
    `--window-size=${width},${height}`,
    // add headless mode and associated flags
    headless && ['--headless', '--hide-scrollbars', '--mute-audio'],
    // show devtools when debugging
    debug && '--auto-open-devtools-for-tabs',
    // use the provided profile directory
    profile && `--user-data-dir=${profile}`,
    // additional args
    args,
    // target url
    url
  ]
});

export default chrome;
