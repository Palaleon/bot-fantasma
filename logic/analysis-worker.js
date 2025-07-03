import { parentPort } from 'worker_threads';
import logger from '../utils/logger.js';
import ChannelManager from '../modules/ChannelManager.js';
import timeSyncManager from '../utils/TimeSyncManager.js'; // Importar el sincronizador

logger.info('WORKER-ANALYSIS v1.2: Worker de Análisis con Sincronización de Tiempo y Timeframe Unificado iniciado.');

// Inyectamos la función de tiempo corregido en el ChannelManager
const manager = new ChannelManager(() => timeSyncManager.getCorregido());

const primingStatus = {};

// El timeframeMap ya no es necesario aquí, la normalización se hace en TCPConnector.
const EXPECTED_TIMEFRAMES_COUNT = 5; // Se define estáticamente: 1m, 5m, 10m, 15m, 30m

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

        const periodInSeconds = parseInt(timeframe.slice(0, -1)) * (timeframe.endsWith('s') ? 1 : 60);
        const candleCloseTimestamp = time + periodInSeconds;
        // Usamos el tiempo corregido para la comprobación
        const nowTimestamp = timeSyncManager.getCorregido() / 1000;
        
        const STALE_THRESHOLD_SECONDS = 15;

        if (nowTimestamp - candleCloseTimestamp > STALE_THRESHOLD_SECONDS) {
          logger.info(`WORKER-ANALYSIS: 🕯️ Vela de ${asset} [${timeframe}] descartada por ser obsoleta. Antigüedad: ${Math.round(nowTimestamp - candleCloseTimestamp)}s.`, { asset: asset });
          return;
        }

        const signal = manager.processCandle(candleData);
        
        if (signal) {
          // Usamos el tiempo corregido para generar el ID
          signal.id = `sig_${(timeSyncManager.getCorregido()).toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
          logger.warn(`WORKER-ANALYSIS: ✅ ¡Señal VIGENTE generada! [ID: ${signal.id}]`);
          parentPort.postMessage({ type: 'signal', data: signal });
        }
        break;
      
      case 'prime-indicators': {
        // --- CORRECCIÓN ---
        // Se desestructura el timeframe directamente como una cadena de texto (tfString).
        // Ya no se necesita el mapeo local porque TCPConnector ya ha normalizado el formato.
        const { asset: primeAsset, candles: historicalCandles, timeframe: tfString } = msg.data;
        
        logger.warn(`WORKER-ANALYSIS: Recibido paquete de ${historicalCandles.length} velas para ${primeAsset} (${tfString}). Impregnando... [${(primingStatus[primeAsset] || 0) + 1}/${EXPECTED_TIMEFRAMES_COUNT}]`, { asset: primeAsset });

        // La validación ahora comprueba directamente tfString.
        if (!primeAsset || !tfString || !historicalCandles || historicalCandles.length === 0) {
          logger.error('WORKER-ANALYSIS: Datos históricos inválidos, vacíos o sin timeframe válido.');
          return;
        }

        if (!primingStatus[primeAsset]) {
            primingStatus[primeAsset] = 0;
        }

        const channel = manager.getChannel(primeAsset, true);
        const sortedCandles = historicalCandles.sort((a, b) => a.time - b.time);
        
        // Se pasa tfString directamente al motor de indicadores.
        channel.indicatorEngine.prime(sortedCandles, tfString);
        logger.info(`WORKER-ANALYSIS: Indicadores para ${primeAsset} (${tfString}) impregnados con éxito.`, { asset: primeAsset });

        primingStatus[primeAsset]++;

        if (primingStatus[primeAsset] === EXPECTED_TIMEFRAMES_COUNT) {
            logger.warn(`ÉXITO TODOS LOS PAQUETES CARGADOS para el activo: ${primeAsset}`, { asset: primeAsset });
            delete primingStatus[primeAsset];
        }
        break;
      }

      default:
        logger.warn(`WORKER-ANALYSIS: Mensaje de tipo desconocido recibido: ${msg.type}`);
    }
  } catch (error) {
    logger.error(`WORKER-ANALYSIS: Error fatal en el worker: ${error.stack}`);
  }
});
