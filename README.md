<div align="center">

# Moonshiner

High-proof testing

[Installation](#installation) •
[Writing tests](#writing-tests) •
[Running tests](#running-tests) •
[Configuring tests](#configuring-tests) •
[Browser tests](#browser-tests) •
[Visual tests](#visual-tests) •
[Plugins](#plugins)

</div>

## Installation

``` shell
$ npm install --save-dev moonshiner
```

## Writing tests

Write tests by importing and using familiar test methods:

``` javascript
// ./tests/test.js
import { describe, it } from 'moonshiner';

describe('my tests', () => {
  it('passes', () => {
    assert.ok(true)
  });

  it('fails', () => {
    assert.ok(false)
  });
});
```

## Running tests

Run tests by executing your test script with Node:

``` shell
$ node ./tests/test.js

🚀 Running tests

  my tests
    ✅ passes
    ❌ fails

❌ Failed:

  my tests
    fails
      AssertionError: The expression evaluated to a falsy value:

        assert.ok(false)

🏁 Summary

  ✅ 1 passing
  ❌ 1 failing

```

Tests can also be run using the `moonshiner` CLI:

``` shell
$ npx moonshiner --require ./tests/test.js
```

## Configuring tests

Tests can be configured by providing an `options` argument to tests, suites, or hooks:

``` typescript
// describe
function describe(name: string, options?: TestOptions, fn?: TestSuiteFn): void;
function describe(name: string, fn: TestSuiteFn, options?: TestOptions): void;

// test, it
function test(name: string, options?: TestOptions, fn?: TestFn): void;
function test(name: string, fn: TestFn, options?: TestOptions): void;

// before, beforeEach, after, afterEach
function hook(options: TestOptions, fn: TestFn): void;
function hook(fn: TestFn, options?: TestOptions): void;

// shared options
type TestOptions = {
  timeout?: number,
  skip?: boolean,
  only?: boolean
};
```

Tests can also be configured with specific test methods:

``` javascript
test.only('isolated test', () => {/* ... */});
test.skip('skipped test', () => {/* ... */});

test('test timeout', t => {
  // will reset the active timeout
  t.timeout(10_000);
  // ...
});
```

The test root, which all other tests decend from, can be configured by importing and using the
`configure()` method:

``` javascript
import { configure } from 'moonshiner';

configure({
  timeout: 10_000,
  // automatically require these test files
  require: './tests/**/*.test.js'
});
```

The test root can also be configured by providing flags to the `moonshiner` CLI:

``` shell
$ npx moonshiner --timeout 10000 --require ./tests/**/*.test.js
```

Moonshiner's CLI will also load the first config file found matching the following conditions:

- is named  `moonshiner.config.*` or `test.config.*`
- is located in `tests`, `test`, or the current working directory
- is formatted as `.js`, `.mjs`, `.cjs`, `.json`, `.yml`, or `.yaml`

A config file may also be provided to the CLI using the `--config` flag, or to the `configure()`
method using the `config` option.

### Reporters

Moonshiner comes with several built-in reporters, and uses the `spec` and `summary` reporters by
default. Reporters can be specified and configured with the `reporter` or `reporters` option.

- `spec` - outputs test results in a human-readable format
- `summary` - outputs test results as a summary
- `dot` - outputs test results in a compact format
- `tap` - outputs test results in a TAP format
- `junit` - outputs test results in a jUnit XML format (coming soon)

Custom reporters can be defined by extending the base reporter class, or by providing a generator
function:

``` javascript
configure({
  reporter: function* myReporter(events) {
    for await (let { type, data } of events) {
      switch (type) {
        case 'test:pass':
          yield `pass: ${data.test.name}\n`;
          break;
        case 'test:fail':
          yield `fail: ${data.test.name}\n`;
          break;
        case 'test:end':
          yield '\n\n';
          yield `passing: ${data.total.passing}\n`;
          yield `failing: ${data.total.failing}\n`;
          break;
      }
    }
  }
});
```

## Browser tests

Moonshiner tests are isomorphic and can run in both Node and Browser environments. Moonshiner can
also launch browsers and serve files from Node environments if configured to do so:

``` yaml
browser: chrome # launch a chrome browser
serve: ./       # serve the current working directory
```

The `serve` option may also specify virtual files that don't actually exist locally. This can be
used to create a virtual index for our browser tests:

``` yaml
browser: chrome
serve:
  - ./
  - /index.html: |
      <!doctype html>
      <html lang="en">
      <body>
        <script type="module" src="/test.js"></script>
      </body>
      </html>
```

Now when we run Moonshier, it will automatically start a server and launch a headless browser before
running any tests. As tests in the browser run, they will report upstream with any Node tests.

### Frameworks and bundlers

You can use typical test hooks such as `before()` and `after()` to perform setup and teardown
respectively. However in most cases, configuration options are often derived during setup and need
to be available before calling `configure()`. This can be done in async modules, either before
Moonshiner runs, or after disabling autorun and calling `run()` directly.

<details>
  <summary>Using a development server such as Vite</summary>
  <br/>

``` javascript
import { configure, after } from 'moonshiner';
import { createServer } from 'vite';

// create a vite server and start listening
const vite = await createServer({ /* ... */ });
await vite.listen();

configure({
  browser: {
    name: 'Chrome',
    // provide the vite url to the browser
    url: vite.resolvedUrls.local[0],
  }
});

// clean up vite after tests run
after(async () => {
  await vite.close();
});
```

</details>
<details>
  <summary>Using a bundler such as Rollup</summary>
  <br/>

``` javascript
import { configure, run } from 'moonshiner';
import { rollup } from 'rollup';

// disable autorun before bundling, as it might take a while
configure({ autorun: 0 });

// generate a rollup bundle
const bundler = await rollup({ /* ... */ });
const bundle = await bundler.generate({ output: 'esm' });

configure({
  browser: 'Chrome',
  // transform bundle output into a format expected by `serve`
  serve: bundle.output.reduce((files, f) => {
    files[`/${f.fileName}`] = f.code ?? f.source;
    return files;
  }, {})
});

// manually run tests
run();
```

</details>

## Visual tests

When running tests in supported browsers, a `screenshot()` method is made available to test
contexts. This method can be used to capture screenshots of the current page using the test name as
the screenshot name. If a screenshot already exists and it does not match the new screenshot, the
new screenshot is saved beside the existing one and a test error is raised.

By default, screenshots are compared using strict equality of their base64 contents. A custom
screenshot `compare()` option can be configured to compare screenshots using other methods. The
example below uses [odiff](https://github.com/dmtrKovalenko/odiff), a pixel differencing tool:

``` javascript
// tests/run.js
import { configure } from 'moonshiner';
import { compare } from 'odiff-bin';

configure({
  browser: 'Chrome',
  screenshots: {
    /** optional path where screenshots will be saved */
    // directory: '__screenshots__',
    /** optional custom suffixes used for new screenshot and diff filenames */
    // suffix: { new: '.new', diff: '.diff' },
    /** optional screenshot comparison function */
    async compare(baseline, comparison, diff) {
      // accepts image paths to compare, producing a diff image if not matching
      let { match } = await compare(baseline, comparison, diff);
      // should return { match: true } if no difference is found
      return { match };
    }
  },
  // ...
});
```

When comparing screenshots, the compare function will be called with the existing screenshot path
and the new screenshot path. This function should return an object with a `match` property which
should be `true` when screenshots match. The compare function is also called with a third argument,
a diff path, which can be used to save a diff image with the other screenshots. Any existing diff
image is removed before comparing new screenshots.

## Still brewing

Planned features are still coming soon, such as additional reporters, plugins, and more!
