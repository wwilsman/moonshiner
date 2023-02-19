import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';
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

export async function download({
  name,
  downloadDir,
  downloadUrl,
  executablePath,
  extractFile,
  ...options
}) {
  options.platform = platform();
  downloadDir = compute(downloadDir, options);
  downloadUrl = compute(downloadUrl, options);
  executablePath = path.join(downloadDir, (
    compute(executablePath, options)
  ));

  let downloadPath = path.join(downloadDir, (
    decodeURIComponent(downloadUrl.split('/').pop())
  ));

  if (!fs.existsSync(executablePath)) {
    try {
      if (!fs.existsSync(downloadPath)) {
        log(`Downloading ${name}...`);
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
        log.update(`Extracting ${name}...`);
        await extractFile(downloadPath, downloadDir);
        log.update(`Installed ${name}`);
      }
    } finally {
      if (extractFile && fs.existsSync(downloadPath)) {
        await fs.promises.unlink(downloadPath);
      }
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
