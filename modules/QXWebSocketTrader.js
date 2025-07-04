// /modules/QXWebSocketTrader.js
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

/**
 * @class QXWebSocketTrader
 * @description Gestor de WebSockets v11.0 (Híbrido Final by User).
 * Usa el hook simple para enviar y el "Oído de Harvester" (CDP) para recibir.
 */
class QXWebSocketTrader extends EventEmitter {
  constructor(page) {
    super(); // Habilitar la capacidad de emitir eventos
    if (!page) throw new Error("QXWebSocketTrader: La instancia de la página es mandatoria.");
    this.page = page;
    logger.info('🔌 QXWebSocketTrader v11.0 (Híbrido Final) inicializado.');
  }

  // MANTENEMOS TU SETUPHOOK ORIGINAL PORQUE FUNCIONA PARA CONECTAR Y ENVIAR
  async setupHook() {
    try {
      await this.page.evaluateOnNewDocument(() => {
        if (window.__wsHooked) return; // No inyectar múltiples veces
        const OriginalWebSocket = window.WebSocket;
        window.WebSocket = function(...args) {
          const wsInstance = new OriginalWebSocket(...args);
          if (args[0] && args[0].includes('socket.io')) {
               console.log('[Hook] ✅ Socket de Trading detectado y capturado.');
               window.__socket = wsInstance; // Guardamos la conexión para controlarla
          }
          return wsInstance;
        };
        window.__wsHooked = true;
      });
      logger.info('[Hook] Inyección temprana del espía de WebSockets configurada.');
    } catch (error) {
        logger.error('[Hook] Fallo crítico al inyectar el script espía.', error);
        throw error;
    }
  }

  // MANTENEMOS TU ISREADY ORIGINAL
  async isReady() {
    try {
      await this.page.waitForFunction(
        'window.__socket && window.__socket.readyState === 1',
        { timeout: 7000 }
      );
      return true;
    } catch (error) {
      logger.error('Socket no estuvo listo en el tiempo de espera. La conexión podría estar caída.');
      return false;
    }
  }
  
  /**
   * ¡REESCRITURA TOTAL! Esta función ahora usa el método del Harvester.
   * Se conecta al Protocolo de Desarrollo de Chrome (CDP) para escuchar.
   */
  async initializeListeners() {
    try {
      logger.info('[Híbrido] Creando sesión con el Protocolo de Desarrollo de Chrome (CDP)...');
      const client = await this.page.target().createCDPSession();
      await client.send('Network.enable');

      logger.info('[Híbrido] CDP conectado. Escuchando tráfico de red para resultados...');

      client.on('Network.webSocketFrameReceived', ({ requestId, timestamp, response }) => {
        // La lógica para decodificar y procesar el mensaje
        let payload = response.payloadData;

        // El CDP a veces devuelve el payload en Base64, a veces no.
        // Un payload de texto a menudo empieza con '42' (evento de Socket.IO)
        // o con el caracter de control binario '' que vimos.
        // Si no es un string, asumimos que es Base64.
        if (typeof payload !== 'string' || (!payload.startsWith('42') && !payload.startsWith(''))) {
            payload = Buffer.from(payload, 'base64').toString('utf-8');
        }


        // Intentamos procesar el mensaje binario/de resultado
        try {
            // Primero, limpiamos cualquier caracter binario raro que venga al inicio.
            const cleanText = payload.replace(/^[\x00-\x1F\x7F-\x9F]+/, '');
            const parsedData = JSON.parse(cleanText);

            // AHORA VIENE LA MAGIA: ¿Qué tipo de mensaje es?
            
            // CASO 1: Es el mensaje de APERTURA de operación.
            // Lo identificamos porque tiene un 'requestId' y un 'id' único. 
            if (parsedData && parsedData.requestId && parsedData.id) {
                logger.info(`[Oído CDP] ✅ ¡Apertura de operación detectada! Mapeando ID [${parsedData.id}] con Request [${parsedData.requestId}].`);
                // Emitimos un nuevo evento que nuestro TradeResultManager escuchará.
                this.emit('tradeOpened', { 
                    requestId: parsedData.requestId, 
                    uniqueId: parsedData.id 
                });
            }

            // CASO 2 y 3: Procesamiento Unificado de Mensajes de Deals (Resultados y Actualizaciones)
            let dealsList = [];
            let messageType = 'Desconocido';

            // Identificamos si es un mensaje de resultado final (objeto con lista 'deals')
            if (parsedData && typeof parsedData === 'object' && !Array.isArray(parsedData) && parsedData.deals && Array.isArray(parsedData.deals)) {
                dealsList = parsedData.deals;
                messageType = 'Resultado Final';
            }
            // O si es un mensaje de actualización de estado (array)
            else if (Array.isArray(parsedData)) {
                dealsList = parsedData;
                messageType = 'Actualización de Estado';
            }

            if (dealsList.length > 0) {
                // logger.info(`[Oído CDP] 📬 Mensaje de '${messageType}' detectado. Contiene ${dealsList.length} deal(s). Procesando...`);
                for (const deal of dealsList) {
                    // LA REGLA DE ORO: Una operación CERRADA tiene un ID, un closePrice != 0 y una propiedad de profit.
                    if (deal && deal.id && deal.closePrice !== 0 && deal.hasOwnProperty('profit')) {
                        logger.info(`[Oído CDP] -> ✅ Detectada operación CERRADA. Emitiendo resultado para ID: ${deal.id}`);
                        this.emit('individualTradeResult', deal);
                    }
                    // Si tiene ID pero no cumple la regla de oro, es una actualización de una operación abierta.
                    else if (deal && deal.id) {
                        logger.info(`[Oído CDP] -> 🚫 Detectada actualización de operación ABIERTA. Ignorando ID: ${deal.id}`);
                        // No se hace nada. Es el comportamiento inteligente que queremos.
                    }
                }
            }
            
        } catch (e) {
            // Ignoramos los mensajes que no son JSON, como los pings del servidor. No son errores.
        }
      });

      logger.info('[Híbrido] ✅ El "Oído de Harvester" está activo y escuchando resultados.');

    } catch (error) {
      logger.error('[Híbrido] Fallo crítico al inicializar el listener de CDP.', error);
      throw error;
    }
  }

