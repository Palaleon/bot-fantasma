import { parentPort } from 'worker_threads';
import CandleBuilder from './CandleBuilder.js';

let candleBuilder;

parentPort.on('message', (message) => {
  const { type, data } = message;

  if (type === 'start') {
    candleBuilder = new CandleBuilder((closedCandle) => {
      // logger.warn(`[DEBUG-AUDIT] pip-worker: Enviando vela cerrada: ${closedCandle.asset} | ${closedCandle.timeframe}`);
      parentPort.postMessage({ type: 'candleClosed', data: closedCandle });
    });
    parentPort.postMessage({ type: 'started' });
  } else if (type === 'pip') {
    if (candleBuilder) {
      candleBuilder.addPip(data);
    }
  }
});
