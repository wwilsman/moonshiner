import { Chrome } from './chrome.js';
import { Firefox } from './firefox.js';

export {
  Chrome,
  Chrome as chrome,
  Firefox,
  Firefox as firefox
};

const Browsers = {
  Chrome,
  chrome: Chrome,
  Firefox,
  firefox: Firefox
};

export function resolveBrowser(browser, server) {
  if (typeof browser === 'string') browser = { name: browser };
  if (typeof browser?.name !== 'string') return;
  let { name, ...options } = browser;

  if (!Browsers[name])
    throw new Error(`Unknown browser "${name}"`);

  return new Browsers[name](server, options);
}
