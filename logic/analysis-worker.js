import { parentPort } from 'worker_threads';
import logger from '../utils/logger.js';
import IndicatorEngine from '../modules/IndicatorEngine.js';
import ChannelManager from '../modules/ChannelManager.js';

logger.info('WORKER-ANALYSIS: Worker de Análisis iniciado.');

const manager = new ChannelManager();

// --- INICIO DE LA MODIFICACIÓN ---
const primingStatus = {}; // Objeto para seguir el estado de la impregnación por activo

const timeframeMap = {
  60: '1m',
  300: '5m',
  600: '10m',
  900: '15m',
  1800: '30m'
};

// Se calcula dinámicamente el número de timeframes que este worker espera procesar.
const EXPECTED_TIMEFRAMES_COUNT = Object.keys(timeframeMap).length;
// --- FIN DE LA MODIFICACIÓN ---

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
          logger.info(`WORKER-ANALYSIS: 🕯️ Vela de ${asset} [${timeframe}] descartada por ser obsoleta. Antigüedad: ${Math.round(nowTimestamp - candleCloseTimestamp)}s.`, { asset: asset });
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
      
      // --- INICIO DE LA MODIFICACIÓN ---
      case 'prime-indicators': {
        const { asset: primeAsset, candles: historicalCandles, timeframe: tfSeconds } = msg.data;
        const tfString = timeframeMap[tfSeconds];
        
        // Log mejorado que muestra el progreso de la carga actual
        logger.warn(`WORKER-ANALYSIS: Recibido paquete de ${historicalCandles.length} velas para ${primeAsset} (${tfString}). Impregnando... [${(primingStatus[primeAsset] || 0) + 1}/${EXPECTED_TIMEFRAMES_COUNT}]`, { asset: primeAsset });

        if (!primeAsset || !tfString || !historicalCandles || historicalCandles.length === 0) {
          logger.error('WORKER-ANALYSIS: Datos históricos inválidos, vacíos o sin timeframe válido.');
          return;
        }

        // Se inicializa el contador para el activo si es la primera vez que se ve
        if (!primingStatus[primeAsset]) {
            primingStatus[primeAsset] = 0;
        }

        // Lógica de impregnación existente
        const channel = manager.getChannel(primeAsset, true);
        const sortedCandles = historicalCandles.sort((a, b) => a.time - b.time);
        channel.indicatorEngine.prime(sortedCandles, tfString);
        logger.info(`WORKER-ANALYSIS: Indicadores para ${primeAsset} (${tfString}) impregnados con éxito.`, { asset: primeAsset });

        // Se incrementa el contador de paquetes recibidos para este activo
        primingStatus[primeAsset]++;

        // Se comprueba si ya se recibieron todos los paquetes esperados
        if (primingStatus[primeAsset] === EXPECTED_TIMEFRAMES_COUNT) {
            logger.warn(`ÉXITO TODOS LOS PAQUETES CARGADOS para el activo: ${primeAsset}`, { asset: primeAsset });
            // Se limpia el estado del activo para permitir futuras reimpregnaciones si fuera necesario
            delete primingStatus[primeAsset];
        }
        break;
      }
      // --- FIN DE LA MODIFICACIÓN ---

      default:
        logger.warn(`WORKER-ANALYSIS: Mensaje de tipo desconocido recibido: ${msg.type}`);
    }
  } catch (error) {
    logger.error(`WORKER-ANALYSIS: Error fatal en el worker: ${error.stack}`);
  }
});