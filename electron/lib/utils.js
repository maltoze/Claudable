async function findFreePort(preferPort) {
  try {
    // Use dynamic import to support ESM-only module in CJS context
    const mod = await import('get-port');
    const getPort = mod && (mod.default || mod);
    const port = await getPort({ port: preferPort });
    return port;
  } catch (e) {
    // Fallback: try preferPort; if busy, ask OS for a free ephemeral port
    const net = require('net');
    return await new Promise((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => {
        const s2 = net.createServer();
        s2.listen(0, '127.0.0.1', () => {
          const addr = s2.address();
          const port = typeof addr === 'object' && addr ? addr.port : preferPort;
          s2.close(() => resolve(port));
        });
      });
      srv.listen(preferPort, '127.0.0.1', () => {
        const addr = srv.address();
        const port = typeof addr === 'object' && addr ? addr.port : preferPort;
        srv.close(() => resolve(port));
      });
    });
  }
}

module.exports = { findFreePort };