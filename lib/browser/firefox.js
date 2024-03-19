import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Browser } from './base.js';
import { getFreePort } from '../util/port.js';

export class Firefox extends Browser {
  name = 'Firefox';

  async #getRevision() {
    if (this.revision) return this.revision;
    let res = await fetch('https://product-details.mozilla.org/1.0/firefox_versions.json');

    if (res.statusCode && res.statusCode >= 400)
      throw new Error(`${this.name} version not found ${res.statusCode}`);

    try {
      let { FIREFOX_NIGHTLY } = await res.json();
      return this.revision = FIREFOX_NIGHTLY;
    } catch (cause) {
      throw new Error(`${this.name} version not found`, { cause });
    }
  }

  async getDownloadUrl() {
    let base = 'https://archive.mozilla.org/pub/firefox/nightly/latest-mozilla-central';
    let revision = await this.#getRevision();

    return `${base}/firefox-${revision}.en-US.` + {
      linux: 'linux-x86_64.tar.bz2',
      darwin: 'mac.dmg',
      darwinArm: 'mac.dmg',
      win64: 'win64.zip',
      win32: 'win32.zip'
    }[this.platform];
  }

  async getInstallPath() {
    return path.resolve(
      fileURLToPath(import.meta.url),
      '../../../.local-firefox',
      await this.#getRevision()
    );
  }

  async getExecutablePath() {
    return this.executablePath ??= path.join(
      await this.getInstallPath(), ...({
        linux: ['firefox', 'firefox'],
        win65: ['firefox', 'firefox.exe'],
        win32: ['firefox', 'firefox.exe'],
        darwin: ['Firefox Nightly.app', 'Contents', 'MacOS', 'firefox'],
        darwinArm: ['Firefox Nightly.app', 'Contents', 'MacOS', 'firefox']
      }[this.platform]));
  }

  async getDevToolsPort() {
    return this.devToolsPort ??= await getFreePort();
  }

  async getLaunchArgs(url) {
    return [
      // allow multiple processes
      '--no-remote',
      // make active
      '--foreground',
      // set window dimensions
      ['--width', this.width],
      ['--height', this.height],
      // enable remote debugging on the first available port
      ['--remote-debugging-port', await this.getDevToolsPort()],
      // add headless mode flags
      this.headless && '--headless',
      // show devtools when debugging
      this.debug && '--devtools',
      // specify the profile directory
      this.profile && ['--profile', this.profile],
      // additional args
      this.launchArgs,
      // target url
      url
    ];
  }
}
