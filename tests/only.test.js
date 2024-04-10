import { describe, test } from 'moonshiner';

describe('should run', () => {
  test('should not run', () => {
    throw new Error('should have skipped');
  });

  test.only('should run first', () => {
    // nothing to assert
  });

  test('should also not run', () => {
    throw new Error('should have also skipped');
  });

  describe.only('should run these too', () => {
    test('should run second', () => {});

    test('should run third', async t => {
      await t.test('should run fourth', { only: true }, () => {});

      await t.test('should not run subtest', () => {
        throw new Error('should have skipped subtest');
      });
    });

    describe('should also run this', () => {
      test('should run fifth', () => {});
    });
  });

  describe('should not run these', () => {
    test('should not run this', () => {
      throw new Error('should have skipped this');
    });

    test('should not run that', () => {
      throw new Error('should have skipped that');
    });

    describe('except for one of these', () => {
      test.only('should run sixth', () => {});

      test('should not run this one', () => {
        throw new Error('should have skipped this one');
      });
    });
  });
});
