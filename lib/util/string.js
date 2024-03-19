const INDENT_LINE_RE = /^(?!\s*$)/gm;

export function indent(count, string, indent = '  ') {
  string = string?.toString();
  if (!string || count === 0) return string;
  return string.replace(INDENT_LINE_RE, indent.repeat(count));
}

export function formatBytes(int) {
  let u = -1;
  let base = 1024;
  let units = ['kB', 'MB', 'GB'];
  if (Math.abs(int) < base) return `${int}B`;
  while (Math.abs(int) >= base && u++ < units.length - 1) int /= base;
  return `${int.toFixed(1)}${units[u]}`;
}

export function formatTime(ms) {
  let minutes = (ms / 1000 / 60).toString().split('.')[0].padStart(2, '0');
  let seconds = (ms / 1000 % 60).toFixed().padStart(2, '0');
  return `${minutes}:${seconds}`;
}
