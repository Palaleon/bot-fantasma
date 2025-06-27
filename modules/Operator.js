import logger from '../utils/logger.js';
import config from '../config/index.js';

class Operator {
  constructor(brokerConnector, telegramConnector) {
    this.brokerConnector = brokerConnector;
    this.telegramConnector = telegramConnector;
  }

  /**
   * ACTUALIZADO: Ahora escucha señales del ChannelManager (multi-canal)
   * En lugar de escuchar directamente al Humanizer, escucha al sistema central
   */
  start(channelManager) {
    logger.info('Operator: En línea. Esperando órdenes de ejecución aprobadas del sistema multi-canal.');
    
    // CAMBIO CRÍTICO: Escuchar señales multi-canal del ChannelManager
    channelManager.on('señalMultiCanal', (signal) => {
      logger.info(`Operator: Señal recibida del canal [${signal.channel}]`);
      this.executeApprovedTrade(signal);
    });
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