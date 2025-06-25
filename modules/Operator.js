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
    const { asset, decision, channel } = signal;
    const action = decision === 'green' ? 'call' : 'put';
    const stake = config.trading.baseStake;
    
    // NUEVO: Incluir información del canal en los logs
    const logMessage = `OPERATOR: ¡ORDEN DE FUEGO! Canal [${channel || 'GLOBAL'}] ejecutando ${action.toUpperCase()} en ${asset} por $${stake}`;
    logger.warn(logMessage);

    // NUEVO: Incluir métricas del canal en la notificación
    const channelInfo = signal.channelMetrics 
      ? `\nCanal: *${channel}*\nSeñales del canal: ${signal.channelMetrics.signalsGenerated}`
      : '';
    
    const telegramMessage = `🚀 *ORDEN ENVIADA*\n\nActivo: *${asset.replace('_', '\\_')}*\nDirección: *${action.toUpperCase()}*\nMonto: *$${stake}*${channelInfo}`;
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