import logger from '../utils/logger.js';
import config from '../../config/index.js';

class Operator {
  constructor(brokerConnector, telegramConnector) {
    this.brokerConnector = brokerConnector;
    this.telegramConnector = telegramConnector;
  }

  start(humanizer) {
    logger.info('Operator: En línea. Esperando órdenes de ejecución aprobadas.');
    humanizer.on('decisionFinal', (decision) => {
      if (decision.approved) {
        this.executeApprovedTrade(decision.signal);
      }
    });
  }

  async executeApprovedTrade(signal) {
    const { asset, decision } = signal;
    const action = decision === 'green' ? 'call' : 'put';
    const stake = config.trading.baseStake;
    const logMessage = `OPERATOR: ¡ORDEN DE FUEGO! Ejecutando ${action.toUpperCase()} en ${asset} por $${stake}`;
    logger.warn(logMessage);

    const telegramMessage = `🚀 *ORDEN ENVIADA*\n\nActivo: *${asset.replace('_', '\\_')}*\nDirección: *${action.toUpperCase()}*\nMonto: *$${stake}*`;
    await this.telegramConnector.sendMessage(telegramMessage);

    this.brokerConnector.executeTrade({
      asset: asset,
      amount: stake,
      action: action,
      time: 5,
    });
  }

  stop() {
    logger.info('Operator: Detenido.');
  }
}

export default Operator;