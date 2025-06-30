import net from 'net';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

<<<<<<< HEAD
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
=======
const TCP_HOST = '127.0.0.1';
const TCP_PORT = 8765; // Debe coincidir con el del harvester.py
const RECONNECT_INTERVAL = 5000; // 5 segundos

class TCPConnector extends EventEmitter {
    constructor() {
        super();
        this.client = null;
        this.buffer = '';
    }

    connect() {
        this.client = new net.Socket();
        logger.info(`TCP: Conectando a Harvester en ${TCP_HOST}:${TCP_PORT}...`);

        this.client.connect(TCP_PORT, TCP_HOST, () => {
            logger.info('TCP: Conexión establecida con Harvester.');
        });

        this.client.on('data', (data) => {
            this.buffer += data.toString();
            this.processBuffer();
        });

        this.client.on('close', () => {
            logger.error('TCP: Conexión con Harvester perdida. Reintentando en 5 segundos...');
            setTimeout(() => this.connect(), RECONNECT_INTERVAL);
        });

        this.client.on('error', (err) => {
            // El 'close' event se encargará de la reconexión.
            logger.error(`TCP: Error de conexión: ${err.message}`);
        });
    }

    processBuffer() {
        let newlineIndex;
        // CORRECCIÓN: El '
' debe estar en una sola línea.
        while ((newlineIndex = this.buffer.indexOf('
')) !== -1) {
            const message = this.buffer.substring(0, newlineIndex);
            this.buffer = this.buffer.substring(newlineIndex + 1);

            try {
                const data = JSON.parse(message);
                this.emit(data.type, data.payload);
            } catch (e) {
                logger.warn(`TCP: Error parseando JSON del Harvester: ${e.message} - Mensaje: "${message}"`);
            }
        }
    }
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
}

export default TCPConnector;
