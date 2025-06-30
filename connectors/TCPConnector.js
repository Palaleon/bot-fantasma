import net from 'net';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

/**
 * Conector TCP v2.0 - Robusto con Búfer de Stream
 * 
 * Misión: Conectarse al Harvester de Python, recibir los datos de precarga
 * y pips en tiempo real, y emitirlos para que el resto del bot los consuma.
 * CAMBIO v2.0: Implementa un búfer para manejar streams TCP, previniendo errores de parseo JSON.
 */
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
      logger.warn('[TCPConnector] Conexión con Harvester perdida. Reintentando en 5s...');
      setTimeout(() => this.connect(), this.reconnectInterval);
    });

    this.client.on('error', (err) => {
      logger.error(`[TCPConnector] Error de conexión: ${err.message}`);
      // El evento 'close' se llamará después, manejando la reconexión.
    });
  }

  connect() {
    logger.info(`[TCPConnector] Conectando a Harvester en ${this.host}:${this.port}...`);
    this.client.connect(this.port, this.host, () => {
      logger.info('[TCPConnector] ✅ Conexión establecida con Harvester.');
      this.emit('connected');
    });
  }

  _handleData(data) {
    this.buffer += data.toString();
    let boundary = this.buffer.indexOf('\n');

    while (boundary !== -1) {
      const messageString = this.buffer.substring(0, boundary);
      this.buffer = this.buffer.substring(boundary + 1);

      if (messageString) {
        try {
          const parsed = JSON.parse(messageString);
          if (parsed.type && parsed.payload) {
            this.emit(parsed.type, parsed.payload);
          }
        } catch (error) {
          logger.error(`[TCPConnector] Error parseando mensaje JSON: ${error.message}. Mensaje: "${messageString}"`);
        }
      }
      
      boundary = this.buffer.indexOf('\n');
    }
  }

  disconnect() {
    logger.info('[TCPConnector] Desconectando de Harvester...');
    this.client.destroy();
  }
}

export default TCPConnector;
