import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';
import * as cp from 'node:child_process';
import { promisify } from 'node:util';
import { deferred } from '../utils.js';
import log from '../logger.js';

function platform() {
  let { platform, arch } = process;
  if (platform === 'win32' && arch === 'x64') return 'win64';
  if (platform === 'darwin' && arch === 'arm64') return 'darwinArm';
  return platform;
}

function compute(option, ...args) {
  return typeof option === 'function' ? option(...args) : option;
}

async function extract(input, output) {
  if (input.endsWith('.zip')) {
    let { default: unzip } = await import('extract-zip');
    await unzip(input, { dir: output });
  } else if (input.endsWith('.dmg')) {
    let exec = promisify(cp.exec);
    let { stdout } = await exec(`hdiutil attach ${input}`);
    let [disk,, volume] = stdout.trim().split('\n').pop().split(/\t+/).map(s => s.trim());
    if (volume) await fs.promises.cp(volume, output, { recursive: true });
    await exec(`hdiutil detach ${disk}`);
  } else if (input.endsWith('.tar.bz2')) {
    let { default: tar } = await import('tar-fs');
    let { default: bzip } = await import('unbzip2-stream');
    let extraction = deferred();

    fs.createReadStream(input).pipe(bzip())
      .pipe(tar.extract(output)
        .on('finish', extraction.resolve)
        .on('error', extraction.reject));

    await extraction.promise;
  }
}

export async function download({
  name,
  downloadDir,
  downloadUrl,
  executablePath,
  extractFile = extract,
  ...options
}) {
  options.platform = platform();
  downloadDir = await compute(downloadDir, options);
  downloadUrl = await compute(downloadUrl, options);
  executablePath = path.join(downloadDir, (
    await compute(executablePath, options)
  ));

  let downloadPath = path.join(downloadDir, (
    decodeURIComponent(downloadUrl.split('/').pop())
  ));

  if (!fs.existsSync(executablePath)) {
    try {
      if (!fs.existsSync(downloadPath)) {
        log.write(`Downloading ${name}...\n`);
        await fs.promises.mkdir(downloadDir, { recursive: true });

        await new Promise((resolve, reject) => https.get(downloadUrl, res => {
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`Download failed: ${res.statusCode} - ${downloadUrl}`));
          } else {
            let total = parseInt(res.headers['content-length'], 10);

            res.on('data', chunk => (
              log.progress(`Downloading ${name}`, chunk.length, total)
            ));

            res.pipe(fs.createWriteStream(downloadPath)
              .on('finish', resolve)
              .on('error', reject));
          }
        }).on('error', reject));
      }

      if (extractFile) {
        log.rewrite(`Extracting ${name}...\n`);
        await extractFile(downloadPath, downloadDir);
        log.rewrite(`Installed ${name}\n`);
      }
    } finally {
      if (extractFile && fs.existsSync(downloadPath))
        await fs.promises.unlink(downloadPath);
    }
  }

  return {
    name,
    downloadDir,
    downloadUrl,
    executablePath,
    ...options
  };
}

export default download;
