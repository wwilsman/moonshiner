export class CaptureConsole {
  #methods = ['debug', 'error', 'info', 'log', 'warn'];
  #originals = new Map();
  #log;

  configure(config) {
    if (config.captureConsole != null)
      this.#restore();

    if (Array.isArray(config.captureConsole))
      this.#methods = [...config.captureConsole];

    if (config.captureConsole)
      for (let method of this.#methods) this.#install(method);
  }

  #context;

  apply(test) {
    this.#log = data => {
      return test.emit('test:log', {
        test: this.#context?.test,
        ...data
      });
    };

    test.on('test:ready', ({ test }) => {
      this.#context = { test, previous: this.#context };
    });

    test.on('test:skip', () => {
      this.#context = this.#context?.previous;
    });

    test.on('test:pass', () => {
      this.#context = this.#context?.previous;
    });

    test.on('test:fail', () => {
      this.#context = this.#context?.previous;
    });
  }

  #install(method) {
    let og = globalThis.console[method];
    this.#originals.set(method, og);

    globalThis.console[method] = (...args) => {
      this.#log?.({ type: method, args });
    };
  }

  #restore() {
    for (let [method, og] of this.#originals)
      globalThis.console[method] = og;
  }
}

export function captureConsole() {
  return new CaptureConsole();
}
