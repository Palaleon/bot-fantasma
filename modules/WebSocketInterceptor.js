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
    logger.info(`🎤 WebSocketInterceptor v1.5 [${this.id}] inicializado`);
  }

  static injectionPerformed = new WeakSet();

  async initialize(page, wsUrlPattern, options = { method: 'injection' }) {
    if (this.isActive) {
      logger.warn(`[${this.id}] Interceptor ya está activo. Omitiendo inicialización.`);
      return;
    }

    const { method } = options;
    logger.info(`🔧 Instalando interceptor [${this.id}] con método: ${method.toUpperCase()}`);

    try {
      if (method === 'native') {
        logger.info(`[${this.id}] NATIVE: Creando sesión CDP para intercepción de red...`);
        const client = await page.target().createCDPSession();
        await client.send('Network.enable');
        
        client.on('Network.webSocketFrameReceived', ({ requestId, timestamp, response }) => {
            this._handleCDPFrame(response.payloadData);
        });
        logger.info(`[${this.id}] NATIVE: Listener CDP para 'Network.webSocketFrameReceived' adjuntado.`);

        logger.info(`[${this.id}] NATIVE: Recargando página para activar la captura...`);
        await page.reload({ waitUntil: 'networkidle2' });
        logger.info(`[${this.id}] NATIVE: Página recargada. Escuchando frames...`);

      } else {
        await this._initializeInjection(page, wsUrlPattern);
      }

      this.isActive = true;
      this._startAsyncProcessor();
      logger.info(`✅ WebSocketInterceptor [${this.id}] instalado y activo con método ${method.toUpperCase()}.`);

    } catch (error) {
      logger.error(`❌ Error inicializando WebSocketInterceptor [${this.id}] con método ${method}: ${error.stack}`);
      throw error;
    }
  }

  _handleCDPFrame(payloadData) {
    if (typeof payloadData !== 'string') return;

    try {
        this.stats.messagesReceived++;
        const buffer = Buffer.from(payloadData, 'base64');

        // Si el buffer es muy corto para contener datos válidos, lo ignoramos.
        if (buffer.length <= 2) {
            return;
        }

        // LA LÓGICA CORRECTA (COMO EN EJEMPLO.PY):
        // 1. Cortar el buffer para ignorar el primer byte de control.
        // 2. Decodificar el resto del buffer como texto.
        const jsonString = buffer.slice(1).toString('utf-8');

        // Intentar parsear el JSON. Si falla, es un mensaje incompleto y se ignora.
        try {
            const data = JSON.parse(jsonString);
            this.stats.binaryMessages++;

            if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
                const pipDataArray = data[0];
                if (pipDataArray.length >= 3) {
                    const rawAsset = String(pipDataArray[0]);
                    const price = parseFloat(pipDataArray[2]);
                    if (this._validatePrice(price)) {
                        this.pipQueue.push({ rawAsset, price, timestamp: Date.now(), sequence: this.stats.totalPips + 1 });
                        this.stats.totalPips++;
                    } else {
                        this.stats.invalidPips++;
                    }
                }
            } else if (typeof data === 'object' && data !== null && data.hasOwnProperty('profit')) {
                this.emit('tradeResult', data);
            }
        } catch (e) {
            // Ignorar errores de parseo, probablemente un mensaje incompleto.
            this.stats.invalidPips++;
        }

    } catch (error) {
        this.stats.errors++;
    }
  }

  async _initializeInjection(page, wsUrlPattern) {
    const context = page.browserContext();
    const injectionScript = (urlPattern, logFunc) => {
      if (window.isWebSocketGloballyWrapped) return;
      window.isWebSocketGloballyWrapped = true;
      window[logFunc]('Inyectando script de intercepción GLOBAL...');
      const OriginalWebSocket = window.WebSocket;
      window.webSocketListeners = { main: [], audit: [] };
      const WrappedWebSocket = function(...args) {
        const socket = new OriginalWebSocket(...args);
        if (args[0] && args[0].includes(urlPattern)) {
          window[logFunc]('WebSocket compatible interceptado: ' + args[0]);
          window.qxMainSocket = socket;
          socket.addEventListener('message', (event) => {
            if(window.webSocketListeners.main) window.webSocketListeners.main.forEach(listener => listener(event));
            if(window.webSocketListeners.audit) window.webSocketListeners.audit.forEach(listener => listener(event));
          });
        }
        return socket;
      };
      window.WebSocket = WrappedWebSocket;
    };

    if (!WebSocketInterceptor.injectionPerformed.has(context)) {
      const logFromBrowserFuncName = `__logFromBrowser`;
      await page.exposeFunction(logFromBrowserFuncName, (msg) => logger.info(`[Browser] ${msg}`)).catch(() => {});
      await page.evaluateOnNewDocument(injectionScript, wsUrlPattern, logFromBrowserFuncName);
      WebSocketInterceptor.injectionPerformed.add(context);
      logger.info(`[${this.id}] Inyección global instalada en el contexto del navegador.`);
    }

    const mainPage = page;

    if (!mainPage) {
      throw new Error('No se encontró una página válida en el contexto para la inyección.');
    }

    await mainPage.evaluate(injectionScript, wsUrlPattern, `__logFromBrowser`);

    const processBinaryMessageFuncName = `__processBinaryMessage_${this.id}`;
    const processTextMessageFuncName = `__processTextMessage_${this.id}`;

    await mainPage.exposeFunction(processBinaryMessageFuncName, this._handleBinaryMessage.bind(this)).catch(e => logger.warn(`Función expuesta (binaria) ya existía para ${this.id}.`));
    await mainPage.exposeFunction(processTextMessageFuncName, this._handleTextMessage.bind(this)).catch(e => logger.warn(`Función expuesta (texto) ya existía para ${this.id}.`));

    await mainPage.evaluate((id, binMsgFunc, textMsgFunc) => {
      const listener = async (event) => {
        if (typeof event.data === 'string') {
          window[textMsgFunc](event.data);
        } else if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
          const arrayBuffer = (event.data instanceof Blob) ? await event.data.arrayBuffer() : event.data;
          window[binMsgFunc](Array.from(new Uint8Array(arrayBuffer)));
        }
      };
      if (window.webSocketListeners && window.webSocketListeners[id]) {
        window.webSocketListeners[id] = [listener];
      }
    }, this.id, processBinaryMessageFuncName, processTextMessageFuncName);
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
           if (this._validatePrice(price)) {
            this.pipQueue.push({ rawAsset, price, timestamp: Date.now(), sequence: this.stats.totalPips + 1 });
            this.stats.totalPips++;
          } else {
            this.stats.invalidPips++;
          }
        }
      } else if (typeof data === 'object' && data !== null && data.hasOwnProperty('profit')) {
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

  stop() {
    logger.info(`🛑 Deteniendo WebSocketInterceptor [${this.id}]...`);
    this.isActive = false;
    this.pipQueue = [];
    this.removeAllListeners();
    logger.info(`✅ WebSocketInterceptor [${this.id}] detenido`);
  }
}

export default WebSocketInterceptor;