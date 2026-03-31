import { configure } from 'moonshiner';

configure({
  require: './tests/shared.harness.test.js',
  reporter: 'tap'
});
