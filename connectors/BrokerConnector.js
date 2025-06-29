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
        action: action, // "call" o "put"
        time: time, // Duración en minutos
        isDemo: 1, // O 0 para real
        tournamentId: 0,
        optionType: 100, // Opciones binarias
      };

      const message = `42["trade",${JSON.stringify(orderPayload)}]`;
      logger.info(`BrokerConnector: Payload a enviar: ${message}`);

      const result = await this.page.evaluate((payload) => {
        if (window.qxMainSocket && window.qxMainSocket.readyState === 1) { // 1 = OPEN
          window.qxMainSocket.send(payload);
          return { success: true, message: 'Orden enviada al socket.' };
        } else {
          return { success: false, error: 'El socket de trading no está disponible o no está abierto.' };
        }
      }, message);

      if (result.success) {
        logger.warn(`✅ BrokerConnector: ¡ORDEN ENVIADA! ${result.message}`);
      } else {
        logger.error(`❌ BrokerConnector: Fallo al enviar orden. Motivo: ${result.error}`);
      }

      return result;

    } catch (error) {
      logger.error(`BrokerConnector: Error crítico al intentar ejecutar la operación: ${error.stack}`);
      return { success: false, error: error.message };
    }
  }
}

export default BrokerConnector;