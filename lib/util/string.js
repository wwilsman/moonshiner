const INDENT_LINE_RE = /^(?!\s*$)/gm;

export function indent(count, string, indent = '  ') {
  string = string?.toString();
  if (!string || count === 0) return string;
  return string.replace(INDENT_LINE_RE, indent.repeat(count));
}
