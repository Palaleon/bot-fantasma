import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

class WebSocketInterceptor extends EventEmitter {
  constructor(id = 'default') {
    super();
    this.id = id;
    this.isActive = false;
    this.pipsIntercepted = 0;
    this.lastPipTime = 0;
    this.currentAsset = null;
    this.assetCache = new Map();
    this.pipQueue = [];
    this.isProcessing = false;
    this.stats = {
      totalPips: 0,
      validPips: 0,
      invalidPips: 0,
      errors: 0,
      messagesReceived: 0,
      binaryMessages: 0,
      textMessages: 0,
      startTime: Date.now(),
    };
    logger.info(`🎤 WebSocketInterceptor v1.3 [${this.id}] inicializado`);
  }

  async initialize(page, wsUrlPattern) {
    if (this.isActive) {
      logger.warn(`WebSocketInterceptor [${this.id}] ya está activo`);
      return;
    }

    try {
      logger.info(`🔧 Instalando interceptor WebSocket v1.3 [${this.id}] para URL que incluya: ${wsUrlPattern}`);

      const processMessageFuncName = `__processWebSocketMessage_${this.id.replace(/[^a-zA-Z0-9_]/g, '')}`;
      const processTextFuncName = `__processWebSocketText_${this.id.replace(/[^a-zA-Z0-9_]/g, '')}`;
      const notifyStatusFuncName = `__notifyWebSocketStatus_${this.id.replace(/[^a-zA-Z0-9_]/g, '')}`;
      const logFromBrowserFuncName = `__logFromBrowser_${this.id.replace(/[^a-zA-Z0-9_]/g, '')}`;

      await page.exposeFunction(processMessageFuncName, this._handleBinaryMessage.bind(this));
      await page.exposeFunction(processTextFuncName, this._handleTextMessage.bind(this));
      await page.exposeFunction(notifyStatusFuncName, this._handleStatusChange.bind(this));
      await page.exposeFunction(logFromBrowserFuncName, (msg) => logger.info(`[Browser-${this.id}] ${msg}`));

      await page.evaluateOnNewDocument((urlPattern, msgFunc, textFunc, statusFunc, logFunc) => {
        const OriginalWebSocket = window.WebSocket;
        window.WebSocket = function (...args) {
          const socket = new OriginalWebSocket(...args);
          if (args[0] && args[0].includes(urlPattern)) {
            window[logFunc]('Socket interceptado para ' + urlPattern);
            socket.addEventListener('message', async (event) => {
              try {
                if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
                  const arrayBuffer = (event.data instanceof Blob)
                    ? await event.data.arrayBuffer()
                    : event.data;
                  const uint8Array = new Uint8Array(arrayBuffer);
                  const normalArray = Array.from(uint8Array);
                  window[msgFunc](normalArray);
                } else if (typeof event.data === 'string') {
                  window[textFunc](event.data);
                }
              } catch (error) {
                window[logFunc]('Error procesando mensaje: ' + error.message);
              }
            });
            socket.addEventListener('open', () => window[statusFunc]('connected'));
            socket.addEventListener('close', () => window[statusFunc]('disconnected'));
            socket.addEventListener('error', (error) => window[logFunc]('Error en socket: ' + error.message));
          }
          return socket;
        };
      }, wsUrlPattern, processMessageFuncName, processTextFuncName, notifyStatusFuncName, logFromBrowserFuncName);

      this.isActive = true;
      logger.info(`✅ WebSocketInterceptor v1.3 [${this.id}] instalado y activo`);
      this._startAsyncProcessor();

    } catch (error) {
      logger.error(`❌ Error inicializando WebSocketInterceptor [${this.id}]:`, error);
      throw error;
    }
  }

  async _handleBinaryMessage(arrayData) {
    try {
      this.stats.messagesReceived++;
      this.stats.binaryMessages++;
      const uint8Array = new Uint8Array(arrayData);
      if (uint8Array.length <= 1) return;

      const jsonString = new TextDecoder().decode(uint8Array.slice(1));
      const data = JSON.parse(jsonString);

      // Diferenciar entre Pips y Resultados de Trades
      if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
        // Es un Pip
        const pipData = data[0];
        if (pipData.length >= 3) {
          const [rawAsset, , price] = pipData;
          // ... (lógica de pips existente)
          this.emit('pip', { /* ...pip data... */ });
        }
      } else if (typeof data === 'object' && data !== null && data.hasOwnProperty('profit')) {
        // Es un Resultado de Trade
        logger.info(`✅ Resultado de operación recibido para ${data.asset}`);
        this.emit('tradeResult', data);
      }
    } catch (error) {
      this.stats.errors++;
    }
  }

  async _handleTextMessage(text) {
    this.stats.messagesReceived++;
    this.stats.textMessages++;
    if (text.startsWith('42[')) {
      try {
        const jsonPart = text.substring(2);
        const parsed = JSON.parse(jsonPart);
        if (parsed[0] === 'quotes' || parsed[0] === 'tick') {
          logger.info('🎯 Posible evento de cotización detectado en texto');
        }
      } catch (e) {}
    }
  }

  async _handleStatusChange(status) {
    logger.info(`🔌 WebSocket estado: ${status}`);
    this.emit('websocketStatus', status);
  }

  _validatePrice(price) {
    const p = parseFloat(price);
    return !isNaN(p) && p > 0 && p < 1000000 && isFinite(p);
  }

  _convertAssetFormat(rawAsset) {
    if (this.assetCache.has(rawAsset)) {
      return this.assetCache.get(rawAsset);
    }
    let converted = rawAsset;
    if (rawAsset.includes('_otc')) {
      const base = rawAsset.replace('_otc', '');
      if (base.length >= 6) {
        converted = `${base.slice(0, 3)}/${base.slice(3)} (OTC)`;
      }
    } else if (rawAsset.length >= 6) {
      converted = `${rawAsset.slice(0, 3)}/${rawAsset.slice(3)}`;
    }
    this.assetCache.set(rawAsset, converted);
    return converted;
  }

  async _startAsyncProcessor() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    const processQueue = async () => {
      while (this.isActive) {
        if (this.pipQueue.length > 0) {
          const batch = this.pipQueue.splice(0, 10);
          for (const pipData of batch) {
            try {
              if (pipData.rawAsset !== this.currentAsset) {
                this.currentAsset = pipData.rawAsset;
                const displayAsset = this._convertAssetFormat(pipData.rawAsset);
                logger.info(`🔄 Cambio de activo detectado: ${displayAsset}`);
                this.emit('assetChanged', {
                  rawAsset: pipData.rawAsset,
                  displayAsset: displayAsset,
                  timestamp: pipData.timestamp,
                });
              }
              this.emit('pip', {
                price: pipData.price,
                rawAsset: pipData.rawAsset,
                displayAsset: this._convertAssetFormat(pipData.rawAsset),
                timestamp: pipData.timestamp,
                sequence: pipData.sequence,
              });
              this.pipsIntercepted++;
              this.lastPipTime = Date.now();
              this.stats.validPips++;
            } catch (error) {
              logger.error('Error procesando pip:', error);
              this.stats.errors++;
            }
          }
        }
        await new Promise(resolve => setTimeout(resolve, 1));
      }
      this.isProcessing = false;
    };
    processQueue().catch(error => {
      logger.error('Error en procesador asíncrono:', error);
      this.isProcessing = false;
    });
  }

  getStats() {
    const uptime = Date.now() - this.stats.startTime;
    const pipsPerSecond = this.stats.validPips / (uptime / 1000);
    return {
      ...this.stats,
      uptime: uptime,
      pipsPerSecond: pipsPerSecond.toFixed(2),
      successRate: this.stats.totalPips > 0
        ? ((this.stats.validPips / this.stats.totalPips) * 100).toFixed(2) + '%'
        : '0%',
      queueSize: this.pipQueue.length,
      isActive: this.isActive,
      lastPipAge: this.lastPipTime ? Date.now() - this.lastPipTime : null,
      currentAsset: this.currentAsset,
    };
  }

  stop() {
    logger.info('🛑 Deteniendo WebSocketInterceptor...');
    this.isActive = false;
    this.pipQueue = [];
    this.removeAllListeners();
    logger.info('✅ WebSocketInterceptor detenido');
  }
}

export default WebSocketInterceptor;
