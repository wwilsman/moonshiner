import { describe, it } from 'moonshiner';

describe('remote target', () => {
  it('long running test', async () => {
    // This will run for a while, giving time for the connection to close
    await new Promise(resolve => setTimeout(resolve, 5000));
  });
});
