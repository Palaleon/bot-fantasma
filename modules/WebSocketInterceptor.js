import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

<<<<<<< HEAD
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
=======
class WebSocketInterceptor extends EventEmitter {
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
  constructor(id) {
    super();
    this.id = id;
    this.page = null;
    this.client = null;
<<<<<<< HEAD
    this.isInitialized = false;
    this.targetUrl = 'wss://ws2.qxbroker.com/socket.io/'; // URL fija del socket de trading

    logger.info(`[${this.id}] Injector de Órdenes listo.`);
  }

  async initialize(page) {
    if (this.isInitialized) {
=======
    this.isNative = false;
    this.interceptionActive = false;
    this.targetUrl = null;
    this.requestIds = new Set();
    logger.info(`[${this.id}] Interceptor creado.`);
  }

  async initialize(page, targetUrl, options = { method: 'injection' }) {
    if (this.interceptionActive) {
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
      logger.warn(`[${this.id}] Ya inicializado. Saltando.`);
      return;
    }
    this.page = page;
<<<<<<< HEAD

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
=======
    this.targetUrl = targetUrl;
    this.isNative = options.method === 'native';
    this.client = await page.target().createCDPSession();
    await this.client.send('Network.enable');
    
    this.client.on('Network.webSocketCreated', this.handleWebSocketCreated.bind(this));
    this.client.on('Network.webSocketFrameSent', this.handleWebSocketFrameSent.bind(this));
    this.client.on('Network.webSocketFrameReceived', this.handleWebSocketFrameReceived.bind(this));

    this.interceptionActive = true;
    logger.info(`[${this.id}] Interceptor inicializado en modo ${this.isNative ? 'NATIVO' : 'INYECCIÓN'} para ${targetUrl}`);
    
    if (!this.isNative) {
      await this.injectWebSocketProxy();
    }
  }

  handleWebSocketCreated({ requestId, url }) {
    if (url.startsWith(this.targetUrl)) {
      this.requestIds.add(requestId);
      logger.info(`[${this.id}] WebSocket relevante creado con ID: ${requestId}`);
    }
  }

  handleWebSocketFrameSent({ requestId, timestamp, response }) {
    if (this.requestIds.has(requestId)) {
      // logger.debug(`[${this.id}] C->S: ${response.payloadData}`);
    }
  }

  handleWebSocketFrameReceived({ requestId, timestamp, response }) {
    if (!this.requestIds.has(requestId)) return;

    try {
      const payload = response.payloadData;
      if (payload.startsWith('42')) {
        const parsedMessage = JSON.parse(payload.substring(2));
        const [eventName, data] = parsedMessage;

        // **MODIFICADO: Capturar el paquete de velas históricas**
        if (eventName === 'candles-generated') {
            logger.warn(`[${this.id}] Paquete de velas históricas capturado para ${data.asset}.`);
            this.emit('historical-candles', data); // Emitir evento para app.js
            return; // No lo procesamos como un pip normal
        }

        if (eventName === 'pip') {
          const pipData = {
            price: data.price,
            rawAsset: data.asset,
            timestamp: data.created_at,
          };
          this.emit('pip', pipData);
        }
      }
    } catch (error) {
      // No loguear errores de parseo que pueden ser frecuentes y no críticos.
    }
  }

  async injectWebSocketProxy() {
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
    await this.page.evaluateOnNewDocument((targetUrl) => {
      const OriginalWebSocket = window.WebSocket;
      window.WebSocket = function(url, protocols) {
        const wsInstance = new OriginalWebSocket(url, protocols);
<<<<<<< HEAD
        // Capturamos la instancia específica que usa el broker para las operaciones
        if (url.startsWith(targetUrl)) {
          console.log(`[Injector] Capturado el WebSocket de trading: ${url}`);
          window.qxMainSocket = wsInstance; // La referencia global que usará el BrokerConnector
=======
        if (url.startsWith(targetUrl)) {
          console.log('PROXY: Interceptando WebSocket para', url);
          window.qxMainSocket = wsInstance;
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
        }
        return wsInstance;
      };
      window.WebSocket.prototype = OriginalWebSocket.prototype;
    }, this.targetUrl);
  }

  stop() {
<<<<<<< HEAD
    this.isInitialized = false;
    logger.info(`[${this.id}] Injector detenido.`);
=======
    this.interceptionActive = false;
    if (this.client) {
      this.client.detach().catch(e => logger.error(`[${this.id}] Error al desvincular cliente CDP: ${e.message}`));
    }
    this.requestIds.clear();
    logger.info(`[${this.id}] Interceptor detenido.`);
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
  }
}

export default WebSocketInjector;