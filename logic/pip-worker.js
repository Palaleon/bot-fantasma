import { parentPort } from 'worker_threads';
import logger from '../utils/logger.js';
import CandleBuilder from './CandleBuilder.js';

logger.info('WORKER-PIP v2.0: Worker de Pips Multi-Temporalidad iniciado.');

// Objeto para almacenar builders por activo y por temporalidad
// Estructura: { "EURUSD_otc": { "5s": CandleBuilder, "1m": CandleBuilder, ... } }
const assetBuilders = {};

// Define las temporalidades que vamos a construir
const timeframes = {
    '5s': 5,
    '1m': 60,
    '5m': 300,
    '15m': 900
};

// Función para asegurar que todos los builders de un activo existen
const ensureAssetBuilders = (asset) => {
  if (!assetBuilders[asset]) {
    logger.info(`WORKER-PIP: Creando juego de CandleBuilders para nuevo activo: ${asset}`);
    assetBuilders[asset] = {};
    for (const [key, periodInSeconds] of Object.entries(timeframes)) {
<<<<<<< HEAD
        const builder = new CandleBuilder(periodInSeconds, key); // CORREGIDO: Pasar el timeframe string
=======
        const builder = new CandleBuilder(periodInSeconds);
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
        builder.on('candleClosed', (candleData) => {
            parentPort.postMessage({ 
                type: 'candleClosed', 
                data: { ...candleData, asset: asset, timeframe: key } // Añadimos la temporalidad
            });
        });
        assetBuilders[asset][key] = builder;
    }
  }
};


parentPort.on('message', (msg) => {
  try {
    const { type, data } = msg;

    switch (type) {
      case 'start':
        parentPort.postMessage({ type: 'started' });
        logger.info('WORKER-PIP v2.0: Listo y escuchando.');
        break;

      case 'pip':
<<<<<<< HEAD
        const { asset, price, timestamp } = data; // CORREGIDO: usar 'asset' según el formato del harvester
        if (!asset || price === undefined || !timestamp) return;
        
        // Log para confirmar la recepción de pips
        logger.info(`WORKER-PIP: Recibido pip para ${asset} -> ${price}`);

        ensureAssetBuilders(asset);

        // Alimentar el pip a todos los builders para este activo
        for (const builder of Object.values(assetBuilders[asset])) {
=======
        const { rawAsset, price, timestamp } = data;
        if (!rawAsset || price === undefined || !timestamp) return;
        
        ensureAssetBuilders(rawAsset);

        // Alimentar el pip a todos los builders para este activo
        for (const builder of Object.values(assetBuilders[rawAsset])) {
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
            builder.addPip({ price, timestamp });
        }
        break;

<<<<<<< HEAD
      case 'prime-current-candle': {
        const { asset: primeAsset, history } = data; // RENOMBRADO para evitar colisión
        if (!primeAsset || !history || history.length === 0) return;
        
        logger.warn(`WORKER-PIP: Reconstruyendo velas actuales para ${primeAsset} con ${history.length} ticks.`);
        ensureAssetBuilders(primeAsset);
=======
      case 'prime-current-candle':
        const { asset, history } = data;
        if (!asset || !history || history.length === 0) return;
        
        logger.warn(`WORKER-PIP: Reconstruyendo velas actuales para ${asset} con ${history.length} ticks.`);
        ensureAssetBuilders(asset);
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
        
        const formattedTicks = history.map(tick => ({
          timestamp: tick[0],
          price: tick[1]
        })).sort((a, b) => a.timestamp - b.timestamp);

        // Procesar cada tick histórico en todos los builders del activo
        for (const tick of formattedTicks) {
<<<<<<< HEAD
            for (const builder of Object.values(assetBuilders[primeAsset])) {
=======
            for (const builder of Object.values(assetBuilders[asset])) {
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
                builder.addPip(tick, true); // `true` para modo priming
            }
        }
        break;
<<<<<<< HEAD
      }
=======
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71

      default:
        logger.warn(`WORKER-PIP: Mensaje de tipo desconocido recibido: ${type}`);
    }
  } catch (error) {
    logger.error(`WORKER-PIP: Error fatal en el worker: ${error.stack}`);
  }
});