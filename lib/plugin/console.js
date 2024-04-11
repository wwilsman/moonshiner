export class CaptureConsole {
  #methods = ['debug', 'error', 'info', 'log', 'warn'];
  #originals = new Map();
  #log;

  #enabled = true;

  configure(config) {
    if (config.captureConsole != null)
      this.#enabled = !!config.captureConsole;

    if (Array.isArray(config.captureConsole))
      this.#methods = [...config.captureConsole];
  }

  #context;

  apply(test) {
    this.#log = data => {
      test.emit('test:log', {
        test: this.#context?.test,
        ...data
      });
    };

    test.on('*', (event, data) => {
      if (event === 'test:ready') {
        this.#context = { test: data.test, previous: this.#context };
        if (this.#enabled) for (let method of this.#methods) this.#install(method);
      }

      if (event === 'test:skip' || event === 'test:pass' || event === 'test:fail') {
        this.#context = this.#context?.previous;
        if (this.#enabled) this.#restore();
      }
    });
  }

  #install(method) {
    this.#restore(method);

    let og = globalThis.console[method];
    this.#originals.set(method, og);

    globalThis.console[method] = (...args) => {
      this.#log?.({ type: method, args });
    };
  }

  #restore(method) {
    if (!method) {
      for (let [method] of this.#originals)
        this.#restore(method);
    } else {
      let og = this.#originals.get(method);
      if (og) globalThis.console[method] = og;
    }
  }
}

export function captureConsole() {
  return new CaptureConsole();
}
