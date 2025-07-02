// /modules/Operator.js
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

class Operator extends EventEmitter {
  constructor(webSocketTrader, telegramConnector) {
    super();
    this.webSocketTrader = webSocketTrader;
    this.telegramConnector = telegramConnector;
  }

  async executeApprovedTrade(signal) {
    const { asset, decision, executionParams, confidence, triggeredBy, diagnosis } = signal;
    const { delayMs, investment, expiration } = executionParams;
    // === INICIO DE LA CORRECCIÓN ===
    // La 'decision' que viene del Humanizer (y antes del ChannelWorker) ya es 'call' o 'put'.
    // Asignamos directamente la decisión a la acción de la orden.
    const action = decision; // 'call' o 'put' directamente desde la señal
    // === FIN DE LA CORRECCIÓN ===

    let requestId;

    try {
      // 1. ESPERA INICIAL DEL HUMANIZER
      await new Promise(resolve => setTimeout(resolve, delayMs));
      
      // 2. SECUENCIA DE PREPARACIÓN (ANTES DE GENERAR EL ID)
      const timeInSeconds = expiration * 60;
      logger.info(`OPERATOR: Iniciando secuencia de preparación para ${asset} con acción ${action.toUpperCase()}...`, { asset: asset }); 
      await this.webSocketTrader.updateInstruments(asset, timeInSeconds);
      await this.webSocketTrader.getChartNotification(asset);
      await this.webSocketTrader.unfollowDepth(asset);
      await this.webSocketTrader.seguirActivo(asset);
      await this.webSocketTrader.getChartNotification(asset);
      await this.webSocketTrader.storeSettings(asset, timeInSeconds);
      logger.info(`OPERATOR: Secuencia de preparación para ${asset} completada.`, { asset: asset });

      // 3. GENERACIÓN DE ID Y NOTIFICACIÓN (JUSTO A TIEMPO)
      requestId = Math.floor(Date.now() / 1000); 
      // Pasar la 'action' correcta a la notificación
      await this._sendExecutionNotification({ ...signal, requestId, action });

      // 4. CONFIGURACIÓN DE LA ORDEN
      const ordenConfig = { asset, amount: investment, action, time: timeInSeconds, isDemo: 1, tournamentId: 0, requestId, optionType: 100 };

      // 5. LÓGICA DE ESPERA DE RESULTADO
      const waitForResult = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.webSocketTrader.removeListener('tradeResult', listener);
          reject(new Error(`Timeout: No se recibió resultado para el trade ID ${requestId}.`));
        }, (timeInSeconds + 15) * 1000);

        const listener = (resultData) => {
          let matchedResult = null;
          if (resultData.requestId === requestId) {
            matchedResult = resultData;
          } else if (resultData.deals && Array.isArray(resultData.deals)) {
            const matchingDeal = resultData.deals.find(deal => Math.abs(deal.openTimestamp - requestId) <= 1);
            if (matchingDeal) {
              logger.info(`[OPERATOR MATCH] Coincidencia encontrada para ID ${requestId}.`, { asset: asset });
              matchedResult = { profit: resultData.profit, requestId, ...matchingDeal };
            }
          }
          if (matchedResult) {
            clearTimeout(timeout);
            this.webSocketTrader.removeListener('tradeResult', listener);
            resolve(matchedResult);
          }
        };
        this.webSocketTrader.on('tradeResult', listener);
      });

      // 6. ENVÍO FINAL DE LA ORDEN
      await this.webSocketTrader.enviarOrden(ordenConfig);
      logger.warn(`OPERATOR: ¡ORDEN ENVIADA! ID [${requestId}] esperando resultado...`, { asset: asset });

      // 7. PROCESAMIENTO DEL RESULTADO
      const result = await waitForResult;
      const isWin = result.profit > 0;
      logger.info(`OPERATOR: ¡RESULTADO RECIBIDO! ID [${requestId}] -> ${isWin ? 'GANADA ✅' : 'PERDIDA ❌'} | Profit: ${result.profit}`, { asset: asset });
      
      await this.sendResultNotification(requestId, action.toUpperCase(), isWin, result.profit);
      
      this.emit('tradeCompleted', { isWin, resultData: result, signal: { ...signal, requestId } });

    } catch (error) {
      logger.error(`OPERATOR: El proceso de ejecución para el trade [${requestId || 'desconocido'}] falló. Motivo: ${error.message}`);
    }
  }

  async _sendExecutionNotification(signal) {
    if (!this.telegramConnector) return;

    try {
      // Asegurarse de que 'action' se pasa correctamente desde executeApprovedTrade
      const { executionParams, decision, asset, confidence, triggeredBy, requestId, diagnosis, action } = signal; 
      const { expiration } = executionParams;
      
      const now = new Date();
      const expirationTime = new Date(now.getTime() + expiration * 60000);
      const options = { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hour12: false };
      const entryTimeStr = now.toLocaleTimeString('es-EC', options);
      const expirationTimeStr = expirationTime.toLocaleTimeString('es-EC', options);
      
      // Usa la 'action' que ya viene correcta, o 'decision' si 'action' no está definida
      const direction = (action || decision).toUpperCase(); 
      const directionEmoji = direction === 'CALL' ? '📈🟢' : '📉🔴';
      const cleanAsset = asset.replace(/_otc/g, '').replace(/_/g, '/');
      
      // Construcción del diagnóstico dinámico
      let diagnosisText = `*🔬 Diagnóstico de la Decisión (${triggeredBy}):*\n`;
      if (diagnosis.source) diagnosisText += `🎯 *Fuente:* ${diagnosis.source}\n`;
      if (diagnosis.quantitative) diagnosisText += `📈 *Análisis Cuantitativo:* ${diagnosis.quantitative}\n`;
      if (diagnosis.chartist) diagnosisText += `🕯️ *Análisis Chartist:* ${diagnosis.chartist}\n`;
      if (diagnosis.context) diagnosisText += `📊 *Contexto:* ${diagnosis.context}\n`;

      const confidenceStr = (confidence * 100).toFixed(1);

      const message = `
*🔥 ORDEN ENVIADA 🔥*\n\n*${cleanAsset}* | *${entryTimeStr}* | *${direction}* ${directionEmoji}\n\n*ID de Orden*: \`${requestId}\`\n⏳ *Expira en*: ${expiration} minuto(s)\n⏰ *Vencimiento*: ${expirationTimeStr} (UTC-5)\n\n${diagnosisText}*Confianza Final Calculada: ${confidenceStr}%*\n      `;

      await this.telegramConnector.sendMessage(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error(`OPERATOR: Error al enviar notificacion de ejecución: ${error.message}`);
    }
  }

  async sendResultNotification(requestId, action, isWin, profit) {
    if (!this.telegramConnector) return;

    const header = isWin ? '🎉 *¡RESULTADO EXITOSO!* 🎉' : '💔 *RESULTADO REGISTRADO* 💔';
    const resultText = isWin ? '*VICTORIA* ✅' : '*PÉRDIDA, SEGUIMOS ANALIZANDO CHICOS - BOT FANTASMA* ❌';

    const message = `
${header}

*ID de Orden*: \`${requestId}\`
*Resultado*: ${resultText}
    `;

    try {
        // Usamos Markdown normal, es más simple y compatible.
        await this.telegramConnector.sendMessage(message, { parse_mode: 'Markdown' });
    } catch (e) {
        logger.error(`OPERATOR: Fallo al enviar notificación de resultado para ID ${requestId}.`);
    }
  }

  stop() {
    logger.info('Operator: Detenido.');
  }
}

export default Operator;