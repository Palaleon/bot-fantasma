import net from 'net';
import logger from '../utils/logger.js';

/**
 * SocketExporter v1.0
 * 
 * Crea un servidor de Sockets TCP para exportar datos en tiempo real a clientes externos.
 * Gestiona múltiples conexiones de clientes y transmite datos en formato JSON.
 */
class SocketExporter {
  constructor(port) {
    this.port = port;
    this.clients = new Set();
    this.server = net.createServer(this._handleConnection.bind(this));

    this.server.on('error', (err) => {
      logger.error(`[SocketExporter] Error en el servidor: ${err.stack}`);
    });
  }

  /**
   * Inicia el servidor para que escuche en el puerto configurado.
   */
  start() {
    this.server.listen(this.port, () => {
      logger.info(`[SocketExporter] 📡 Servidor de exportación escuchando en el puerto ${this.port}`);
    });
  }

  /**
   * Cierra el servidor y todas las conexiones de clientes.
   */
  stop() {
    logger.info('[SocketExporter] Deteniendo el servidor de exportación...');
    this.clients.forEach(client => {
      client.end();
    });
    this.server.close(() => {
      logger.info('[SocketExporter] Servidor detenido.');
    });
  }

  /**
   * Gestiona una nueva conexión de cliente.
   * @param {net.Socket} socket - El socket del cliente conectado.
   * @private
   */
  _handleConnection(socket) {
    const remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    logger.info(`[SocketExporter] 🤝 Nuevo cliente conectado: ${remoteAddress}`);

    this.clients.add(socket);

    socket.on('data', (data) => {
      // Por ahora, no esperamos datos de los clientes, pero se podría implementar un sistema de comandos.
      logger.info(`[SocketExporter] Datos recibidos de ${remoteAddress}: ${data.toString().trim()}`);
    });

    socket.on('close', () => {
      logger.info(`[SocketExporter] 🚶 Cliente desconectado: ${remoteAddress}`);
      this.clients.delete(socket);
    });

    socket.on('error', (err) => {
      logger.error(`[SocketExporter] Error en el socket del cliente ${remoteAddress}: ${err.message}`);
      this.clients.delete(socket);
    });
  }

  /**
   * Transmite datos a todos los clientes conectados.
   * Los datos se serializan a JSON y se envía una nueva línea como delimitador.
   * @param {object} data - El objeto de datos a transmitir.
   */
  broadcast(data) {
    if (this.clients.size === 0) return;

    try {
      const jsonData = JSON.stringify(data) + '\n';
      this.clients.forEach(client => {
        if (client.writable) {
          client.write(jsonData);
        }
      });
    } catch (error) {
      logger.error(`[SocketExporter] Error al serializar o transmitir datos: ${error.message}`);
    }
  }
}

export default SocketExporter;
