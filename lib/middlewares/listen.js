import hook from './hook.js'

export function listen(fn) {
  return hook(fn, {
    on: e => e.type === 'server' && e.name === 'listen',
    off: e => e.type === 'server' && e.name === 'close'
  });
}

export default listen;
