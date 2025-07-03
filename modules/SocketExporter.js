// /modules/SocketExporter.js (Versión WebSocket Corregida)
import { WebSocketServer } from 'ws';
import logger from '../utils/logger.js';

/**
 * SocketExporter v2.1 (WebSocket Directo Corregido)
 * Crea un servidor de WebSockets para exportar datos en tiempo real
 * directamente a clientes web (visualizadores).
 */
class SocketExporter {
  constructor(port) {
    this.port = port;
    this.wss = null; // WebSocket Server
  }

  /**
   * Inicia el servidor de WebSockets.
   */
  start() {
    this.wss = new WebSocketServer({ port: this.port });
    logger.info(`[SocketExporter] 📡 Servidor de exportación WebSocket escuchando en ws://localhost:${this.port}`);

    this.wss.on('connection', (ws) => {
      logger.info(`[SocketExporter] 🤝 Nuevo cliente de visualización conectado.`);
      ws.on('close', () => logger.info('[SocketExporter] 🚶 Cliente de visualización desconectado.'));
    });

    this.wss.on('error', (err) => {
      logger.error(`[SocketExporter] Error en el servidor WebSocket: ${err.stack}`);
    });
  }

  /**
   * Cierra el servidor y todas las conexiones de clientes.
   */
  stop() {
    logger.info('[SocketExporter] Deteniendo el servidor de exportación...');
    if (this.wss) {
      this.wss.close(() => {
        logger.info('[SocketExporter] Servidor detenido.');
      });
    }
  }

  /**
   * Transmite datos a todos los clientes web conectados.
   * Los datos se serializan a JSON.
   * @param {object} data - El objeto de datos a transmitir.
   */
  broadcast(data) {
    if (!this.wss || this.wss.clients.size === 0) return;

    try {
      const jsonData = JSON.stringify(data);
      this.wss.clients.forEach(client => {
        if (client.readyState === 1) { // 1 = OPEN
          // ---- LA CORRECCIÓN ESTÁ AQUÍ ----
          client.send(jsonData); // Se usa .send() en lugar de .write()
        }
      });
    } catch (error) {
      logger.error(`[SocketExporter] Error al serializar o transmitir datos: ${error.message}`);
    }
  }
}

export default SocketExporter;