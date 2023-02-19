const LINE_REGEXP = /^(?!\s*$)/gm;

export function indent(count, string, indent = '  ') {
  string = string?.toString();
  if (!string || count === 0) return string;
  return string.replace(LINE_REGEXP, indent.repeat(count));
}

export default indent;
