import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';
import * as cp from 'node:child_process';
import { promisify } from 'node:util';
import { rimraf } from 'rimraf';

import { formatBytes, formatTime } from '../util/string.js';
import { DeferredPromise } from '../util/promise.js';

export async function download(name, url, dir, log = process.stderr) {
  let dlpath = path.join(dir, decodeURIComponent(url.split('/').pop()));

  try {
    if (!fs.existsSync(dlpath)) {
      log.write(`Downloading ${name}...\n`);
      await fs.promises.mkdir(dir, { recursive: true });

      await new Promise((resolve, reject) => https.get(url, res => {
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: ${res.statusCode} - ${url}`));
          res.resume();
        } else {
          let total = parseInt(res.headers['content-length'], 10);
          let progress = { width: 25 };

          res.on('data', chunk => {
            let amount = progress.amount = (progress.amount ?? 0) + chunk.length;
            let ratio = amount === total ? 1 : Math.min(Math.max(amount / total, 0), 1);
            let length = progress.length = Math.round(progress.width * ratio);
            let elapsed = Date.now() - (progress.start ??= Date.now());
            let eta = (ratio >= 1) ? 0 : elapsed * (total / amount - 1);
            let percent = Math.floor(ratio * 100).toFixed(0);

            if (log.isTTY) {
              log.write('\r\x1b[A\x1b[J');
              log.write(`Downloading ${name} ` +
                `[${'='.repeat(length)}${' '.repeat(progress.width - length)}] ` +
                `${formatBytes(amount)}/${formatBytes(total)} ` +
                `${percent}% ${formatTime(eta)}\n`);
            }
          });

          res.pipe(fs.createWriteStream(dlpath)
            .on('finish', resolve)
            .on('error', reject));
        }
      }).on('error', reject));
    }

    if (log.isTTY) log.write('\r\x1b[A\x1b[J');
    log.write(`Extracting ${name}...\n`);

    if (dlpath.endsWith('.zip'))
      await extractZip(dlpath, dir);
    if (dlpath.endsWith('.dmg'))
      await extractDmg(dlpath, dir);
    if (dlpath.endsWith('.tar.bz2'))
      await extractTar(dlpath, dir);

    if (log.isTTY) log.write('\r\x1b[A\x1b[J');
    log.write(`Downloaded ${name}\n`);
  } finally {
    if (fs.existsSync(dlpath))
      await rimraf(dlpath);
  }
}

async function extractZip(input, output) {
  let { default: unzip } = await import('extract-zip');
  await unzip(input, { dir: output });
}

async function extractDmg(input, output) {
  let exec = promisify(cp.exec);
  let { stdout } = await exec(`hdiutil attach "${input}"`);
  let [disk, , volume] = stdout.trim().split('\n').pop().split(/\t+/).map(s => s.trim());
  if (volume) await fs.promises.cp(volume, output, { recursive: true });
  await exec(`hdiutil detach "${disk}"`);
}

async function extractTar(input, output) {
  let { default: tar } = await import('tar-fs');
  let { default: bzip } = await import('unbzip2-stream');
  let extraction = new DeferredPromise();

  fs.createReadStream(input).pipe(bzip())
    .pipe(tar.extract(output)
      .on('finish', extraction.resolve)
      .on('error', extraction.reject));

  await extraction;
}
