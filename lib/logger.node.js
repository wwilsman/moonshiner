import * as readline from 'node:readline';

export function write(msg, options) {
  if (typeof options === 'string') options = { level: options };
  if (Array.isArray(msg)) msg = msg.join(' ');
  // @todo: colored logs
  return process.stdout.write(msg);
}

export function rewrite(msg, options) {
  readline.moveCursor(process.stdout, 0, -1);
  readline.clearLine(process.stdout, 1);
  return write(msg, options);
}

export function progress(prefix, chunk, total) {
  if (prefix !== progress.cache?.prefix) delete progress.cache;
  let width = 21;

  let amount = (progress.cache?.amount ?? 0) + chunk;
  let ratio = amount === total ? 1 : Math.min(Math.max(amount / total, 0), 1);
  let percent = Math.floor(ratio * 100).toFixed(0);
  let length = Math.round(width * ratio);
  if (length <= progress.cache?.length) return;

  let bar = (
    Array(Math.max(0, length + 1)).join('=') +
    Array(Math.max(0, width - length + 1)).join(' ')
  );

  progress.cache = { ...progress.cache, prefix, amount, length };
  let elapsed = Date.now() - (progress.cache.start ??= Date.now());
  let eta = (ratio >= 1) ? 0 : elapsed * (total / amount - 1);

  rewrite(
    `${prefix} [${bar}] ` +
    `${formatBytes(amount)}/${formatBytes(total)} ` +
    `${percent}% ${formatTime(eta)}` + '\n'
  );
}

function formatBytes(int) {
  let units = ['kB', 'MB', 'GB'];
  let base = 1024;
  let u = -1;

  if (Math.abs(int) < base) return `${int}B`;
  while (Math.abs(int) >= base && u++ < 2) int /= base;
  return `${int.toFixed(1)}${units[u]}`;
}

function formatTime(ms) {
  let minutes = (ms / 1000 / 60).toString().split('.')[0].padStart(2, '0');
  let seconds = (ms / 1000 % 60).toFixed().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default {
  write,
  rewrite,
  progress
};
