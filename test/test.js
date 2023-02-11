import { describe, use, run } from 'moonshiner';
import reporters from 'moonshiner/reporters';

use(reporters.emoji());

describe('Test', test => {
  test.it('works', () => {});
  test.it('fails', () => Promise.reject(new Error));
  test.describe('mixed', nested => {
    nested.it('nested', () => {});
    test.it('still works', () => {});
    describe('still fine', () => {
      test.it('keeps working', () => {});
      nested.it('fingers crossed');
    });
  });
});

run();
