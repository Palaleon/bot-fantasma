import logger from '../utils/logger.js';
import config from '../config/index.js';
import { EventEmitter } from 'events';

class Operator extends EventEmitter {
  constructor(brokerConnector, telegramConnector) {
    super();
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

    const finalLogMessage = `OPERATOR: ¡ORDEN DE FUEGO! [ID: ${signal.id}] Canal [${channel || 'GLOBAL'}] ejecutando ${action.toUpperCase()} en ${asset} por ${investment}`;
    logger.warn(finalLogMessage);

    const telegramMessage = `🚀 *ORDEN ENVIADA*\n\nActivo: *${asset.replace('_', '\_')}*\nDirección: *${action.toUpperCase()}*\nMonto: *${investment}*`;
    await this.telegramConnector.sendMessage(telegramMessage);

    this.brokerConnector.executeTrade({
      asset: asset,
      amount: investment,
      action: action,
      time: 5,
    });

    // Emitir evento de operación ejecutada para el SocketExporter
    this.emit('tradeExecuted', {
      timestamp: Date.now(),
      asset: asset,
      action: action,
      investment: investment,
      signal: signal // Incluir la señal original para contexto
    });
  }

  stop() {
    logger.info('Operator: Detenido.');
  }
}

export default Operator;