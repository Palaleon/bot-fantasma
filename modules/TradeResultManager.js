import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

class TradeResultManager extends EventEmitter {
  constructor() {
    super();
    this.pendingTrades = new Map(); // Usaremos un Mapa para rastrear por requestId.
    logger.info('🧠 TradeResultManager listo para rastrear operaciones.');
  }

  /**
   * Registra una operación que acaba de ser enviada y está esperando su ID único del broker.
   * @param {string} requestId - El ID que nosotros generamos.
   * @param {object} signalData - La información completa de la señal para usarla después.
   */
  registerPendingTrade(requestId, signalData) {
    this.pendingTrades.set(requestId, {
      status: 'pending_id',
      signal: signalData,
      uniqueId: null,
    });
    logger.info(`[MANAGER] ⏳ Operación [${requestId}] registrada. Esperando ID único del broker.`);
  }

  /**
   * Vincula el ID único del broker con nuestra operación pendiente.
   * @param {string} requestId - El ID que nosotros generamos.
   * @param {string} uniqueId - El ID que el broker nos da.
   */
  mapTradeId(requestId, uniqueId) {
    if (this.pendingTrades.has(requestId)) {
      const trade = this.pendingTrades.get(requestId);
      trade.status = 'pending_result';
      trade.uniqueId = uniqueId;
      logger.info(`[MANAGER] ✅ ID Único [${uniqueId}] mapeado a [${requestId}]. Esperando resultado final.`);
    } else {
      logger.warn(`[MANAGER] ❓ Intento de mapear un ID para un requestId no registrado: ${requestId}`);
    }
  }

  /**
   * Procesa la lista de resultados de operaciones cerradas que envía el broker.
   * @param {Array} closedDeals - El array de operaciones que nos llega.
   */
  processResults(closedDeals) {
    // Iteramos sobre cada operación pendiente que tenemos
    for (const [requestId, pendingTrade] of this.pendingTrades.entries()) {
      // Solo nos interesan las que ya tienen un ID único y esperan resultado
      if (pendingTrade.status === 'pending_result') {
        // Buscamos en la lista de resultados del broker si alguna coincide con nuestro ID único
        const foundResult = closedDeals.find(deal => deal.id === pendingTrade.uniqueId);

        if (foundResult) {
          const isWin = foundResult.profit > 0;
          logger.info(`[MANAGER] 🎉 ¡RESULTADO ENCONTRADO! ID [${pendingTrade.uniqueId}] -> ${isWin ? 'GANADA ✅' : 'PERDIDA ❌'} | Profit: ${foundResult.profit}`);
          
          // Emitimos el evento que toda la app espera, con los datos necesarios
          this.emit('tradeCompleted', {
            isWin,
            resultData: foundResult,
            signal: { ...pendingTrade.signal, requestId },
          });

          // Una vez procesado, lo eliminamos de la lista de pendientes para no volver a procesarlo
          this.pendingTrades.delete(requestId);
        }
      }
    }
  }
}

export default TradeResultManager;