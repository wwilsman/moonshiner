import { describe, test } from '../lib/harness.js';
import { testFork, testSpawn } from './helpers.js';

describe('Moonshiner', { timeout: 0 }, () => {
  test('test harness', async () => {
    await testFork('tests/harness.test.js');
  });

  test('isolated tests', async () => {
    await testFork('tests/only.test.js');
  });

  test('skipped tests', async () => {
    await testFork('tests/skip.test.js');
  });

  test('remote tests', async () => {
    await testFork('tests/remote.test.js');
  });

  test('browser tests', async () => {
    await testFork('tests/browser.test.js', {
      expectExitCode: 1,
      transformOutput: line => line
        .replace(
          /ws:\/\/localhost:(\d+)\/(.+)?\/?/,
          'ws://localhost:<port>/<remote_id>')
        .replace(/\d+\.\d{1,3}/, '<ms>')
    });
  });

  test('dot reporter', async () => {
    await testFork('tests/dot.test.js');
  });

  test('tap reporter', async () => {
    await testFork('tests/tap.test.js', {
      transformOutput: line => line
        .replace(/\d+\.\d{1,3}/, '<ms>')
    });
  });

  test('cli command', async () => {
    await testSpawn(['bin/moonshiner']);
  });
});
