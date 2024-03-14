export function flattenJSON(object, cache) {
  cache ??= { m: new Map(), v: new Map() };

  if (object == null) return object;
  if (object instanceof Error) {
    let { name, message, stack } = object;
    return { name, message, stack };
  }

  return Object.entries(object).reduce((result, [field, value]) => {
    let p = cache.m.get(object) + (Array.isArray(object) ? `[${field}]` : `.${field}`);
    let pp = cache.v.get(value) || '';

    let isComplex = value && value === Object(value);
    if (isComplex) cache.m.set(value, p);

    let val = pp ? { $ref: `#${pp}` } : value;

    if (!cache.init) cache.init = val;
    else if (cache.init === val) val = { $ref: '#' };

    if (!pp && isComplex) {
      cache.v.set(value, p.replace(/undefined\.\.?/, ''));
      val = flattenJSON(val, cache);
    }

    result[field] = val;
    return result;
  }, Array.isArray(object) ? [] : {});
}

export function unflattenJSON(object) {
  let cache = { obj: new Map(), path: new Map() };
  object = structuredClone(object);

  let traverse = (parent, field) => {
    let obj = field != null ? parent[field] : parent;
    let path = field == null ? '#' : (cache.path.get(parent) + (
      Array.isArray(parent) ? `[${field}]` : (field ? `.${field}` : '')
    )).replace('#.', '#');

    cache.path.set(obj, path);
    cache.obj.set(path, obj);

    let ref = obj && Object.getPrototypeOf(obj) === Object.prototype &&
      '$ref' in obj && cache.obj.get(obj.$ref);
    if (ref) parent[field] = ref;

    if (!ref && obj === Object(obj))
      for (let f in obj) traverse(obj, f);
  };

  traverse(object);
  return object;
}
