import { describe, test } from 'moonshiner';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  mkdtemp, writeFile, readFile, access, rm,
  mkdir, copyFile, symlink, readlink, stat
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ChromeLauncher } from '../lib/browser/chrome.js';
import { download } from '../lib/util/download.js';

let run = promisify(execFile);
let harness = new URL('../lib/harness.node.js', import.meta.url).href;

describe('Runtime dependencies', () => {
  test('loads configuration files matched by a glob', async () => {
    let directory = await mkdtemp(join(tmpdir(), 'moonshiner-config-'));

    try {
      await writeFile(join(directory, 'package.json'), '{"type":"module"}');
      await writeFile(join(directory, 'fixture.test.js'),
        `import { test } from ${JSON.stringify(harness)};\n` +
        'test("loaded glob configuration", () => {});\n');
      await writeFile(join(directory, 'fixture.config.js'),
        `export default { require: ${JSON.stringify(join(directory, 'fixture.test.js'))} };\n`);

      let { stdout } = await run(process.execPath, [
        'bin/moonshiner', '--config', join(directory, '*.config.js')
      ]);

      assert.match(stdout, /loaded glob configuration/);
      assert.match(stdout, /1 passing/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('loads all required files matched by brace expansion', async () => {
    let directory = await mkdtemp(join(tmpdir(), 'moonshiner-require-'));

    try {
      await writeFile(join(directory, 'package.json'), '{"type":"module"}');
      await writeFile(join(directory, 'empty.config.js'), 'export default {};\n');

      for (let name of ['first', 'second'])
        await writeFile(join(directory, `${name}.test.js`),
          `import { test } from ${JSON.stringify(harness)};\n` +
          `test(${JSON.stringify(`${name} glob fixture`)}, () => {});\n`);

      let { stdout } = await run(process.execPath, [
        'bin/moonshiner', '--config', join(directory, 'empty.config.js'),
        '--require', join(directory, '{first,second}.test.js')
      ]);

      assert.match(stdout, /first glob fixture/);
      assert.match(stdout, /second glob fixture/);
      assert.match(stdout, /2 passing/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('removes the browser profile when closing before launch', async () => {
    let browser = new ChromeLauncher();
    await writeFile(join(browser.profile, 'fixture'), 'profile data');

    await browser.close();

    await assert.rejects(access(browser.profile), { code: 'ENOENT' });
  });
});

async function withArchive(name, test) {
  let directory = await mkdtemp(join(tmpdir(), 'moonshiner-archive-'));
  let output = join(directory, 'output');
  let outside = join(directory, 'outside');
  let archive = join(output, 'browser.zip');

  try {
    await mkdir(output);
    await mkdir(outside);
    await writeFile(join(outside, 'marker.txt'), 'original');
    await copyFile(new URL(`./fixtures/archives/${name}.zip`, import.meta.url), archive);

    let extract = () => download('Fixture Browser',
      'https://example.invalid/browser.zip', output, { write() {} });

    await test({ output, outside, extract });
    await assert.rejects(access(archive), { code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe('Browser archive extraction', () => {
  test('preserves browser executables and internal links', async () => {
    await withArchive('browser', async ({ output, extract }) => {
      await extract();

      let executable = join(output, 'browser/bin/chrome');
      assert.equal(await readFile(executable, 'utf8'), '#!/bin/sh\nprintf fixture-browser\n');
      assert.equal(await readFile(join(output, 'browser/chrome'), 'utf8'),
        await readFile(executable, 'utf8'));

      if (process.platform !== 'win32') {
        assert.equal((await stat(executable)).mode & 0o111, 0o111 & ~process.umask());
        assert.equal(await readlink(join(output, 'browser/chrome')), 'bin/chrome');
      }
    });
  });

  for (let name of ['traversal', 'symlink-parent', 'symlink-file'])
    test(`rejects ${name} archives without writing outside the destination`, async () => {
      await withArchive(name, async ({ outside, extract }) => {
        await assert.rejects(extract());

        assert.equal(await readFile(join(outside, 'marker.txt'), 'utf8'), 'original');
        await assert.rejects(access(join(outside, 'pwned.txt')), { code: 'ENOENT' });
      });
    });

  if (process.platform !== 'win32') {
    test('rejects writes through an existing file symlink', async () => {
      await withArchive('existing-file', async ({ output, outside, extract }) => {
        await symlink(join(outside, 'marker.txt'), join(output, 'existing.txt'));

        await assert.rejects(extract());

        assert.equal(await readFile(join(outside, 'marker.txt'), 'utf8'), 'original');
      });
    });

    test('rejects writes through an existing directory symlink', async () => {
      await withArchive('existing-parent', async ({ output, outside, extract }) => {
        await symlink(outside, join(output, 'linked'));

        await assert.rejects(extract());

        await assert.rejects(access(join(outside, 'pwned.txt')), { code: 'ENOENT' });
      });
    });
  }
});