  // El resto de funciones para enviar órdenes no cambian.
  
  async seguirActivo(asset) {
    if (!(await this.isReady())) throw new Error(`Fallo al seguir activo. El socket no está disponible.`);
    const payload = `42["depth/follow","${asset}"]`;
    await this.page.evaluate((p) => window.__socket.send(p), payload);
  }
  
  async updateInstruments(asset, period = 60) {
    if (!(await this.isReady())) throw new Error("Socket no disponible para updateInstruments.");
    const payload = `42${JSON.stringify(["instruments/update", { asset, period }])}`;
    await this.page.evaluate((p) => window.__socket.send(p), payload);
  }

  async getChartNotification(asset) {
    if (!(await this.isReady())) throw new Error("Socket no disponible para getChartNotification.");
    const payload = `42${JSON.stringify(["chart_notification/get", { asset, version: "1.0.0" }])}`;
    await this.page.evaluate((p) => window.__socket.send(p), payload);
  }

  async unfollowDepth(asset) {
    if (!(await this.isReady())) throw new Error("Socket no disponible para unfollowDepth.");
    const payload = `42["depth/unfollow","${asset}"]`;
    await this.page.evaluate((p) => window.__socket.send(p), payload);
  }
  
  async storeSettings(asset, timeInSeconds) {
    if (!(await this.isReady())) throw new Error("Socket no disponible para storeSettings.");
    const settingsPayload = { /* ... payload ... */ };
    const payload = `42${JSON.stringify(["settings/store", settingsPayload])}`;
    await this.page.evaluate((p) => window.__socket.send(p), payload);
  }

  async enviarOrden(ordenConfig) {
    if (!(await this.isReady())) throw new Error("Fallo al enviar orden. El socket no está disponible.");
    const payload = `42${JSON.stringify(["orders/open", ordenConfig])}`;
    await this.page.evaluate((p) => window.__socket.send(p), payload);
    logger.info(`✅ Orden enviada al socket: ${payload}`);
    return ordenConfig.requestId;
  }

  async cleanup() {
    logger.info("QXWebSocketTrader: Ejecutando limpieza de recursos...");
    try {
      await this.page.evaluate(() => {
        if (window.__socket && window.__socket.readyState === 1) window.__socket.close();
        delete window.__socket;
      });
    } catch (error) {
      logger.warn("QXWebSocketTrader: Error menor durante el cleanup.");
    }
  }
}

export default QXWebSocketTrader;