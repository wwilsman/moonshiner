/**
 * Comprehensive test suite for HTML Reporter
 * Run with: node tests/html-reporter.test.js
 * With coverage: c8 node tests/html-reporter.test.js
 */

import { describe, test, configure } from '../lib/harness.node.js';
import assert from 'node:assert';

configure({
  reporters: [
    'spec',
    {
      name: 'html',
      outputDir: 'test-reports',
      title: 'HTML Reporter Test Suite'
    }
  ]
});

describe('HTML Reporter Features', () => {
  describe('Passing tests', () => {
    test('simple passing test', () => {
      assert.ok(true);
    });

    test('with console output', () => {
      console.log('Test log message');
      console.warn('Warning message');
      console.error('Error message (in passing test)');
      assert.equal(1 + 1, 2);
    });

    test('with assertions', () => {
      assert.strictEqual(42, 42);
      assert.deepStrictEqual({ a: 1 }, { a: 1 });
      assert.ok(true);
    });
  });

  describe('Failing tests', () => {
    test('with assertion error', () => {
      assert.strictEqual(1, 2, 'Expected 1 to equal 2');
    });

    test('with thrown error', () => {
      throw new Error('Custom error message with details');
    });

    test('with stack trace', () => {
      function deepFunction() {
        function nestedFunction() {
          throw new Error('Deep nested error');
        }
        nestedFunction();
      }
      deepFunction();
    });

    test('with type error', () => {
      const obj = null;
      obj.property; // Will throw TypeError
    });
  });

  describe('Skipped tests', () => {
    test.skip('skipped test 1', () => {
      assert.fail('This should not run');
    });

    test.skip('skipped test 2', () => {
      throw new Error('This should not throw');
    });
  });

  describe('Deeply nested suites', () => {
    describe('Level 2', () => {
      test('test at level 2', () => {
        assert.ok(true);
      });

      describe('Level 3', () => {
        test('test at level 3', () => {
          console.log('Deep nesting works!');
          assert.ok(true);
        });

        describe('Level 4', () => {
          test('deeply nested passing test', () => {
            assert.strictEqual(Math.PI > 3, true);
          });

          test('deeply nested failing test', () => {
            assert.strictEqual('foo', 'bar', 'Strings do not match');
          });
        });
      });
    });
  });

  describe('Mixed results suite', () => {
    test('pass 1', () => assert.ok(true));
    test('fail 1', () => assert.fail('Intentional failure'));
    test('pass 2', () => assert.ok(true));
    test.skip('skip 1', () => assert.fail());
    test('pass 3', () => assert.ok(true));
    test('fail 2', () => { throw new Error('Another failure'); });
  });

  describe('Edge cases', () => {
    test('empty test', () => {
      // No assertions, should pass
    });

    test('test with unicode characters: 你好 🚀 ✨', () => {
      console.log('Unicode in console: 🎉 测试 ✓');
      assert.ok(true);
    });

    test('test with very long error message', () => {
      const longMessage = 'This is a very long error message that should be displayed properly in the HTML report. '.repeat(10);
      throw new Error(longMessage);
    });

    test('test with special characters in name: <script>alert("xss")</script>', () => {
      assert.ok(true);
    });
  });
});

// Top-level test (not in a describe block)
test('standalone top-level test', () => {
  console.log('This test is at the root level');
  // This test runs in both Node and browser environments
  assert.ok(true);
});

describe('Performance tests', () => {
  test('async test with delay', async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(true);
  });

  test('test with multiple console calls', () => {
    for (let i = 0; i < 5; i++) {
      console.log(`Iteration ${i}`);
    }
    assert.ok(true);
  });
});
