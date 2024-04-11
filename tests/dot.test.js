import { configure } from 'moonshiner';

configure({
  require: './tests/harness.test.js',
  reporter: 'dot'
});
