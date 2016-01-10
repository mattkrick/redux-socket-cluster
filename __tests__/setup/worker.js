import express from 'express';

export function run(worker) {
  console.log('   >> Worker PID:', process.pid);
  const app = express();
  const httpServer = worker.httpServer;
  const scServer = worker.scServer;
  httpServer.on('request', app);
  scServer.on('connection', socket => {
    socket.on('close', (data, cb) => {
      worker.close();
      cb();
    });
  })
}
