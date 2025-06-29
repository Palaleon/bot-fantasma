import { parentPort } from 'worker_threads';
import logger from '../utils/logger.js';
import IndicatorEngine from '../modules/IndicatorEngine.js';
import ChannelManager from '../modules/ChannelManager.js';

logger.info('WORKER-ANALYSIS: Worker de Análisis iniciado.');

const manager = new ChannelManager();

// El motor de indicadores ahora es gestionado por ChannelManager,
// pero podemos tener una instancia de referencia si es necesario.
// const engine = new IndicatorEngine();

parentPort.on('message', (msg) => {
  try {
    switch (msg.type) {
      case 'start':
        parentPort.postMessage({ type: 'started' });
        logger.info('WORKER-ANALYSIS: Worker listo y escuchando.');
        break;

      case 'candle':
        // logger.warn(`[DEBUG-ANALYSIS] Recibida vela para ${msg.data.asset}`);
        const signal = manager.processCandle(msg.data);
        if (signal) {
          parentPort.postMessage({ type: 'signal', data: signal });
        }
        break;
      
      // **NUEVO: Lógica para impregnar los indicadores con velas históricas**
      case 'prime-indicators':
        const { asset, candles: historicalCandles } = msg.data;
        logger.warn(`WORKER-ANALYSIS: Recibido paquete de ${historicalCandles.length} velas históricas para ${asset}. Impregnando indicadores...`);

        if (!asset || !historicalCandles || historicalCandles.length === 0) {
          logger.error('WORKER-ANALYSIS: Datos históricos inválidos o vacíos.');
          return;
        }

        // Asegurarse de que el canal para este activo existe
        const channel = manager.getChannel(asset, true); // true para crear si no existe

        // Formatear las velas históricas al formato que espera el IndicatorEngine
        // El formato del broker es: [timestamp, open, close, high, low, volume, ?]
        // Nuestro formato es: { open, high, low, close, volume, time }
        const formattedCandles = historicalCandles.map(c => ({
          time: c.id, // o c.created_at, dependiendo de cuál sea el timestamp correcto
          open: c.open,
          close: c.close,
          high: c.high,
          low: c.low,
          volume: c.volume
        })).sort((a, b) => a.time - b.time); // Asegurarse de que están en orden cronológico

        // Impregnar el motor de indicadores del canal con las velas formateadas
        channel.indicatorEngine.prime(formattedCandles);
        logger.info(`WORKER-ANALYSIS: Indicadores para ${asset} impregnados con éxito. Listo para análisis en tiempo real.`);
        break;

      default:
        logger.warn(`WORKER-ANALYSIS: Mensaje de tipo desconocido recibido: ${msg.type}`);
    }
  } catch (error) {
    logger.error(`WORKER-ANALYSIS: Error fatal en el worker: ${error.stack}`);
  }
});