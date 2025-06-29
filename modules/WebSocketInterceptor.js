import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

class WebSocketInterceptor extends EventEmitter {
  constructor(id) {
    super();
    this.id = id;
    this.page = null;
    this.client = null;
    this.isNative = false;
    this.interceptionActive = false;
    this.targetUrl = null;
    this.requestIds = new Set();
    logger.info(`[${this.id}] Interceptor creado.`);
  }

  async initialize(page, targetUrl, options = { method: 'injection' }) {
    if (this.interceptionActive) {
      logger.warn(`[${this.id}] Ya inicializado. Saltando.`);
      return;
    }
    this.page = page;
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
    await this.page.evaluateOnNewDocument((targetUrl) => {
      const OriginalWebSocket = window.WebSocket;
      window.WebSocket = function(url, protocols) {
        const wsInstance = new OriginalWebSocket(url, protocols);
        if (url.startsWith(targetUrl)) {
          console.log('PROXY: Interceptando WebSocket para', url);
          window.qxMainSocket = wsInstance;
        }
        return wsInstance;
      };
      window.WebSocket.prototype = OriginalWebSocket.prototype;
    }, this.targetUrl);
  }

  stop() {
    this.interceptionActive = false;
    if (this.client) {
      this.client.detach().catch(e => logger.error(`[${this.id}] Error al desvincular cliente CDP: ${e.message}`));
    }
    this.requestIds.clear();
    logger.info(`[${this.id}] Interceptor detenido.`);
  }
}

export default WebSocketInterceptor;