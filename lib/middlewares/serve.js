const MIME_TYPES = {
  html: 'text/html; charset=UTF-8',
  js: 'application/javascript',
  css: 'text/css',
  png: 'image/png',
  jpg: 'image/jpg',
  gif: 'image/gif',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
  default: 'application/octet-stream'
};

export function middleware(dir, options) {
  if (typeof dir !== 'string')
    [dir, options] = [options, dir];

  let serveStatic = async (res, next) => {
    let fs = await import('node:fs');
    let path = await import('node:path');
    let publicDir = path.resolve(dir ?? './public');

    let filePath = path.join(publicDir, res.req.url);
    if (!filePath.startsWith(publicDir)) return next();
    let isAccessible = await fs.promises.access(filePath).then(() => 1, () => 0);
    if (!isAccessible) return next();

    let ext = path.extname(filePath).substring(1).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? MIME_TYPES.default });
    fs.createReadStream(filePath).pipe(res);
  };

  let handleResponse = (res, next) => {
    if (options.virtual) {
      let { url } = res.req;
      if (!options.virtual[url] && url.endsWith('/'))
        url += 'index.html';
      if (options.virtual[url])
        return res.writeHead(200).end(options.virtual[url]);
    }

    return serveStatic(res, next);
  };

  return ({ type, name, data }, next) => {
    if (type === 'server' && name === 'request')
      return handleResponse(data, next);
    return next();
  }
}

export default middleware;
