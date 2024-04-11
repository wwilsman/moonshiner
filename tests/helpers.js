import { fork, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert/strict';
import { join } from 'node:path';

import { DeferredPromise } from '../lib/util/promise.js';

const updateSnapshots = process.argv.includes('--update-snapshots');

const snapshotDirectory = 'tests/__snapshots__';
await mkdir(snapshotDirectory, { recursive: true });

export async function testProcess(proc, {
  snapshotName,
  expectExitCode = 0
} = {}) {
  let snapshot = join(snapshotDirectory, snapshotName);
  let deferred = new DeferredPromise();
  let output = [];

  proc.stdout.on('data', chunk => output.push(...(
    chunk.toString().split(/(?<=\n)/).map(stdout => ({ stdout })))));
  proc.stderr.on('data', chunk => output.push(...(
    chunk.toString().split(/(?<=\n)/).map(stderr => ({ stderr })))));
  proc.on('error', deferred.reject);
  proc.on('exit', deferred.resolve);

  let exitCode = await deferred;
  let result = output.map(l => JSON.stringify(l)).join('\n');
  let expected = await readFile(snapshot, 'utf-8').catch(() => {});
  if (expected == null || updateSnapshots) writeFile(snapshot, result);
  else assert.equal(result, expected);

  assert.equal(exitCode, expectExitCode, (
    `Expected exit code ${expectExitCode} but received ${exitCode}`
  ));
}

export async function testFork(name, options) {
  await testProcess(fork(name, { silent: true }), {
    snapshotName: name.replaceAll(/^tests\/|\.test\.js$/g, ''),
    ...options
  });
}

export async function testSpawn([cmd, ...args], options) {
  await testProcess(spawn(cmd, args, { silent: true }), {
    snapshotName: [cmd.replace(/^bin\//, ''), ...args].join(' '),
    ...options
  });
}
