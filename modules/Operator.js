import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

class Operator extends EventEmitter {
  constructor(webSocketTrader, telegramConnector, getTime, tradeResultManager) {
    super();
    this.webSocketTrader = webSocketTrader;
    this.telegramConnector = telegramConnector;
    this.getTime = getTime || (() => Date.now());
    this.tradeResultManager = tradeResultManager; // <-- La nueva línea importante
    logger.info('🧠 OPERATOR v2.0: Conectado con TradeResultManager.');
  }

  async executeApprovedTrade(signal) {
    const { asset, decision, executionParams } = signal;
    const { delayMs, investment, expiration } = executionParams;
    const action = decision;

    let requestId;

    try {
      // El delay inicial se mantiene si es necesario
      await new Promise(resolve => setTimeout(resolve, delayMs));
      
      const timeInSeconds = expiration * 60;

      // La secuencia de preparación del trade no cambia
      logger.info(`OPERATOR: Iniciando secuencia de preparación para ${asset} con acción ${action.toUpperCase()}...`, { asset: asset }); 
      await this.webSocketTrader.updateInstruments(asset, timeInSeconds);
      await this.webSocketTrader.getChartNotification(asset);
      await this.webSocketTrader.unfollowDepth(asset);
      await this.webSocketTrader.seguirActivo(asset);
      await this.webSocketTrader.getChartNotification(asset);
      await this.webSocketTrader.storeSettings(asset, timeInSeconds);
      logger.info(`OPERATOR: Secuencia de preparación para ${asset} completada.`, { asset: asset });

      // Generamos el ID y preparamos la notificación de Telegram
      requestId = Math.floor(this.getTime() / 1000); 
      await this._sendExecutionNotification({ ...signal, requestId, action });

      // Preparamos la orden
      const ordenConfig = { asset, amount: investment, action, time: timeInSeconds, isDemo: 1, tournamentId: 0, requestId, optionType: 100 };
      
      // Enviamos la orden al broker
      await this.webSocketTrader.enviarOrden(ordenConfig);
      logger.warn(`OPERATOR: ¡ORDEN ENVIADA! ID [${requestId}]. Entregando a TradeResultManager para seguimiento...`, { asset: asset });

      // ---- LA MAGIA NUEVA ----
      // En lugar de esperar, registramos el trade en el manager y terminamos. ¡YÁ!
      this.tradeResultManager.registerPendingTrade(requestId, signal);

    } catch (error) {
      // El manejo de errores se mantiene por si algo falla ANTES de enviar la orden
      logger.error(`OPERATOR: El proceso de PREPARACIÓN para el trade [${requestId || 'desconocido'}] falló. Motivo: ${error.message}`);
    }
  }
  async _sendExecutionNotification(signal) {
    if (!this.telegramConnector) return;

    try {
      const { executionParams, decision, asset, confidence, triggeredBy, requestId, diagnosis, action } = signal; 
      const { expiration } = executionParams;
      
      // Usamos el tiempo corregido para las notificaciones
      const now = new Date(this.getTime());
      const expirationTime = new Date(now.getTime() + expiration * 60000);
      const options = { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hour12: false };
      const entryTimeStr = now.toLocaleTimeString('es-EC', options);
      const expirationTimeStr = expirationTime.toLocaleTimeString('es-EC', options);
      
      const direction = (action || decision).toUpperCase(); 
      const directionEmoji = direction === 'CALL' ? '📈🟢' : '📉🔴';
      const cleanAsset = asset.replace(/_otc/g, '').replace(/_/g, '/');
      
      let diagnosisText = `*🔬 Diagnóstico de la Decisión (${triggeredBy}):*\n`;
      if (diagnosis.source) diagnosisText += `🎯 *Fuente:* ${diagnosis.source}\n`;
      if (diagnosis.quantitative) diagnosisText += `📈 *Análisis Cuantitativo:* ${diagnosis.quantitative}\n`;
      if (diagnosis.chartist) diagnosisText += `🕯️ *Análisis Chartist:* ${diagnosis.chartist}\n`;
      if (diagnosis.context) diagnosisText += `📊 *Contexto:* ${diagnosis.context}\n`;

      const confidenceStr = (confidence * 100).toFixed(1);

      const message = `\n*🔥 ORDEN ENVIADA 🔥*\n\n*${cleanAsset}* | *${entryTimeStr}* | *${direction}* ${directionEmoji}\n\n*ID de Orden*: \`${requestId}\`\n⏳ *Expira en*: ${expiration} minuto(s)\n⏰ *Vencimiento*: ${expirationTimeStr} (UTC-5)\n\n${diagnosisText}*Confianza Final Calculada: ${confidenceStr}%*\n      `;

      await this.telegramConnector.sendMessage(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error(`OPERATOR: Error al enviar notificacion de ejecución: ${error.message}`);
    }
  }

  stop() {
    logger.info('Operator: Detenido.');
  }
}

export default Operator;
