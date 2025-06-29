import net from 'net';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

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
}

export default TCPConnector;
