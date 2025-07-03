import net from 'net';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import timeSyncManager from '../utils/TimeSyncManager.js'; // Importar el sincronizador

// Mapeo de temporalidades de segundos a formato de texto estándar
const timeframeMap = {
    5: '5s',
    60: '1m',
    300: '5m',
    600: '10m',
    900: '15m',
    1800: '30m'
};

class TCPConnector extends EventEmitter {
  constructor(port, host) {
    super();
    this.port = port;
    this.host = host;
    this.client = new net.Socket();
    this.reconnectInterval = 5000; // 5 segundos
    this.buffer = ''; // Búfer para ensamblar datos del stream

    this.client.on('data', (data) => {
      this._handleData(data);
    });

    this.client.on('close', () => {
      logger.warn('Conexión con Harvester perdida. Reintentando en 5s...');
      setTimeout(() => this.connect(), this.reconnectInterval);
    });

    this.client.on('error', (err) => {
      logger.error(`Error de conexión: ${err.message}`);
    });
  }

  connect() {
    logger.info(`Conectando a Harvester en ${this.host}:${this.port}...`);
    this.client.connect(this.port, this.host, () => {
      logger.info('✅ Conexión establecida con Harvester.');
      this.emit('connected');
    });
  }

  _handleData(data) {
    const delimiter = '\n==EOM==\n';
    this.buffer += data.toString();
    let boundary = this.buffer.indexOf(delimiter);

    while (boundary !== -1) {
      const messageString = this.buffer.substring(0, boundary);
      this.buffer = this.buffer.substring(boundary + delimiter.length);

      if (messageString) {
        try {
          const parsed = JSON.parse(messageString);
          const asset = parsed.payload ? parsed.payload.asset : undefined;

          //logger.debug(`Mensaje parseado: ${JSON.stringify(parsed)}`, { asset });

          if (parsed.type && parsed.payload) {
            // --- INICIO DE LA NORMALIZACIÓN ---
            // Estandariza el timeframe a formato de texto si viene como número.
            // Esto es crucial para que los módulos como IndicatorEngine y ChannelManager
            // no creen duplicados para el mismo intervalo (ej. 60 y '1m').
            if (parsed.payload.timeframe && typeof parsed.payload.timeframe === 'number') {
                const originalTimeframe = parsed.payload.timeframe;
                const mappedTimeframe = timeframeMap[originalTimeframe];
                if (mappedTimeframe) {
                    logger.debug(`Normalizando timeframe numérico ${originalTimeframe} a '${mappedTimeframe}' para el activo ${asset}.`, { asset });
                    parsed.payload.timeframe = mappedTimeframe;
                } else {
                    logger.warn(`Timeframe numérico ${originalTimeframe} no tiene un mapeo a texto.`, { asset });
                }
            }

            // Si el payload contiene un array de velas (caso de datos históricos),
            // se normaliza el timeframe de cada vela individualmente.
            if (Array.isArray(parsed.payload.candles)) {
                parsed.payload.candles.forEach(candle => {
                    if (candle.timeframe && typeof candle.timeframe === 'number') {
                        const originalTimeframe = candle.timeframe;
                        const mappedTimeframe = timeframeMap[originalTimeframe];
                        if (mappedTimeframe) {
                            candle.timeframe = mappedTimeframe;
                        }
                    }
                });
            }
            // --- FIN DE LA NORMALIZACIÓN ---

            if (parsed.type === 'pip' && parsed.payload.timestamp) {
              const brokerTimestampMs = parsed.payload.timestamp * 1000;
              timeSyncManager.update(brokerTimestampMs);
              logger.info(`PIP Recibido: ${parsed.payload.price} | ID: ${parsed.payload.sequence_id}`, { asset: parsed.payload.asset });
            }
            this.emit(parsed.type, parsed.payload);
          } else {
            logger.warn(`Mensaje sin 'type' o 'payload': ${messageString}`);
          }
        } catch (error) {
          logger.error(`Error parseando mensaje JSON: ${error.message}. Mensaje: "${messageString}"`);
        }
      }
      
      boundary = this.buffer.indexOf(delimiter);
    }
  }

  disconnect() {
    logger.info('Desconectando de Harvester...');
    this.client.destroy();
  }

}

export default TCPConnector;
