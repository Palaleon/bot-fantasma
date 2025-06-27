import logger from '../utils/logger.js';

class BrokerConnector {
  constructor(page, wsInterceptor) {
    this.page = page;
    this.wsInterceptor = wsInterceptor;
  }

  async executeTrade({ asset, amount, action, time = 5 }) {
    logger.info(`BrokerConnector: Preparando orden de ${action.toUpperCase()} por ${amount} en ${asset}...`);
    try {
      const orderPayload = {
        asset: asset,
        amount: amount,
        action: action,
        time: time,
        isDemo: 1,
        tournamentId: 0,
        optionType: 100,
      };

      const message = `42["trade", ${JSON.stringify(orderPayload)}]`;
      const sent = this.wsInterceptor.send(message);

      if (sent) {
        logger.warn(`BrokerConnector: ¡ORDEN ENVIADA! Mensaje: ${message}`);
      } else {
        logger.error('BrokerConnector: Fallo al enviar orden. El socket no estaba listo.');
      }
    } catch (error) {
      logger.error(`BrokerConnector: Error crítico al intentar ejecutar la operación: ${error.message}`);
    }
  }
}

export default BrokerConnector;