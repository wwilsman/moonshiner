import { createBrowserLauncher } from './browsers/base.js';
import { default as chromium } from './browsers/chromium.js';

const LAUNCHERS = { chromium };

export function launchBrowser(url, options, hook) {
  if (typeof options === 'function')
    [options, hook] = [hook, options];

  let launcher = !options?.executablePath
    ? LAUNCHERS[options?.name ?? 'chromium']
    : createBrowserLauncher();

  if (!launcher)
    throw new Error(`Unable to install browser: ${options.name}`);

  return launcher(url, options, hook);
}

export {
  createBrowserLauncher,
  chromium
};
