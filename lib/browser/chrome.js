import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Browser } from './base.js';
import { getFreePort } from '../util/port.js';

export class Chrome extends Browser {
  name = 'Google Chrome';

  async #getRevision() {
    if (this.revision) return this.revision;

    let res = await fetch(
      'https://googlechromelabs.github.io/' +
      'chrome-for-testing/last-known-good-versions.json');

    if (res.statusCode && res.statusCode >= 400)
      throw new Error(`${this.name} version not found ${res.statusCode}`);

    try {
      let { channels } = await res.json();
      return this.revision = channels.Stable.version;
    } catch (cause) {
      throw new Error(`${this.name} version not found`, { cause });
    }
  }

  async getDownloadUrl() {
    let base = 'https://storage.googleapis.com/chrome-for-testing-public';
    let revision = await this.#getRevision();

    return `${base}/${revision}/` + {
      linux: 'linux64/chrome-linux64.zip',
      darwin: 'mac-x64/chrome-mac-x64.zip',
      darwinArm: 'mac-arm64/chrome-mac-arm64.zip',
      win64: 'win64/chrome-win64.zip',
      win32: 'win32/chrome-win32.zip'
    }[this.platform];
  }

  async getInstallPath() {
    return path.resolve(
      fileURLToPath(import.meta.url),
      '../../../.local-chrome',
      await this.#getRevision()
    );
  }

  async getExecutablePath() {
    return this.executablePath ??= path.join(
      await this.getInstallPath(), ...({
        linux: ['chrome-linux64', 'chrome'],
        win32: ['chrome-win32', 'chrome.exe'],
        win64: ['chrome-win64', 'chrome.exe'],
        darwin: ['chrome-mac-x64',
          'Google Chrome for Testing.app', 'Contents', 'MacOS',
          'Google Chrome for Testing'],
        darwinArm: ['chrome-mac-arm64',
          'Google Chrome for Testing.app', 'Contents', 'MacOS',
          'Google Chrome for Testing']
      }[this.platform]));
  }

  async getDevToolsPort() {
    return this.devToolsPort ??= await getFreePort();
  }

  async getLaunchArgs(url) {
    return [
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
      `--remote-debugging-port=${await this.getDevToolsPort()}`,
      // set an explicit window size to launch at
      `--window-size=${this.width},${this.height}`,
      // add headless mode and associated flags
      this.headless && ['--headless', '--hide-scrollbars', '--mute-audio'],
      // show devtools when debugging
      this.debug && '--auto-open-devtools-for-tabs',
      // specify the profile directory
      this.profile && `--user-data-dir=${this.profile}`,
      // additional args
      this.launchArgs,
      // target url
      url
    ];
  }
}
