import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import config from '../config/index.js';

class Humanizer extends EventEmitter {
  constructor() {
    super();
    this.tradeHistory = [];
    this.historySize = 10;
    
    // NUEVO: Contexto del canal para logs y configuración específica
    this.channelContext = 'GLOBAL';
    this.channelConfig = null;
  }
  
  /**
   * NUEVO: Establece el contexto del canal para esta instancia
   */
  setChannelContext(channelName) {
    this.channelContext = channelName;
    logger.debug(`[Humanizer] Contexto establecido: ${channelName}`);
  }

  start(indicatorEngine) {
    logger.info('Humanizer: Operativo. Auditando señales técnicas...');
    indicatorEngine.on('señalTecnica', (signal) => {
      this.analyzeSignal(signal);
    });
  }

  analyzeSignal(signal) {
    const { asset, decision } = signal;

    if (this._isFrequencyViolation()) {
      const cooldown = (config.humanizer.minTradeIntervalMs / 1000).toFixed(0);
      const reason = `Violación de Frecuencia (Cooldown de ${cooldown}s no cumplido).`;
      logger.warn(`[${this.channelContext}][Humanizer] SEÑAL DENEGADA para ${asset}: ${reason}`);
      this.emit('decisionFinal', { approved: false, signal, reason });
      return;
    }

    if (this._isConsecutiveTradeViolation(asset, decision)) {
      const reason = `Violación de Repetición (${config.humanizer.maxConsecutiveTrades} operaciones consecutivas en ${asset} -> ${decision}).`;
      logger.warn(`[${this.channelContext}][Humanizer] SEÑAL DENEGADA para ${asset}: ${reason}`);
      this.emit('decisionFinal', { approved: false, signal, reason });
      return;
    }

    const reason = 'La operación mantiene un patrón impredecible.';
    logger.info(`[${this.channelContext}][Humanizer] SEÑAL APROBADA para ${asset} -> ${decision}. Motivo: ${reason}`);
    this.logApprovedTrade(signal);
    this.emit('decisionFinal', { approved: true, signal, reason });
  }

  logApprovedTrade(signal) {
    this.tradeHistory.push({
      asset: signal.asset,
      decision: signal.decision,
      timestamp: Date.now(),
    });
    if (this.tradeHistory.length > this.historySize) {
      this.tradeHistory.shift();
    }
  }
  
  _isFrequencyViolation() {
    if (this.tradeHistory.length === 0) return false;
    const lastTradeTimestamp = this.tradeHistory[this.tradeHistory.length - 1].timestamp;
    return (Date.now() - lastTradeTimestamp) < config.humanizer.minTradeIntervalMs;
  }

  _isConsecutiveTradeViolation(currentAsset, currentDecision) {
    const consecutiveLimit = config.humanizer.maxConsecutiveTrades;
    if (this.tradeHistory.length < consecutiveLimit) return false;
    const recentTrades = this.tradeHistory.slice(-consecutiveLimit);
    return recentTrades.every(trade => trade.asset === currentAsset && trade.decision === currentDecision);
  }

  /**
   * NUEVO: Actualiza la configuración del humanizador dinámicamente
   */
  updateConfig(newConfig) {
    if (newConfig.minInterval) {
      config.humanizer.minTradeIntervalMs = newConfig.minInterval;
    }
    if (newConfig.maxConsecutive) {
      config.humanizer.maxConsecutiveTrades = newConfig.maxConsecutive;
    }
    logger.info(`[${this.channelContext}] Configuración del Humanizer actualizada`);
  }

  stop() {
    logger.info(`[${this.channelContext}] Humanizer: Detenido.`);
  }
}

export default Humanizer;