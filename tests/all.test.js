import { describe, test } from 'moonshiner';
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

  test('abort tests', async () => {
    await testFork('tests/abort.test.js', {
      expectExitCode: 1
    });
  });

  test('remote tests', async () => {
    await testFork('tests/remote.test.js');
  });

  test('remote isolated tests', async () => {
    await testFork('tests/remote.only.test.js');
  });

  test('browser tests', async () => {
    await testFork('tests/browser.test.js', {
      expectExitCode: 1,
      transformOutput: line => line
        .replace(
          /(Screenshot .* failed for) (.*)/,
          '$1 <browser>')
        .replace(
          /ws:\/\/localhost:(\d+)\/(.+)\/?/,
          'ws://localhost:<port>/<remote_id>')
        .replace(
          /localhost:(\d+)/,
          'localhost:<port>')
        .replace(
          /\d+\.\d{1,3}/,
          '<ms>')
    });
  });

  test('browser abort tests', async () => {
    await testFork('tests/browser.abort.test.js', {
      expectExitCode: 1,
      transformOutput: line => line
        .replace(
          /localhost:(\d+)/,
          'localhost:<port>')
        .replace(
          /\d+\.\d{1,3}/,
          '<ms>')
    });
  });

  test('dot reporter', async () => {
    await testFork('tests/dot.test.js');
  });

  test('tap reporter', async () => {
    await testFork('tests/tap.test.js', {
      transformOutput: line => line
        .replace(
          /\d+\.\d{1,3}/,
          '<ms>')
    });
  });

  test('cli command', async () => {
    await testSpawn(['bin/moonshiner']);
  });
});
