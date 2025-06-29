import { parentPort } from 'worker_threads';
import logger from '../utils/logger.js';
import CandleBuilder from './CandleBuilder.js';

logger.info('WORKER-PIP: Worker de Pips iniciado.');

// Almacena un CandleBuilder por cada activo
const candleBuilders = {};

const getCandleBuilder = (asset) => {
  if (!candleBuilders[asset]) {
    logger.info(`WORKER-PIP: Creando nuevo CandleBuilder para el activo: ${asset}`);
    candleBuilders[asset] = new CandleBuilder(60); // Asumiendo velas de 60 segundos

    // Escuchar el evento 'candleClosed' del nuevo builder
    candleBuilders[asset].on('candleClosed', (candleData) => {
      // logger.warn(`[DEBUG-PIP] Vela cerrada para ${asset}. Enviando a app.js...`);
      parentPort.postMessage({ type: 'candleClosed', data: { ...candleData, asset } });
    });
  }
  return candleBuilders[asset];
};


parentPort.on('message', (msg) => {
  try {
    const { type, data } = msg;

    switch (type) {
      case 'start':
        parentPort.postMessage({ type: 'started' });
        logger.info('WORKER-PIP: Worker listo y escuchando.');
        break;

      case 'pip':
        // El asset ahora viene dentro de 'data'
        const { rawAsset, price, timestamp } = data;
        if (!rawAsset || !price || !timestamp) {
            // logger.warn('WORKER-PIP: Recibido pip inválido, saltando.', data);
            return;
        }
        const candleBuilder = getCandleBuilder(rawAsset);
        candleBuilder.addPip({ price, timestamp });
        break;

      // **NUEVO: Lógica para reconstruir la vela actual a partir de datos históricos**
      case 'prime-current-candle':
        const { asset, history } = data;
        if (!asset || !history || history.length === 0) {
          logger.error('WORKER-PIP: Datos históricos para vela actual inválidos o vacíos.');
          return;
        }
        
        logger.warn(`WORKER-PIP: Reconstruyendo vela actual para ${asset} con ${history.length} ticks históricos.`);

        const builder = getCandleBuilder(asset);
        
        // Formatear y ordenar los ticks históricos
        // Formato broker: [timestamp, price, ¿?]
        const formattedTicks = history.map(tick => ({
          timestamp: tick[0],
          price: tick[1]
        })).sort((a, b) => a.timestamp - b.timestamp);

        // Procesar cada tick para construir el estado de la vela actual
        formattedTicks.forEach(tick => {
          builder.addPip(tick, true); // El 'true' evita que se dispare el cierre de vela
        });
        
        // logger.info(`WORKER-PIP: Vela actual para ${asset} reconstruida.`);
        break;

      default:
        logger.warn(`WORKER-PIP: Mensaje de tipo desconocido recibido: ${type}`);
    }
  } catch (error) {
    logger.error(`WORKER-PIP: Error fatal en el worker: ${error.stack}`);
  }
});