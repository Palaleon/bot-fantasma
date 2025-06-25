import net from 'net';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import config from '../../config/index.js';
import CandleBuilder from '../logic/CandleBuilder.js';

class PipReceiver extends EventEmitter {
  constructor() {
    super();
    this.client = new net.Socket();
    this.buffer = '';
    this.reconnectInterval = 5000;
    this.candleBuilder = new CandleBuilder((closedCandle) => {
      this.emit('velaCerrada', closedCandle);
    });
    this.setupListeners();
  }

  setupListeners() {
    this.client.on('connect', () => {
      logger.info(`✅ Conectado al analizador en ${config.tcpHost}:${config.tcpPort}`);
    });

    this.client.on('data', (chunk) => {
      this.buffer += chunk.toString();
      let boundary = this.buffer.indexOf('\n');
      while (boundary !== -1) {
        const message = this.buffer.substring(0, boundary);
        this.buffer = this.buffer.substring(boundary + 1);
        if (message) {
          this.handleRawMessage(message);
        }
        boundary = this.buffer.indexOf('\n');
      }
    });

    this.client.on('close', () => {
      logger.warn('🔌 Conexión con el analizador cerrada. Intentando reconectar...');
      this.reconnect();
    });

    this.client.on('error', (err) => {
      logger.error(`Error en la conexión TCP: ${err.message}`);
    });
  }

  handleRawMessage(jsonMessage) {
    try {
      const message = JSON.parse(jsonMessage);
      if (message.event === 'pipUpdate' && message.data) {
        const pipData = message.data;
        if (pipData.pip && pipData.raw_asset && pipData.pip_timestamp_ms) {
          this.candleBuilder.addPip(pipData);
        } else {
          logger.warn('Pip recibido con datos incompletos. Descartado.');
        }
      }
    } catch (error) {
      logger.error(`Error al parsear mensaje JSON: ${error.message}`);
    }
  }

  connect() {
    logger.info(`📡 Intentando conectar al analizador en ${config.tcpHost}:${config.tcpPort}...`);
    this.client.connect(config.tcpPort, config.tcpHost);
  }

  start() {
    this.connect();
  }

  reconnect() {
    setTimeout(() => {
      logger.info('Reintentando conexión...');
      this.connect();
    }, this.reconnectInterval);
  }

  stop() {
    logger.info('PipReceiver: Cerrando conexión con el analizador.');
    this.client.destroy();
  }
}

export default PipReceiver;