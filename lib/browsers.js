import { createBrowserLauncher } from './browsers/base.js';
import { default as chromium } from './browsers/chromium.js';
import { default as firefox } from './browsers/firefox.js';

const LAUNCHERS = { chromium, firefox };

export function launch(url, options) {
  if (options?.name && !LAUNCHERS[options.name])
    throw new Error(`Unable to install browser: ${options.name}`);

  return !options?.executablePath
    ? LAUNCHERS[options?.name ?? 'chromium'](url, options)
    : createBrowserLauncher(options)(url);
}

export {
  createBrowserLauncher,
  chromium,
  firefox
};

export * as default from './browsers.js';
