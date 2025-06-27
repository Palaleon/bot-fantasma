import { parentPort } from 'worker_threads';
import ChannelManager from '../modules/ChannelManager.js';

let channelManager;

parentPort.on('message', (message) => {
  const { type, data } = message;

  if (type === 'start') {
    channelManager = new ChannelManager();
    channelManager.on('señalMultiCanal', (signal) => {
      parentPort.postMessage({ type: 'signal', data: signal });
    });
    parentPort.postMessage({ type: 'started' });
  } else if (type === 'candle') {
    if (channelManager) {
      channelManager._handleClosedCandle(data);
    }
  }
});
