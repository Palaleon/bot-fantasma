import { parentPort } from 'worker_threads';
import logger from '../utils/logger.js';
import CandleBuilder from './CandleBuilder.js';
import timeSyncManager from '../utils/TimeSyncManager.js';

logger.info('WORKER-PIP v2.2: Worker de Pips con Secuenciador y Sincronización de Tiempo iniciado.');

const assetBuilders = {};
const expectedSequenceIds = {}; // Almacena el próximo ID esperado por activo
const pipBuffers = {}; // "Sala de espera" para pips fuera de orden

const timeframes = {
    '5s': 5,
    '1m': 60,
    '5m': 300,
    '15m': 900
};

const ensureAssetBuilders = (asset) => {
  if (!assetBuilders[asset]) {
    logger.info(`WORKER-PIP: Creando juego de CandleBuilders para nuevo activo: ${asset}`, { asset: asset });
    assetBuilders[asset] = {};
    for (const [key, periodInSeconds] of Object.entries(timeframes)) {
        const builder = new CandleBuilder(periodInSeconds, key, asset, () => Math.floor(timeSyncManager.getCorregido() / 1000));
        builder.on('candleClosed', (candleData) => {
            parentPort.postMessage({ 
                type: 'candleClosed', 
                data: { ...candleData, asset: asset, timeframe: key } 
            });
        });
        builder.on('candleUpdated', (candleData) => {
            parentPort.postMessage({
                type: 'liveCandleUpdate',
                data: { ...candleData, asset: asset, timeframe: key }
            });
        });
        assetBuilders[asset][key] = builder;
    }
  }
};

const processPip = (pipData) => {
    const { asset, price, timestamp } = pipData;
    
    const brokerTimestampMs = timestamp * 1000;
    timeSyncManager.update(brokerTimestampMs);

    ensureAssetBuilders(asset);

    for (const builder of Object.values(assetBuilders[asset])) {
        builder.addPip({ price, timestamp });
    }
};

const processBuffer = (asset) => {
    if (!pipBuffers[asset]) return;

    let nextPip = pipBuffers[asset][expectedSequenceIds[asset]];
    while (nextPip) {
        //logger.info(`WORKER-PIP: Procesando pip desde buffer para ${asset}, ID: ${nextPip.sequence_id}`);
        processPip(nextPip);
        delete pipBuffers[asset][expectedSequenceIds[asset]];
        expectedSequenceIds[asset]++;
        nextPip = pipBuffers[asset][expectedSequenceIds[asset]];
    }
};

parentPort.on('message', (msg) => {
  try {
    const { type, data } = msg;

    switch (type) {
      case 'start':
        parentPort.postMessage({ type: 'started' });
        logger.info('WORKER-PIP v2.2: Listo y escuchando.');
        break;

      case 'pip':
        const { asset, price, timestamp, sequence_id } = data;
        if (!asset || price === undefined || !timestamp || sequence_id === undefined) {
            logger.warn('WORKER-PIP: Pip inválido recibido (faltan datos).', { data });
            return;
        }

        if (!expectedSequenceIds[asset]) {
            expectedSequenceIds[asset] = 1;
            pipBuffers[asset] = {};
        }

        if (sequence_id < expectedSequenceIds[asset]) {
            //logger.warn(`WORKER-PIP: Pip duplicado o antiguo recibido para ${asset}. ID: ${sequence_id}, esperado: ${expectedSequenceIds[asset]}. Se ignora.`);
            return;
        }

        if (sequence_id > expectedSequenceIds[asset]) {
            //logger.warn(`WORKER-PIP: Pip fuera de orden para ${asset}. ID: ${sequence_id}, esperado: ${expectedSequenceIds[asset]}. Almacenando en buffer.`);
            pipBuffers[asset][sequence_id] = data;
            return;
        }

        if (sequence_id === expectedSequenceIds[asset]) {
            processPip(data);
            expectedSequenceIds[asset]++;
            processBuffer(asset);
        }
        break;

      case 'prime-current-candle': {
        const { asset: primeAsset, history } = data;
        if (!primeAsset || !history || history.length === 0) return;
        
        logger.warn(`WORKER-PIP: Reconstruyendo velas actuales para ${primeAsset} con ${history.length} ticks.`, { asset: primeAsset });
        ensureAssetBuilders(primeAsset);
        
        const formattedTicks = history.map(tick => ({
          timestamp: tick[0],
          price: tick[1]
        })).sort((a, b) => a.timestamp - b.timestamp);

        for (const tick of formattedTicks) {
            for (const builder of Object.values(assetBuilders[primeAsset])) {
                builder.addPip(tick, true);
            }
        }
        break;
      }

      default:
        logger.warn(`WORKER-PIP: Mensaje de tipo desconocido recibido: ${type}`);
    }
  } catch (error) {
    logger.error(`WORKER-PIP: Error fatal en el worker: ${error.stack}`);
  }
});
