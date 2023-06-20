<div align="center">

# Moonshiner

High-proof testing

[Installation](#installation) •
[Getting Started](#getting-started) •
[Reporting](#reporting) •
[Server](#server) •
[Hooks](#hooks) •
[Context](#context)

</div>

## Installation

``` shell
$ npm install --save-dev moonshiner
```

## Getting Started

Write tests with familiar test methods:

``` javascript
import { describe, it, run } from 'moonshiner';

// write tests
describe('My tests', () => {
  it('passes', () => {
    assert.ok(true);
  });

  it('fails', () => {
    assert.ok(false);
  });
});

// run tests
run();
```

...but nothing happened? Since Moonshiner doesn't come configured by default, we need to add a reporter.

## Reporting

Reporters are middlewares for Moonshiner test runners:

``` javascript
import { use, describe, it, run } from 'moonshiner';
import reporters from 'moonshiner/reporters';

// use reporters
use(reporters.emoji());

// write tests
describe('My tests', () => ...);

// run tests
run();
```

Et voilà! Now we can see our tests are actually running:

``` shell

  My tests
    ✅ works
    ❌ fails

Failed:

My tests / fails
AssertionError: false == true
    at ...

Passing: 1; Failing: 1; Skipped: 0

```

The above examples will work in both Node and browser environments. Moonshiner also allows
orchestrating tests between multiple environments using a Moonshiner server.

## Server

A Moonshiner server allows orchestration of many remote runners. Server reporters can be added just
like you would with Moonshiner test runners:

``` javascript
import createTestServer from 'moonshiner/server';
import reporters from 'moonshiner/reporters';

// create a test server
const server = createTestServer();

// use reporters
server.use(reporters.emoji());

// listen for tests
server.listen();
```

Back in our test environment, we can utilize Moonshiner's remote reporter:

``` javascript
import { use, describe, it, run } from 'moonshiner';
import reporters from 'moonshiner/reporters';
import WebSocket from 'ws';

// use the remote reporter with the `ws` package
use(reporters.remote({ WebSocket });

// write tests
describe('My tests', () => ...);

// run tests
run();
```

Running the test server will wait until the test client has connected before running tests. While
tests run, the remote reporter will communicate with the server reporter to output test results.

By default, the test server will exit as soon as tests have completed. Setting `once: false` during
server creation will prevent this default behavior.

### Browsers

Browser tests can also be run remotely. Moonshiner even offers a way to launch a browser and
navigate directly to a URL while using the test server.

``` javascript
import { createTestServer } from 'moonshiner/server';
import reporters from 'moonshiner/reporters';
import browsers from 'moonshiner/browsers';

// create a test server
const server = createTestServer();

// use reporters
server.use(reporters.emoji());

// use browser launching middleware
server.use(browsers.launch('http://localhost:3000'));

// listen for tests
server.listen();
```

This time we won't need to provide our own WebSocket implementation since one is available globally
in the browser environment:

``` javascript
import { use, run } from 'moonshiner';
import reporters from 'moonshiner/reporters';

// defaults to the global WebSocket class
use(reporters.remote());

// write tests
describe('My tests', () => ...);

// run tests
run();
```

Running the test server will now launch a browser and run our tests. We could also start and stop
our development server directly from the test server as well using other middleware.

### Development

Moonshiner offers built-in middlewares for various configurations. The `listen` middleware can be
used with a test server to provide custom setup and teardown behavior. The provided function is
called when the test server starts listening, and any returned teardown function will be called when
the test server closes.

``` javascript
import { createTestServer } from 'moonshiner/server';
import middlewares from 'moonshiner/middlewares';
import reporters from 'moonshiner/reporters';
import browsers from 'moonshiner/browsers';

// for this example, we'll use a vite server
import { createServer } from 'vite';

// create a test server
const server = createTestServer();

// use reporters
server.use(reporters.emoji());

// use custom listen middleware
server.use(middlewares.listen(() => {
  // start the vite server
  let vite = await createServer();
  await vite.listen();

  // use browser launcher after server start
  let [url] = vite.resolvedUrls.local;
  server.use(browsers.launch(url));

  // close the vite server during teardown
  return async () => {
    await vite.close();
  };
});

// listen for tests
server.listen();
```

## Hooks

Test hooks are a way to encapsulate setup & teardown behavior that are commonly used when writing
tests. The hook's setup function can return a teardown function that is automatically called during
subsequent hook calls. The teardown function is also returned from the hook for manual usage.

``` javascript
import { createTestHook } from 'moonshiner/utils';

// hooks can by synchronous or asynchronous
const myHook = createTestHook(x => {
  console.log(`setup ${x}`);

  // runs before the next invocation
  return () => {
    console.log(`teardown ${x}`);
  };
});

myHook('foo');
//=> setup foo

myHook('bar');
//=> teardown foo
//=> setup bar

let teardown = myHook(42);
//=> teardown bar
//=> setup 42

teardown();
//=> teardown 42
```

### Built-ins

The callback function provided to `beforeEach` is also treated as a test hook. Any returned function
will be called during subsequent calls _of the same `beforeEach` reference_.

``` javascript
describe('Hook example', () => {
  let count = 0;

  beforeEach(() => {
    count += 5;

    // runs before the next invocation
    return () => {
      count -= 2;
    }
  });

  it('is 5', () => {
    assert.equal(count, 5);
  });

  it('is 8', () => {
    assert.equal(count, 8);
  });

  it('is 11', () => {
    assert.equal(count, 11);
  });
});
```

**Important:** when a `describe` suite finishes, _it does not run any teardown functions_. This is
intentional, so tests can be inspected in their current state after they run. However, this also
means that teardown functions returned from `beforeEach` _will not run between suites_. For this reason,
it is usually recommended to prefer creating a custom hook using `createTestHook`.

## Context

Rather than importing Moonshiner test methods in every test suite, Moonshiner makes test methods
available within each suite context as well:

``` javascript
import { describe } from 'moonshiner';

const suite = describe('My tests', ctx => {
  let { beforeEach, it } = ctx;

  beforeEach(() => ...);
  it('works', () => ...);
  it('fails', () => ...);

  describe('nested', () => {
    beforeEach(() => ...);
    it('still works', () => ...);
  });
});

// each suite is its own test runner
suite.run();
```

### Globals

A Moonshiner runner may use a context-binding middleware to bind test methods to any provided
context, including the global context:

``` javascript
import { use, run } from 'moonshiner';
import middlewares from 'moonshiner/middlewares';

// bind test methods to the provided context
use(middlewares.bind(globalThis));

// test methods are now globally available
describe('My tests', () => {
  beforeEach(() => ...);

  it('works', () => ...);

  // ...
});

// run tests
run();
```
