import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

class WebSocketInterceptor extends EventEmitter {
  constructor() {
    super();
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
    logger.info('🎤 WebSocketInterceptor v1.2 inicializado');
  }

  async initialize(page) {
    if (this.isActive) {
      logger.warn('WebSocketInterceptor ya está activo');
      return;
    }

    try {
      logger.info('🔧 Instalando interceptor WebSocket v1.2 (limpio)...');

      await page.exposeFunction('__processWebSocketMessage', this._handleBinaryMessage.bind(this));
      await page.exposeFunction('__processWebSocketText', this._handleTextMessage.bind(this));
      await page.exposeFunction('__notifyWebSocketStatus', this._handleStatusChange.bind(this));

      await page.evaluateOnNewDocument(() => {
        const OriginalWebSocket = window.WebSocket;
        window.WebSocket = function (...args) {
          const socket = new OriginalWebSocket(...args);
          if (args[0] && args[0].includes('qxbroker.com/socket.io/')) {
            window.__brokerSocket = socket;
            socket.addEventListener('message', async (event) => {
              try {
                if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
                  const arrayBuffer = (event.data instanceof Blob)
                    ? await event.data.arrayBuffer()
                    : event.data;
                  const uint8Array = new Uint8Array(arrayBuffer);
                  const normalArray = Array.from(uint8Array);
                  window.__processWebSocketMessage(normalArray);
                } else if (typeof event.data === 'string') {
                  window.__processWebSocketText(event.data);
                }
              } catch (error) {
                console.error('[WebSocketInterceptor] Error procesando mensaje:', error);
              }
            });
            socket.addEventListener('open', () => window.__notifyWebSocketStatus('connected'));
            socket.addEventListener('close', () => window.__notifyWebSocketStatus('disconnected'));
            socket.addEventListener('error', (error) => console.error('[WebSocketInterceptor] Error en socket:', error));
          }
          return socket;
        };
      });

      this.isActive = true;
      logger.info('✅ WebSocketInterceptor v1.2 instalado y activo');
      this._startAsyncProcessor();

    } catch (error) {
      logger.error('❌ Error inicializando WebSocketInterceptor:', error);
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

      if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
        const pipData = data[0];
        if (pipData.length >= 3) {
          const [rawAsset, , price] = pipData;
          const sequence = pipData[3] || 0;
          const localTimestamp = Date.now();

          if (this._validatePrice(price)) {
            logger.info(`PIP CAPTURADO - ${String(rawAsset)} ${parseFloat(price)} - Timestamp: ${localTimestamp}`);
            this.pipQueue.push({
              rawAsset: String(rawAsset),
              price: parseFloat(price),
              timestamp: localTimestamp,
              sequence: sequence,
            });
            this.stats.totalPips++;
          } else {
            this.stats.invalidPips++;
          }
        }
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
