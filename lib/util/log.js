// const LINE_RE = /^.*$/gm;

export const COLORS = {
  reset: s => `\x1b[0m${s}\x1b[0m`,
  bold: ['\x1b[1m', '\x1b[22m', '\x1b[22m\x1b[1m'],
  dim: ['\x1b[2m', '\x1b[22m', '\x1b[22m\x1b[2m'],
  italic: ['\x1b[3m', '\x1b[23m'],
  underline: ['\x1b[4m', '\x1b[24m'],
  inverse: ['\x1b[7m', '\x1b[27m'],
  hidden: ['\x1b[8m', '\x1b[28m'],
  strikethrough: ['\x1b[9m', '\x1b[29m'],
  black: ['\x1b[30m', '\x1b[39m'],
  red: ['\x1b[31m', '\x1b[39m'],
  green: ['\x1b[32m', '\x1b[39m'],
  yellow: ['\x1b[33m', '\x1b[39m'],
  blue: ['\x1b[34m', '\x1b[39m'],
  magenta: ['\x1b[35m', '\x1b[39m'],
  cyan: ['\x1b[36m', '\x1b[39m'],
  white: ['\x1b[37m', '\x1b[39m'],
  gray: ['\x1b[90m', '\x1b[39m'],
  bgBlack: ['\x1b[40m', '\x1b[49m'],
  bgRed: ['\x1b[41m', '\x1b[49m'],
  bgGreen: ['\x1b[42m', '\x1b[49m'],
  bgYellow: ['\x1b[43m', '\x1b[49m'],
  bgBlue: ['\x1b[44m', '\x1b[49m'],
  bgMagenta: ['\x1b[45m', '\x1b[49m'],
  bgCyan: ['\x1b[46m', '\x1b[49m'],
  bgWhite: ['\x1b[47m', '\x1b[49m']
};

export function color(name, string) {
  if (Array.isArray(name))
    return name.reduce((s, n) => color(n, s), string);

  let [open, close, replace = open] = COLORS[name];
  let index = string.indexOf(close, open.length);
  if (~index) string = replaceClose(string, close, replace, index);

  return open + string + close;
}

function replaceClose(string, close, replace, index) {
  let start = string.substring(0, index) + replace;
  let end = string.substring(index + close.length);

  let next = end.indexOf(close);
  if (~next) end = replaceClose(end, close, replace, next);

  return start + end;
}

export function log(message = '') {
  if (globalThis.window) console.log(message);
  else globalThis.process.stdout.write(message + '\n');
}
