<div align="center">

# Moonshiner

High-proof testing

[Installation](#installation) •
[Writing tests](#writing-tests) •
[Browser tests](#browser-tests) •
[Visual tests](#visual-tests)

</div>

## Installation

``` shell
$ npm install --save-dev moonshiner
```

## Writing tests

Write tests by importing and using familiar test methods:

``` javascript
// tests/test.js
import { describe, it } from 'moonshiner';

describe('My tests', () => {
  it('passes', () => {
    assert.ok(true)
  });

  it('fails', () => {
    assert.ok(false)
  });
});
```

### Running tests

Run tests by executing your test script with Node:

``` shell
$ node tests/test.js

🚀 Running tests

  My tests
    ✅ passes
    ❌ fails

❌ Failed:

  My tests
    fails
      AssertionError: The expression evaluated to a falsy value:

        assert.ok(false)

🏁 Summary

  ✅ 1 passing
  ❌ 1 failing

```

## Browser tests

Moonshiner tests are isomorphic and can run in both Node and Browser environments. Moonshiner also
features the ability to automatically launch browsers and serve files. This is done using the
`configure` function from within a Node test script.

``` javascript
// tests/run.js
import { configure } from 'moonshiner';

configure({
  // launch Google Chrome
  browser: 'Chrome',
  // serve the current working directory at /
  server: {
    serve: ['.']
  }
});
```

The server `serve` option may also specify virtual files to serve that don't actually exist
locally. This can be used to create a virtual index for our browser tests.

``` javascript
// ...
  server: {
    serve: ['.', {
      '/index.html': `
        <!doctype html>
        <html lang="en">
        <body>
          <script type="module" src="/test.js"></script>
        </body>
        </html>`,
    }]
  }
// ...
```

Now when we run this new test script, Moonshiner will automatically start a server and launch a
headless browser before running any tests. As tests in the browser are run, they are also reported
upstream with any Node tests.

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
  server: {
    // transform bundle output into a format expected by `serve`
    serve: [bundle.output.reduce((files, f) => {
      files[`/${f.fileName}`] = f.code ?? f.source;
      return files;
    }, {})]
  }
});

// manually run tests
run();
```

</details>

## Visual tests

When running tests in supported browsers, a `screenshot` method is made available to testing
contexts. This method can be used to capture screenshots of the current page, with the ability to
resize the browser before and after capturing screenshots. If a screenshot already exists, a new
screenshot is created beside the existing one.

To enable visual tests, which compares new and existing screenshots, a screenshot compare function
must be configured in your Node test script. The example below uses [odiff](https://github.com/dmtrKovalenko/odiff),
whose API is directly compatible with Moonshiner visual tests.

``` javascript
import { configure } from 'moonshiner';
import { compare } from 'odiff-bin';

configure({
  browser: 'Chrome',
  screenshots: {
    // optional screenshots directory,
    directory: '__screenshots__',
    // optional suffix given to new screenshots when there is an existing screenshot
    newSuffix: 'new',
    // optional suffix given to screenshot diffs produced by the compare function
    diffSuffix: 'diff',
    // required to enable visual tests
    async compare(baseline, comparison, diff) {
      // should produce a diff file if baseline and comparison do not match
      let { match } = await compare(baseline, changed, diff);
      // should return an object with a `match` property
      return { match };
    }
  }
});
```

Other comparison tools may also be used as long as they are configured with Moonshiner to to produce
the expected return value and diff output. When a screenshot exists and new one is created, the
configured compare function will be called with the existing screenshot path, the new screenshot
path, and a diff output path. This function should return an object with a `match` property, which
should be `false` when a diff is created, or `true` when the existing and new screenshots match.

## Still brewing

Planned features are still coming soon, such as additional reporters, a CLI, and more!
