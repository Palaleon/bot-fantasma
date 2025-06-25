import { EventEmitter } from 'events';
import { EMA } from 'technicalindicators';
import logger from '../utils/logger.js';

class IndicatorEngine extends EventEmitter {
  constructor() {
    super();
    this.analysisState = new Map();
    this.emaConfig = {
      fast: 9,
      slow: 21,
      minDataPoints: 21,
    };
    
    // NUEVO: Contexto del canal para logs y métricas
    this.channelContext = 'GLOBAL';
    this.signalCount = 0;
  }
  
  /**
   * NUEVO: Establece el contexto del canal para esta instancia
   * Permite que cada canal tenga su propio IndicatorEngine
   */
  setChannelContext(channelName) {
    this.channelContext = channelName;
    logger.debug(`[IndicatorEngine] Contexto establecido: ${channelName}`);
  }

  start(pipReceiver) {
    logger.info('IndicatorEngine: Activado y escuchando velas cerradas.');
    pipReceiver.on('velaCerrada', (candle) => {
      this.analyzeCandle(candle);
    });
  }

  analyzeCandle(candle) {
    const { asset, timeframe, close } = candle;
    const key = `${asset}|${timeframe}`;

    if (!this.analysisState.has(key)) {
      this.analysisState.set(key, {
        prices: [],
        lastSignal: 'none',
      });
    }

    const state = this.analysisState.get(key);
    state.prices.push(close);

    if (state.prices.length > this.emaConfig.minDataPoints * 2) {
      state.prices.shift();
    }
    
    if (state.prices.length < this.emaConfig.minDataPoints) {
      logger.debug(`[${this.channelContext}][${key}] Acumulando datos (${state.prices.length}/${this.emaConfig.minDataPoints})...`);
      return;
    }

    const emaFast = EMA.calculate({ period: this.emaConfig.fast, values: state.prices });
    const emaSlow = EMA.calculate({ period: this.emaConfig.slow, values: state.prices });
    const currentFast = emaFast[emaFast.length - 1];
    const prevFast = emaFast[emaFast.length - 2];
    const currentSlow = emaSlow[emaSlow.length - 1];
    const prevSlow = emaSlow[emaSlow.length - 2];

    if (!prevFast || !prevSlow) return;

    const isBullishCross = prevFast <= prevSlow && currentFast > currentSlow;
    const isBearishCross = prevFast >= prevSlow && currentFast < currentSlow;

    let decision = 'none';
    if (isBullishCross && state.lastSignal !== 'green') {
      decision = 'green';
    } else if (isBearishCross && state.lastSignal !== 'red') {
      decision = 'red';
    }
    
    if (decision !== 'none') {
      state.lastSignal = decision;
      const signal = {
        asset,
        timeframe,
        decision,
        confidence: 0.75,
        reason: `EMA Crossover (${this.emaConfig.fast}/${this.emaConfig.slow})`,
        candle,
      };
      
      logger.info(`[${this.channelContext}][${key}] 🎯 ¡SEÑAL TÉCNICA GENERADA! -> ${decision.toUpperCase()}`);
      this.signalCount++;
      this.emit('señalTecnica', signal);
    }
  }

  /**
   * NUEVO: Actualiza la configuración del motor dinámicamente
   */
  updateConfig(newConfig) {
    if (newConfig.ema) {
      this.emaConfig = { ...this.emaConfig, ...newConfig.ema };
      logger.info(`[${this.channelContext}] Configuración EMA actualizada:`, this.emaConfig);
    }
    
    // FUTURO: Aquí se agregarán más indicadores (RSI, Bollinger, etc.)
  }

  stop() {
    logger.info(`[${this.channelContext}] IndicatorEngine: Detenido. Total señales: ${this.signalCount}`);
    this.removeAllListeners('señalTecnica');
  }
}

export default IndicatorEngine;