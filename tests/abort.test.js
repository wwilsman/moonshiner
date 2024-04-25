import {
  describe,
  it,
  before,
  beforeEach,
  after,
  afterEach,
  abort
} from 'moonshiner';

describe('abort', () => {
  before(t => console.log('before', t.name));
  after(t => console.log('after', t.name));
  beforeEach(t => console.log('beforeEach', t.name));
  afterEach(t => console.log('afterEach', t.name));

  it('should run', () => {});

  describe('nested', () => {
    before(t => console.log('before nested', t.name));
    after(t => console.log('after nested', t.name));

    it('should abort', () => {
      abort();
    });
  });

  describe('should not run', () => {
    it('should not run', () => {});
  });
});
