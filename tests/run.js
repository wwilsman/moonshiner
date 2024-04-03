import { fork } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert/strict';
import { join } from 'node:path';

import { describe, test } from '../lib/harness.js';
import { DeferredPromise } from '../lib/util/promise.js';

const updateSnapshots = process.argv.includes('--update-snapshots');

const snapshotDirectory = 'tests/__snapshots__';
await mkdir(snapshotDirectory, { recursive: true });

async function runTests(file, {
  expectExitCode = 0
} = {}) {
  let name = file.replaceAll(/^tests\/|\.test\.js$/g, '');
  let snapshot = join(snapshotDirectory, name);
  let child = fork(file, { silent: true });
  let deferred = new DeferredPromise();
  let output = [];

  child.stdout.on('data', chunk => output.push(...(
    chunk.toString().split(/(?<=\n)/).map(stdout => ({ stdout })))));
  child.stderr.on('data', chunk => output.push(...(
    chunk.toString().split(/(?<=\n)/).map(stderr => ({ stderr })))));
  child.on('error', deferred.reject);
  child.on('exit', deferred.resolve);

  let exitCode = await deferred;
  let result = output.map(l => JSON.stringify(l)).join('\n');
  let expected = await readFile(snapshot, 'utf-8').catch(() => {});
  if (expected == null || updateSnapshots) writeFile(snapshot, result);
  else assert.equal(result, expected);

  assert.equal(exitCode, expectExitCode, (
    `Expected exit code ${expectExitCode} but received ${exitCode}`
  ));
};

describe('Moonshiner', { timeout: 0 }, () => {
  test('test harness', async () => {
    await runTests('tests/harness.test.js');
  });

  test('isolated tests', async () => {
    await runTests('tests/only.test.js');
  });

  test('skipped tests', async () => {
    await runTests('tests/skip.test.js');
  });

  test('remote tests', async () => {
    await runTests('tests/remote.test.js');
  });

  test('browser tests', async () => {
    await runTests('tests/browser.test.js');
  });
});
