import createReporter from './base.js';

export function reporter({
  map,
  key = '__coverage__',
  context = globalThis
}) {
  return createReporter({
    sync: false,
    state: map,

    'after:suite'(_, state, event) {
      if (!event[key]) return;
      state.merge(event[key]);
      context[key] = state.toJSON();
    }
  });
}

export default reporter;
