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
  expectExitCode = 0,
  transformOutput = l => l
} = {}) {
  let snapshot = join(snapshotDirectory, snapshotName);
  let deferred = new DeferredPromise();
  let output = [];

  let push = (type, chunk) => output.push(...(
    chunk.toString().split(/(?<=\n)/).map(line => ({
      [type]: transformOutput(line)
    }))
  ));

  proc.stdout.on('data', chunk => push('stdout', chunk));
  proc.stderr.on('data', chunk => push('stderr', chunk));
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
