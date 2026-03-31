import { configure } from 'moonshiner';
import { fork } from 'node:child_process';

let remoteProc;

configure({
  require: './tests/remote.close.harness.test.js',
  plugins: [
    test => {
      test.on('test:start', () => {
        // Kill the remote process shortly after tests start to simulate unexpected close
        setTimeout(() => {
          if (remoteProc && !remoteProc.killed) {
            console.log('[test] Killing remote process to simulate unexpected close');
            remoteProc.kill('SIGKILL');
          }
        }, 200);
      });

      test.trigger('remote:connect', {
        remote: () => {
          remoteProc = fork('./tests/remote.close.harness.test.js', {
            env: { __MOONSHINER_REMOTE__: 'process' }
          });
          return remoteProc;
        }
      });
    }
  ]
});
