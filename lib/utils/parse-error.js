let V8_STACK_REGEXP = /^\s*at .*(\S+:\d+|\(native\))/m;
let SAFARI_NATIVE_REGEXP = /^(eval@)?(\[native code])?$/;
let CODE_LOCATION_REGEXP = /(.+?)(?::(\d+))?(?::(\d+))?$/;
let FUNC_NAME_REGEXP = /((.*".+"[^@]*)?[^@]*)(?:@)/;

function extractStack(url, acc) {
  if (url.indexOf(':') === -1) return [url];
  let loc = CODE_LOCATION_REGEXP.exec(url.replace(/[()]/g, ''));
  if (loc[1] && !['eval', '<anonymous>'].includes(loc[1]))
    acc.file ??= loc[1];
  if (loc[2]) acc.line ??= loc[2];
  if (loc[3]) acc.col ??= loc[3];
  return acc;
}

function parseErrorStack(error) {
  if (Array.isArray(error.stack))
    return error.stack;

  let trace = error.stack ?? '';
  let isV8 = V8_STACK_REGEXP.test(trace);

  return trace.split('\n').reduce((stack, line) => {
    let isV8Line = isV8 && V8_STACK_REGEXP.test(line);

    if (isV8 ? !isV8Line : SAFARI_NATIVE_REGEXP.test(line)) {
      return stack;
    } else if (!isV8 && line.indexOf('@') === -1 && line.indexOf(':') === -1) {
      return stack.concat({ function: line });
    } else if (isV8Line) {
      let sanitized = line.replace(/^\s+/, '').replace(/\(eval code/g, '(').replace(/^.*?\s+/, '');
      let location = sanitized.match(/ (\(.+\)$)/);

      if (location) sanitized = sanitized.replace(location[0], '');

      return stack.concat(extractStack(location?.[1] ?? sanitized, {
        function: location && sanitized,
        source: line
      }));
    } else {
      return stack.concat(extractStack(line.replace(FUNC_NAME_REGEXP, ''), {
        function: line.match(FUNC_NAME_REGEXP)?.[1],
        source: line
      }));
    }
  }, []);
}

export function parseError(error, source) {
  return {
    name: error.name ?? 'Error',
    message: error.message ?? error.toString(),
    source: error.source ?? source,
    stack: parseErrorStack(error)
  };
}

export default parseError;
