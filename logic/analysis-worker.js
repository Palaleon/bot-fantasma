import { parentPort } from 'worker_threads';
import logger from '../utils/logger.js';
import IndicatorEngine from '../modules/IndicatorEngine.js';
import ChannelManager from '../modules/ChannelManager.js';

logger.info('WORKER-ANALYSIS: Worker de Análisis iniciado.');

const manager = new ChannelManager();

// El motor de indicadores ahora es gestionado por ChannelManager,
// pero podemos tener una instancia de referencia si es necesario.
// const engine = new IndicatorEngine();

const timeframeMap = {
  60: '1m',
  300: '5m',
  600: '10m',
  900: '15m',
  1800: '30m'
};

parentPort.on('message', (msg) => {
  try {
    switch (msg.type) {
      case 'start':
        parentPort.postMessage({ type: 'started' });
        logger.info('WORKER-ANALYSIS: Worker listo y escuchando.');
        break;

      case 'candle':
        const candleData = msg.data;
        const { time, timeframe, asset } = candleData;

        // --- FILTRO DE RELEVANCIA TEMPORAL ---
        const periodInSeconds = parseInt(timeframe.slice(0, -1)) * (timeframe.endsWith('s') ? 1 : 60);
        const candleCloseTimestamp = time + periodInSeconds;
        const nowTimestamp = Date.now() / 1000;
        
        const STALE_THRESHOLD_SECONDS = 15;

        if (nowTimestamp - candleCloseTimestamp > STALE_THRESHOLD_SECONDS) {
          logger.info(`WORKER-ANALYSIS: 🕯️ Vela de ${asset} [${timeframe}] descartada por ser obsoleta. Antigüedad: ${Math.round(nowTimestamp - candleCloseTimestamp)}s.`);
          return;
        }
        // --- FIN DEL FILTRO ---

        const signal = manager.processCandle(candleData);
        
        if (signal) {
          // --- ASIGNACIÓN DE ID ÚNICO ---
          signal.id = `sig_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
          logger.warn(`WORKER-ANALYSIS: ✅ ¡Señal VIGENTE generada! [ID: ${signal.id}]`);
          parentPort.postMessage({ type: 'signal', data: signal });
        }
        break;
      
      case 'prime-indicators':
        const { asset: primeAsset, candles: historicalCandles, timeframe: tfSeconds } = msg.data;
        const tfString = timeframeMap[tfSeconds];

        logger.warn(`WORKER-ANALYSIS: Recibido paquete de ${historicalCandles.length} velas para ${primeAsset} (${tfSeconds}s -> ${tfString}). Impregnando...`);

        if (!primeAsset || !tfString || !historicalCandles || historicalCandles.length === 0) {
          logger.error('WORKER-ANALYSIS: Datos históricos inválidos, vacíos o sin timeframe válido.');
          return;
        }

        const channel = manager.getChannel(primeAsset, true);
        const sortedCandles = historicalCandles.sort((a, b) => a.time - b.time);

        channel.indicatorEngine.prime(sortedCandles, tfString);
        
        logger.info(`WORKER-ANALYSIS: Indicadores para ${primeAsset} (${tfString}) impregnados con éxito.`);
        break;

      default:
        logger.warn(`WORKER-ANALYSIS: Mensaje de tipo desconocido recibido: ${msg.type}`);
    }
  } catch (error) {
    logger.error(`WORKER-ANALYSIS: Error fatal en el worker: ${error.stack}`);
  }
});