export function createTestHook(hook) {
  // local user teardown
  let unhook = null;

  // after setup, set local user teardown
  let setup = async args => {
    let result = await hook(...args);
    if (typeof result === 'function')
      unhook = result;
  };

  // calls and resets local user teardown
  let teardown = async () => {
    await unhook?.();
    unhook = null;
  };

  // auto-teardown before setup
  return async (...args) => {
    await teardown();
    await setup(args);

    // return for manual teardown
    return teardown;
  };
}
