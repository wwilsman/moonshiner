import { describe, test } from 'moonshiner';

describe('should run', () => {
  test('should run first', () => {
    // nothing to assert
  });

  test.skip('should not run', () => {
    throw new Error('should have skipped');
  });

  describe('should run these too', () => {
    test('should run second', () => {});

    test('should run third', async t => {
      await t.test('should run fourth', () => {});

      await t.test('should not run subtest', { skip: true }, () => {
        throw new Error('should have skipped subtest');
      });
    });

    describe('should also not run this', () => {
      test.skip('should not run deeply nested', () => {
        throw new Error('should have skipped deeply nested');
      });
    });
  });

  describe.skip('should not run these', () => {
    test('should not run this', () => {
      throw new Error('should have skipped this');
    });

    test('should not run that', () => {
      throw new Error('should have skipped that');
    });

    describe('or this one', () => {
      test('should not run this one', () => {
        throw new Error('should have skipped this one');
      });
    });
  });
});
