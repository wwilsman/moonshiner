import hook from './hook.js';

export function launch(fn) {
  return hook(fn, {
    on: e => e.type === 'server' && e.name === 'launch',
    off: e => e.type === 'server' && e.name === 'close'
  });
}

export default launch;
