import {
  strict as assert
} from 'node:assert';

import {
  describe,
  test,
  before,
  beforeEach,
  after,
  afterEach
} from 'moonshiner';

const results = {};
const count = k => (results[k] = (results[k] ?? 0) + 1);

before(() => count('didRunRootBefore'));
beforeEach(() => count('didRunRootBeforeEach'));
afterEach(() => count('didRunRootAfterEach'));

after(() => {
  count('didRunRootAfter');
  assert.deepEqual(results, {
    didRunRootBefore: 1,
    didRunSuiteBefore: 1,
    didRunNestedBefore: 1,
    didRunRootBeforeEach: 5,
    didRunSuiteBeforeEach: 3,
    didRunNestedBeforeEach: 2,
    didRunTest: 5,
    didRunNestedAfterEach: 2,
    didRunSuiteAfterEach: 3,
    didRunRootAfterEach: 5,
    didRunNestedAfter: 1,
    didRunSuiteAfter: 1,
    didRunRootAfter: 1
  });
});

test('should run first', () => {
  count('didRunTest');
  assert.deepEqual(results, {
    didRunRootBefore: 1,
    didRunRootBeforeEach: 1,
    didRunTest: 1
  });
});

describe('within a suite', () => {
  before(() => count('didRunSuiteBefore'));
  beforeEach(() => count('didRunSuiteBeforeEach'));
  afterEach(() => count('didRunSuiteAfterEach'));

  after(() => {
    count('didRunSuiteAfter');
    assert.deepEqual(results, {
      didRunRootBefore: 1,
      didRunSuiteBefore: 1,
      didRunNestedBefore: 1,
      didRunRootBeforeEach: 4,
      didRunSuiteBeforeEach: 3,
      didRunNestedBeforeEach: 2,
      didRunTest: 4,
      didRunNestedAfterEach: 2,
      didRunSuiteAfterEach: 3,
      didRunRootAfterEach: 4,
      didRunNestedAfter: 1,
      didRunSuiteAfter: 1
    });
  });

  test('should run second', () => {
    count('didRunTest');
    assert.deepEqual(results, {
      didRunRootBefore: 1,
      didRunSuiteBefore: 1,
      didRunRootBeforeEach: 2,
      didRunSuiteBeforeEach: 1,
      didRunTest: 2,
      didRunRootAfterEach: 1
    });
  });

  describe('within a nested suite', () => {
    before(() => count('didRunNestedBefore'));
    beforeEach(() => count('didRunNestedBeforeEach'));
    afterEach(() => count('didRunNestedAfterEach'));

    after(() => {
      count('didRunNestedAfter');
      assert.deepEqual(results, {
        didRunRootBefore: 1,
        didRunSuiteBefore: 1,
        didRunNestedBefore: 1,
        didRunRootBeforeEach: 4,
        didRunSuiteBeforeEach: 3,
        didRunNestedBeforeEach: 2,
        didRunTest: 4,
        didRunNestedAfterEach: 2,
        didRunSuiteAfterEach: 3,
        didRunRootAfterEach: 4,
        didRunNestedAfter: 1
      });
    });

    test('should run third', async t => {
      count('didRunTest');
      assert.deepEqual(results, {
        didRunRootBefore: 1,
        didRunSuiteBefore: 1,
        didRunNestedBefore: 1,
        didRunRootBeforeEach: 3,
        didRunSuiteBeforeEach: 2,
        didRunNestedBeforeEach: 1,
        didRunTest: 3,
        didRunSuiteAfterEach: 1,
        didRunRootAfterEach: 2
      });

      await t.test('should run fourth', () => {
        count('didRunTest');
        assert.deepEqual(results, {
          didRunRootBefore: 1,
          didRunSuiteBefore: 1,
          didRunNestedBefore: 1,
          didRunRootBeforeEach: 4,
          didRunSuiteBeforeEach: 3,
          didRunNestedBeforeEach: 2,
          didRunTest: 4,
          didRunSuiteAfterEach: 1,
          didRunRootAfterEach: 2
        });
      });
    });
  });
});

test('should run fifth', () => {
  count('didRunTest');
  assert.deepEqual(results, {
    didRunRootBefore: 1,
    didRunSuiteBefore: 1,
    didRunNestedBefore: 1,
    didRunRootBeforeEach: 5,
    didRunSuiteBeforeEach: 3,
    didRunNestedBeforeEach: 2,
    didRunTest: 5,
    didRunNestedAfterEach: 2,
    didRunSuiteAfterEach: 3,
    didRunRootAfterEach: 4,
    didRunNestedAfter: 1,
    didRunSuiteAfter: 1
  });
});
