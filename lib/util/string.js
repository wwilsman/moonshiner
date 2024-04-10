const LINE_RE = /^.*\S+.*$/gm;
const LINE_START_RE = /^(?!$)/gm;

const ESC = '\x1b';
const MODIFIERS = {
  reset: [`${ESC}[0m`, `${ESC}[0m`],
  bold: [`${ESC}[1m`, `${ESC}[22m`],
  dim: [`${ESC}[2m`, `${ESC}[22m`],
  italic: [`${ESC}[3m`, `${ESC}[23m`],
  underline: [`${ESC}[4m`, `${ESC}[24m`],
  inverse: [`${ESC}[7m`, `${ESC}[27m`],
  hidden: [`${ESC}[8m`, `${ESC}[28m`],
  strikethrough: [`${ESC}[9m`, `${ESC}[29m`],
  black: [`${ESC}[30m`, `${ESC}[39m`],
  red: [`${ESC}[31m`, `${ESC}[39m`],
  green: [`${ESC}[32m`, `${ESC}[39m`],
  yellow: [`${ESC}[33m`, `${ESC}[39m`],
  blue: [`${ESC}[34m`, `${ESC}[39m`],
  magenta: [`${ESC}[35m`, `${ESC}[39m`],
  cyan: [`${ESC}[36m`, `${ESC}[39m`],
  white: [`${ESC}[37m`, `${ESC}[39m`],
  gray: [`${ESC}[90m`, `${ESC}[39m`],
  bgBlack: [`${ESC}[40m`, `${ESC}[49m`],
  bgRed: [`${ESC}[41m`, `${ESC}[49m`],
  bgGreen: [`${ESC}[42m`, `${ESC}[49m`],
  bgYellow: [`${ESC}[43m`, `${ESC}[49m`],
  bgBlue: [`${ESC}[44m`, `${ESC}[49m`],
  bgMagenta: [`${ESC}[45m`, `${ESC}[49m`],
  bgCyan: [`${ESC}[46m`, `${ESC}[49m`],
  bgWhite: [`${ESC}[47m`, `${ESC}[49m`]
};

export function style(format, string) {
  return string.replaceAll(LINE_RE, line => {
    let open, close;

    for (let f of [].concat(format)) {
      if (!MODIFIERS[f]) continue;
      open = `${open ?? ''}${MODIFIERS[f][0]}`;

      if (!close?.startsWith(MODIFIERS[f][1]))
        close = `${MODIFIERS[f][1]}${close ?? ''}`;
    }

    return `${open}${line}${close}`;
  });
}

export function indent(count, string, indent = '  ') {
  string = string?.toString();
  if (!string || count === 0) return string;
  return string.replace(LINE_START_RE, indent.repeat(count));
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
  let minutes = Math.floor(ms / 1000 / 60);
  let seconds = (ms / 1000 % 60);

  return minutes
    ? `${minutes}:${seconds.toFixed().padStart(2, '0')}`
    : `${seconds.toFixed(3)}s`;
}
