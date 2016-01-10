import {SocketCluster} from 'socketcluster';
import path from 'path';

const options = {
  authKey: '123',
  logLevel: 1,
  workers: 1,
  brokers: 1,
  port: 40000,
  appName: 'testing',
  allowClientPublish: false,
  initController: path.join(__dirname, '/init.js'),
  workerController: path.join(__dirname, '/worker.js'),
  brokerController: path.join(__dirname, '/broker.js'),
  socketChannelLimit: 1000,
  rebootWorkerOnCrash: false,
  rebootOnSignal: false
};

export default (test,port) => {
  options.port = port;
  const socketCluster = new SocketCluster(options);
  socketCluster.on('ready', test);
}
