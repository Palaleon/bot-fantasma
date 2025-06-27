import logger from '../utils/logger.js';
import config from '../config/index.js';

class Operator {
  constructor(brokerConnector, telegramConnector) {
    this.brokerConnector = brokerConnector;
    this.telegramConnector = telegramConnector;
  }

  async executeApprovedTrade(signal) {
    const { asset, decision, channel, executionParams } = signal;
    const { delayMs, investment } = executionParams;

    const action = decision === 'green' ? 'call' : 'put';
    
    const logMessage = `OPERATOR: Orden recibida para ${asset}. Esperando ${delayMs}ms para ejecución humanizada...`;
    logger.info(logMessage);

    // Esperar el retraso dinámico
    await new Promise(resolve => setTimeout(resolve, delayMs));

    const finalLogMessage = `OPERATOR: ¡ORDEN DE FUEGO! Canal [${channel || 'GLOBAL'}] ejecutando ${action.toUpperCase()} en ${asset} por ${investment}`;
    logger.warn(finalLogMessage);

    const telegramMessage = `🚀 *ORDEN ENVIADA*\n\nActivo: *${asset.replace('_', '\_')}*\nDirección: *${action.toUpperCase()}*\nMonto: *${investment}*`;
    await this.telegramConnector.sendMessage(telegramMessage);

    this.brokerConnector.executeTrade({
      asset: asset,
      amount: investment,
      action: action,
      time: 5,
    });
  }

  stop() {
    logger.info('Operator: Detenido.');
  }
}

export default Operator;