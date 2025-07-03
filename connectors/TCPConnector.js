import net from 'net';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import timeSyncManager from '../utils/TimeSyncManager.js'; // Importar el sincronizador

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

          logger.debug(`Mensaje parseado: ${JSON.stringify(parsed)}`, { asset });

          if (parsed.type && parsed.payload) {
            if (parsed.type === 'pip' && parsed.payload.timestamp) {
              const brokerTimestampMs = parsed.payload.timestamp * 1000;
              timeSyncManager.update(brokerTimestampMs);
              logger.debug(`Pip detectado. ID: ${parsed.payload.sequence_id}, Timestamp: ${parsed.payload.timestamp}, Precio: ${parsed.payload.price}`, { asset });
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
