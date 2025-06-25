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
      logger.debug(`[${key}] Acumulando datos (${state.prices.length}/${this.emaConfig.minDataPoints})...`);
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
      
      logger.info(`[${key}] 🎯 ¡SEÑAL TÉCNICA GENERADA! -> ${decision.toUpperCase()}`);
      this.emit('señalTecnica', signal);
    }
  }

  stop() {
    logger.info('IndicatorEngine: Detenido.');
    this.removeAllListeners('señalTecnica');
  }
}

export default IndicatorEngine;