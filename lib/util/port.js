import * as net from 'node:net';

export async function getFreePort() {
  return new Promise(resolve => {
    let srv = net.createServer();

    srv.listen(0, () => {
      let { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}
