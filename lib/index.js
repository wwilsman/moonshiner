import { createTestRunner } from './runner.js';

const runner = createTestRunner();

export const it = runner.it;
export const describe = runner.describe;
export const beforeAll = runner.beforeAll;
export const afterAll = runner.afterAll;
export const beforeEach = runner.beforeEach;
export const afterEach = runner.afterEach;
export const use = runner.use;
export const run = runner.run;

// @todo: context aware configure
export function configure({ use, timeout }) {
  if (use) runner.use(...(Array.isArray(use) ? use : [use]));
  if (timeout) runner.timeout(timeout);
}
