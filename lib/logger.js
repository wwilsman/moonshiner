const LAST_LINE_REGEXP = /\r?\n$/;

export function write(msg, options) {
  if (typeof options === 'string') options = { level: options };
  if (typeof msg === 'string') msg = msg.replace(LAST_LINE_REGEXP, '');
  // @todo: colored logs
  return console.log(...[].concat(msg));
}

export default { write };
