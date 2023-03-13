import child from 'node:child_process';
import log from '../logger.node.js';
import deferred from '../utils/deferred.js';
import launch from './hook.js';

export function fork(name, options) {
  if (typeof name !== 'string') [options, name] = [options];
  let { modulePath, args, options: opts } = options;
  name ??= options.name ?? options.modulePath;
  opts = { silent: true, ...opts };

  return launch(async server => {
    args ??= [server.address()];

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
    }
  });
}

export default fork;
