import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

/**
 * WebSocket Injector v3.0 - Módulo de Ejecución de Órdenes
 * 
 * Misión ÚNICA: Inyectar un proxy en la página del broker para obtener una
 * referencia directa al WebSocket de trading. Esta referencia es utilizada
 * exclusivamente por el BrokerConnector para ENVIAR órdenes de trading.
 * 
 * ESTE MÓDULO NO RECIBE NI PROCESA DATOS ENTRANTES.
 */
class WebSocketInjector extends EventEmitter {
  constructor(id) {
    super();
    this.id = id;
    this.page = null;
    this.client = null;
    this.isInitialized = false;
    this.targetUrl = 'wss://ws2.qxbroker.com/socket.io/'; // URL fija del socket de trading

    logger.info(`[${this.id}] Injector de Órdenes listo.`);
  }

  async initialize(page) {
    if (this.isInitialized) {
      logger.warn(`[${this.id}] Ya inicializado. Saltando.`);
      return;
    }
    this.page = page;

    logger.info(`[${this.id}] Inyectando proxy de WebSocket en la página...`);
    await this.injectProxy();
    
    this.isInitialized = true;
    logger.info(`[${this.id}] ✅ Inyección completada. El sistema está listo para enviar órdenes.`);
  }

  /**
   * Inyecta un script en la página que sobreescribe el constructor de WebSocket
   * para capturar la instancia utilizada para el trading.
   */
  async injectProxy() {
    await this.page.evaluateOnNewDocument((targetUrl) => {
      const OriginalWebSocket = window.WebSocket;
      window.WebSocket = function(url, protocols) {
        const wsInstance = new OriginalWebSocket(url, protocols);
        // Capturamos la instancia específica que usa el broker para las operaciones
        if (url.startsWith(targetUrl)) {
          console.log(`[Injector] Capturado el WebSocket de trading: ${url}`);
          window.qxMainSocket = wsInstance; // La referencia global que usará el BrokerConnector
        }
        return wsInstance;
      };
      window.WebSocket.prototype = OriginalWebSocket.prototype;
    }, this.targetUrl);
  }

  stop() {
    this.isInitialized = false;
    logger.info(`[${this.id}] Injector detenido.`);
  }
}

export default WebSocketInjector;