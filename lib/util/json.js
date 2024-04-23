export function flattenJSON($, replacer) {
  let cache = new WeakMap();

  return (function flatten(value, path) {
    if (replacer != null)
      value = replacer(value);

    if (
      value != null &&
      typeof value === 'object' &&
      !(value instanceof Boolean) &&
      !(value instanceof Date) &&
      !(value instanceof Number) &&
      !(value instanceof RegExp) &&
      !(value instanceof String)
    ) {
      let $ref = cache.get(value);
      if ($ref != null) return { $ref };
      cache.set(value, path);

      return Object.entries(value).reduce((n, [k, v]) => ((
        n[k] = flatten(v, `${path}[${JSON.stringify(k)}]`)
      ), n), Array.isArray(value) ? [] : {});
    }

    return value;
  }($, '$'));
}

const PATH_REF_RE = /^\$(?:\[(?:\d+|"(?:[^\\"\u0000-\u001f]|\\(?:[\\"\/bfnrt]|u[0-9a-zA-Z]{4}))*")\])*$/;

export function unflattenJSON($) {
  return (function unflatten(value) {
    if (value != null && typeof value === 'object') {
      for (let [i, element] of Object.entries(value)) {
        if (element != null && typeof element === 'object') {
          let path = element.$ref;

          if (typeof path === 'string' && PATH_REF_RE.test(path))
            value[i] = eval(path); // eslint-disable-line no-eval

          else unflatten(element);
        }
      }
    }

    return value;
  }($));
}
