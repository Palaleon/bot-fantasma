import WebSocket from 'ws';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

class TradingSocket extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.token = null;
    this.isConnected = false;
    this.isAuthenticating = false;
    this.heartbeatInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
    this.pendingRequests = new Map();
    this.requestId = 0;
    this.sid = null;
  }

  async connect(token) {
    if (this.isConnected || this.isAuthenticating) {
      logger.warn('[TradingSocket] Ya conectado o en proceso.');
      return;
    }

    this.token = token;
    this.isAuthenticating = true;
    logger.info('[TradingSocket] Conectando a WebSocket de Trading...');

    try {
      this.ws = new WebSocket('wss://qxbroker.com/socket.io/?EIO=4&transport=websocket', {
        origin: 'https://qxbroker.com',
      });

      this.ws.on('open', () => this.onOpen());
      this.ws.on('message', (data) => this.onMessage(data));
      this.ws.on('close', () => this.onClose());
      this.ws.on('error', (error) => this.onError(error));
    } catch (error) {
      logger.error('[TradingSocket] Error al crear WebSocket:', error);
      this.isAuthenticating = false;
      this.scheduleReconnect();
    }
  }

  onOpen() {
    logger.info('[TradingSocket] Conexión WebSocket establecida.');
  }

  onMessage(data) {
    const message = data.toString();

    if (message.startsWith('0')) {
      const sessionInfo = JSON.parse(message.substring(1));
      this.sid = sessionInfo.sid;
      logger.info(`[TradingSocket] SID recibido: ${this.sid}. Enviando probe.`);
      this.send('2probe');
      return;
    }

    if (message === '3probe') {
      this.send('5');
      logger.info('[TradingSocket] Probe confirmado. Enviando upgrade.');
      return;
    }

    if (message.startsWith('40')) {
      logger.info('[TradingSocket] Conexión de engine.io exitosa. Autenticando...');
      this.authenticate();
      return;
    }

    if (message.startsWith('42')) {
      try {
        const [event, payload] = JSON.parse(message.substring(2));
        this.handleEvent(event, payload);
      } catch (error) {
        logger.error('[TradingSocket] Error parseando mensaje:', error);
      }
    }
  }

  authenticate() {
    const authPayload = {
      token: this.token,
      params: {
        binary: true,
        type: 'mobile',
        protocol: 7,
        version: '5.20.0',
      },
      name: 'authenticate',
    };
    this.send(`42${JSON.stringify(['authorization', authPayload])}`);
  }

  handleEvent(event, payload) {
    if (event === 'authorization') {
      if (payload.success) {
        this.isConnected = true;
        this.isAuthenticating = false;
        this.reconnectAttempts = 0;
        logger.info('[TradingSocket] Autenticación exitosa.');
        this.startHeartbeat();
        this.emit('connected');
      } else {
        logger.error('[TradingSocket] Falló la autenticación:', payload.message);
        this.disconnect();
      }
      return;
    }

    if (event === 'buy') {
      const { request_id, success, message, result } = payload;
      const promise = this.pendingRequests.get(request_id);
      if (promise) {
        if (success) {
          promise.resolve(result);
        } else {
          promise.reject(new Error(message || 'Error en la compra'));
        }
        this.pendingRequests.delete(request_id);
      }
      this.emit('tradeResult', payload);
    }

    this.emit(event, payload);
  }

  onClose() {
    logger.info('[TradingSocket] Conexión WebSocket cerrada.');
    this.isConnected = false;
    this.isAuthenticating = false;
    this.stopHeartbeat();
    this.emit('disconnected');
    this.scheduleReconnect();
  }

  onError(error) {
    logger.error('[TradingSocket] Error de WebSocket:', error.message);
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      logger.warn('[TradingSocket] Intento de enviar datos en WebSocket no abierto.');
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.send('2');
    }, 25000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * this.reconnectAttempts;
      logger.info(`[TradingSocket] Intentando reconectar en ${delay / 1000}s... (Intento ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => this.connect(this.token), delay);
    } else {
      logger.error('[TradingSocket] Se alcanzó el máximo de intentos de reconexión.');
      this.emit('reconnectFailed');
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }

  async executeTrade(direction, amount, asset, duration) {
    if (!this.isConnected) {
      return Promise.reject(new Error('No conectado al WebSocket de Trading.'));
    }

    const requestId = ++this.requestId;
    const expiration = Math.floor(Date.now() / 1000) + duration;

    const tradePayload = {
      name: 'buy',
      params: {
        price: 0, 
        amount: amount,
        dir: direction === 'green' ? 'call' : 'put',
        asset: asset,
        type: 'turbo',
        time: duration,
        exp: expiration,
        source: 'platform',
        request_id: requestId,
      },
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      this.send(`42${JSON.stringify(['buy', tradePayload])}`);
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Timeout en la ejecución del trade'));
        }
      }, 10000);
    });
  }
}

export default TradingSocket;
