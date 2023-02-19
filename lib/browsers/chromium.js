import * as url from 'node:url';
import * as path from 'node:path';
import createBrowserLauncher from './base.js';

export const launch = createBrowserLauncher({
  name: 'Chromium',
  revision: '1083080', // 110.0.5479.0

  downloadDir: ({ revision }) => path.resolve(
    url.fileURLToPath(import.meta.url),
    '../../../.local-chromium',
    revision
  ),

  downloadUrl: ({ revision, platform }) => (
    'https://storage.googleapis.com/chromium-browser-snapshots/' + {
      linux: `Linux_x64/${revision}/chrome-linux.zip`,
      darwin: `Mac/${revision}/chrome-mac.zip`,
      darwinArm: `Mac_Arm/${revision}/chrome-mac.zip`,
      win64: `Win_x64/${revision}/chrome-win.zip`,
      win32: `Win/${revision}/chrome-win.zip`
    }[platform]
  ),

  // @todo: make default
  extractFile: async (archive, dir) => {
    let { default: unzip } = await import('extract-zip');
    return unzip(archive, { dir });
  },

  executablePath: ({ platform }) => ({
    linux: path.join('chrome-linux', 'chrome'),
    win64: path.join('chrome-win', 'chrome.exe'),
    win32: path.join('chrome-win', 'chrome.exe'),
    darwin: path.join('chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    darwinArm: path.join('chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
  }[platform]),

  launchArgs: ({ profile, headless }) => [
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
    '--remote-debugging-port=0',
    // add headless mode and associated flags
    headless && ['--headless', '--hide-scrollbars', '--mute-audio'],
    // use the provided profile directory
    profile && `--user-data-dir=${profile}`
  ]
});

export default launch;
