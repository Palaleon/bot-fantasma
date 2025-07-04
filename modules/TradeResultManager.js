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
   * Procesa un único resultado de operación que le llega desde el Trader.
   * @param {object} closedDeal - El objeto de la operación cerrada.
   */
  processIndividualResult(closedDeal) {
    // Gracias al filtro en QXWebSocketTrader, aquí solo llegan operaciones CERRADAS y confirmadas.
    // Log para verificar que el filtro funciona como se espera.
    logger.info(`[MANAGER] Recibido para procesar resultado final: ${JSON.stringify(closedDeal)}`);

    // Buscamos la operación pendiente que coincida EXACTAMENTE con el ID del resultado.
    let foundRequest = null;
    for (const [requestId, pendingTrade] of this.pendingTrades.entries()) {
        if (pendingTrade.status === 'pending_result' && pendingTrade.uniqueId === closedDeal.id) {
            foundRequest = { requestId, pendingTrade };
            break;
        }
    }

    // Si encontramos la operación pendiente, la procesamos.
    if (foundRequest) {
        const { requestId, pendingTrade } = foundRequest;
        const isWin = closedDeal.profit > 0;

        logger.info(`[MANAGER] 🎉 ¡RESULTADO PROCESADO! ID [${pendingTrade.uniqueId}] -> ${isWin ? 'GANADA ✅' : 'PERDIDA ❌'} | Profit: ${closedDeal.profit}`);
        
        // Emitimos el evento que toda la app espera, con los datos necesarios.
        this.emit('tradeCompleted', {
          isWin,
          resultData: closedDeal,
          signal: { ...pendingTrade.signal, requestId },
        });

        // Una vez procesado, lo eliminamos de la lista de pendientes.
        this.pendingTrades.delete(requestId);
        logger.info(`[MANAGER] ✅ Operación [${requestId}] finalizada y eliminada de pendientes.`);

    } else {
        // Si no se encuentra, es un resultado para una operación que no rastreamos (quizás manual o de otra sesión).
        logger.warn(`[MANAGER] ❓ Recibido resultado para un ID no rastreado: ${closedDeal.id}. Se ignora.`);
    }
  }
}

export default TradeResultManager;