const ESC_CHAR_RE = /\\(\\)?/g;
const PROP_NAME_RE = new RegExp((
  '[^.[\\]]+' + '|' +
  '\\[(?:' +
    '([^"\'][^[]*)' + '|' +
    '(["\'])((?:(?!\\2)[^\\\\]|\\\\.)*?)\\2' +
  ')\\]' + '|' +
  '(?=(?:\\.|\\[\\])(?:\\.|\\[\\]|$))'
), 'g');

export function stringToPath(string) {
  let result = [];

  string.replace(PROP_NAME_RE,
    (match, key, quote, substr) => result.push(quote
      ? substr.replace(ESC_CHAR_RE, '$1')
      : key?.trim() ?? match));

  return result;
}

export function get(target, path) {
  return stringToPath(path).reduce((next, key) => {
    return next?.[key];
  }, target);
}

export function set(target, path, value) {
  return stringToPath(path).reduce((next, key, index, path) => {
    if (index === path.length - 1) return (next[key] = value, target);
    return next[key] ??= isNaN(path[index + 1]) ? {} : [];
  }, target);
}

export function deepmerge(...objects) {
  return objects.reduce((target, object) => {
    for (let key in object) {
      if (typeof target[key] === 'object' && typeof object[key] === 'object')
        deepmerge(target[key], object[key]);
      else target[key] = object[key];
    }

    return target;
  }, Array.isArray(objects[0]) ? [] : {});
}
