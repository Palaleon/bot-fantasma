import logger from '../utils/logger.js';

class BrokerConnector {
  constructor(page) {
    this.page = page;
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

      const result = await this.page.evaluate((payload) => {
        if (!window.__socket || window.__socket.readyState !== WebSocket.OPEN) {
          return { success: false, error: 'Socket no está disponible o no está abierto.' };
        }
        const message = `42["trade", ${JSON.stringify(payload)}]`;
        window.__socket.send(message);
        return { success: true, sentMessage: message };
      }, orderPayload);

      if (result.success) {
        logger.warn(`BrokerConnector: ¡ORDEN ENVIADA! Mensaje: ${result.sentMessage}`);
      } else {
        logger.error(`BrokerConnector: Fallo al enviar orden. Motivo: ${result.error}`);
      }
    } catch (error) {
      logger.error(`BrokerConnector: Error crítico al intentar ejecutar la operación: ${error.message}`);
    }
  }
}

export default BrokerConnector;