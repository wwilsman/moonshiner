import child from 'node:child_process';
import log from '../logger.node.js';
import deferred from '../utils/deferred.js';
import launch from './hook.js';

const defaultOptions = {
  silent: true
};

export function fork(name, options) {
  if (typeof name !== 'string') [options, name] = [name];
  name ??= options.name ?? options.modulePath;

  return launch(async server => {
    let { modulePath, args = [server.address()], ...opts } = {
      ...defaultOptions, ...server.options?.forks, ...options
    };

    if (opts.disable) return;
    if (server.options.debug) opts.silent = false;

    log.write(`Launching ${name}\n`);
    let proc = child.fork(modulePath, args, opts);

    let spawned = deferred();
    proc.on('spawn', spawned.resolve);
    proc.on('error', spawned.reject);
    await spawned.promise;

    let exited = deferred();
    proc.on('exit', exited.resolve);

    return () => {
      if (proc?.pid && !proc.killed) proc.kill('SIGKILL');
      return exited.promise;
    };
  });
}

export default fork;
