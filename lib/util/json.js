import { get } from './object.js';

export function flattenJSON(json, replacer) {
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

      return Object.getOwnPropertyNames(value).reduce((n, k) => ((
        n[k] = flatten(value[k], `${path}[${k}]`)
      ), n), Array.isArray(value) ? [] : value instanceof Error ? {
        name: value.name, message: value.message, stack: value.stack
      } : {});
    }

    return value;
  }(json, '$'));
}

export function unflattenJSON(json) {
  return (function unflatten(value) {
    if (value != null && typeof value === 'object') {
      for (let [k, element] of Object.entries(value)) {
        if (element != null && typeof element === 'object') {
          let path = element.$ref;

          if (typeof path === 'string' && path.startsWith('$['))
            value[k] = get(json, path.substring(1));

          else unflatten(element);
        }
      }
    }

    return value;
  }(json));
}
