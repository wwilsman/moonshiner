export function coverage(cov) {
  let variable = cov.variable ?? '__coverage__';
  if (cov.data) globalThis[variable] = cov.data;

  return test => {
    test.on('server:event', (_id, _event, data) => {
      if (data.coverage) cov.merge(data.coverage);
    });

    test.on('run:end', results => {
      if (globalThis[variable])
        results.coverage = globalThis[variable];
      return results;
    });
  };
}
