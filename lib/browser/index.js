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

export function resolveBrowser(browser, ...args) {
  if (typeof browser !== 'string') return browser;
  if (!Browsers[browser]) throw new Error(`Unknown browser "${browser}"`);
  return new Browsers[browser](...args);
}
