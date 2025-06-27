
import { RSI, Stochastic } from 'technicalindicators';
import logger from '../utils/logger.js';
import { EventEmitter } from 'events';

/**
 * IndicatorEngine v3.0 - Cerebro de Análisis de Confluencia
 *
 * Arquitectura:
 * 1. Multi-Indicador: Analiza usando un conjunto de indicadores configurables.
 *    - PriceAction (Continuidad de Vela)
 *    - RSI (Relative Strength Index)
 *    - Stochastic Oscillator
 * 2. Multi-Temporalidad (MTA): Mantiene el estado de las señales para diferentes
 *    timeframes (1m, 5m, 15m) para buscar confluencia.
 * 3. Ponderación Dinámica: Asigna pesos a las señales según la temporalidad
 *    y la volatilidad/relevancia del mercado.
 * 4. Decisión Unificada: Consolida todas las puntuaciones ponderadas en una
 *    única señal de alta probabilidad (GREEN, RED, HOLD).
 */
class IndicatorEngine extends EventEmitter {
  constructor(asset) {
    super();
    this.asset = asset;
    this.channelContext = asset; // Para logs consistentes

    // --- Configuración Central del Motor ---
    this.config = {
      timeframes: ['1m', '5m', '15m'], // Temporalidades a analizar
      decisionThreshold: 6.0, // Umbral para tomar una decisión final
      weights: {
        timeframe: { '1m': 0.75, '5m': 1.5, '15m': 3.0 },
        indicator: { priceAction: 1.5, rsi: 1.0, stochastic: 1.0 }
      },
      priceAction: {
        minBodyRatio: 0.65,
        momentumCloseRatio: 0.20,
        minCandleSizePts: (asset.includes('_otc') || asset.includes('JPY')) ? 0.005 : 0.00005
      },
      rsi: { period: 14, oversold: 35, overbought: 65 },
      stochastic: { period: 14, signalPeriod: 3 }
    };

    // --- Estado Interno del Motor ---
    this.state = new Map(); // Clave: timeframe -> { rsi, stochastic, lastSignalScore }
    this.config.timeframes.forEach(tf => {
      this.state.set(tf, {
        rsi: new RSI({ period: this.config.rsi.period, values: [] }),
        stochastic: new Stochastic({
          period: this.config.stochastic.period,
          signalPeriod: this.config.stochastic.signalPeriod,
          high: [], low: [], close: []
        }),
        lastSignalScore: 0,
        prices: [], // Para alimentar indicadores
        highs: [],
        lows: []
      });
    });

    this.signalCount = 0;
    logger.info(`[${this.asset}] IndicatorEngine v3.0 inicializado`);
  }

  /**
   * Punto de entrada principal. Se llama cada vez que una vela cierra.
   */
  analyzeCandle(candle) {
    const { timeframe, open, high, low, close } = candle;

    // Solo procesar timeframes configurados
    if (!this.config.timeframes.includes(timeframe)) {
      return;
    }

    // 1. Actualizar estado e indicadores para el timeframe actual
    this._updateIndicators(timeframe, candle);

    // 2. Calcular puntuaciones para todos los indicadores en este timeframe
    const currentScores = this._calculateIndicatorScores(timeframe, candle);

    // 3. Calcular la puntuación ponderada para este timeframe
    const weightedScore = this._calculateWeightedScore(currentScores, candle);
    this.state.get(timeframe).lastSignalScore = weightedScore;

    // 4. Consolidar puntuaciones de TODAS las temporalidades para la decisión final
    const finalScore = this._getConsolidatedScore();

    // 5. Tomar la decisión final basada en el umbral
    this._makeFinalDecision(finalScore, candle);
  }

  /**
   * Actualiza los valores de los indicadores con la nueva vela.
   */
  _updateIndicators(timeframe, candle) {
    const tfState = this.state.get(timeframe);
    tfState.prices.push(candle.close);
    tfState.highs.push(candle.high);
    tfState.lows.push(candle.low);

    // Mantener un tamaño de buffer razonable para evitar uso excesivo de memoria
    if (tfState.prices.length > 100) {
      tfState.prices.shift();
      tfState.highs.shift();
      tfState.lows.shift();
    }

    // Actualizar valores para los indicadores de 'technicalindicators'
    tfState.rsi.nextValue(candle.close);
    tfState.stochastic.nextValue({
      high: candle.high,
      low: candle.low,
      close: candle.close
    });
  }

  /**
   * Calcula las puntuaciones base para cada indicador.
   * @returns {object} - { priceAction: score, rsi: score, stochastic: score }
   */
  _calculateIndicatorScores(timeframe, candle) {
    return {
      priceAction: this._getPriceActionScore(candle),
      rsi: this._getRsiScore(timeframe),
      stochastic: this._getStochasticScore(timeframe)
    };
  }

  /**
   * Analiza la acción de precio de la vela.
   * @returns {number} - Puntuación de -2 a +2.
   */
  _getPriceActionScore(candle) {
    const { open, high, low, close } = candle;
    const config = this.config.priceAction;

    const totalHeight = high - low;
    if (totalHeight < config.minCandleSizePts) return 0;

    const bodyHeight = Math.abs(close - open);
    const bodyRatio = totalHeight > 0 ? (bodyHeight / totalHeight) : 0;
    if (bodyRatio < config.minBodyRatio) return 0;

    const isBullish = close > open;
    if (isBullish) {
      const upperMomentumZone = high - (totalHeight * config.momentumCloseRatio);
      return close >= upperMomentumZone ? 2 : 1; // Fuerte o débil señal alcista
    } else {
      const lowerMomentumZone = low + (totalHeight * config.momentumCloseRatio);
      return close <= lowerMomentumZone ? -2 : -1; // Fuerte o débil señal bajista
    }
  }

  /**
   * Analiza el RSI.
   * @returns {number} - Puntuación de -2 a +2.
   */
  _getRsiScore(timeframe) {
    const rsiValues = this.state.get(timeframe).rsi.getResult();
    if (rsiValues.length < 1) return 0;
    const rsi = rsiValues[rsiValues.length - 1];
    const { oversold, overbought } = this.config.rsi;

    if (rsi > overbought) return -1; // Sobrecompra -> señal bajista débil
    if (rsi < oversold) return 1;   // Sobreventa -> señal alcista débil
    return 0;
  }

  /**
   * Analiza el Estocástico.
   * @returns {number} - Puntuación de -2 a +2.
   */
  _getStochasticScore(timeframe) {
    const stochValues = this.state.get(timeframe).stochastic.getResult();
    if (stochValues.length < 2) return 0;
    const prev = stochValues[stochValues.length - 2];
    const curr = stochValues[stochValues.length - 1];

    const isBullishCross = prev.k <= prev.d && curr.k > curr.d;
    const isBearishCross = prev.k >= prev.d && curr.k < curr.d;

    if (isBullishCross && curr.k < 30) return 2; // Cruce alcista en zona de sobreventa (fuerte)
    if (isBearishCross && curr.k > 70) return -2; // Cruce bajista en zona de sobrecompra (fuerte)
    
    return 0;
  }

  /**
   * Calcula la puntuación ponderada para la vela actual.
   */
  _calculateWeightedScore(scores, candle) {
    const { indicator } = this.config.weights;
    
    let totalScore = 0;
    totalScore += scores.priceAction * indicator.priceAction;
    totalScore += scores.rsi * indicator.rsi;
    totalScore += scores.stochastic * indicator.stochastic;

    // Ponderación por volatilidad/relevancia (simple)
    const relevance = Math.min(1.5, 1 + (candle.volume / 50)); // Aumenta peso si hay mucho volumen (hasta 1.5x)
    
    return totalScore * relevance;
  }

  /**
   * Suma las últimas puntuaciones ponderadas de todas las temporalidades.
   */
  _getConsolidatedScore() {
    let finalScore = 0;
    const { timeframe } = this.config.weights;
    for (const tf of this.config.timeframes) {
      const lastScore = this.state.get(tf).lastSignalScore || 0;
      finalScore += lastScore * timeframe[tf];
    }
    return finalScore;
  }

  /**
   * Emite la señal final si se cruza el umbral.
   */
  _makeFinalDecision(finalScore, candle) {
    const { decisionThreshold } = this.config;
    let decision = 'hold';
    
    if (finalScore > decisionThreshold) {
      decision = 'green';
    } else if (finalScore < -decisionThreshold) {
      decision = 'red';
    }

    if (decision !== 'hold') {
      const signal = {
        asset: this.asset,
        timeframe: candle.timeframe, // Timeframe que disparó el análisis
        decision,
        confidence: Math.min(1, Math.abs(finalScore) / (decisionThreshold * 1.5)),
        reason: `Confluencia Multi-Temporal. Puntuación: ${finalScore.toFixed(2)}`,
        candle,
      };
      
      logger.warn(`[${this.channelContext}] 🏆 ¡¡¡SEÑAL DE CONFLUENCIA GENERADA!!! -> ${decision.toUpperCase()} | Puntuación: ${finalScore.toFixed(2)}`);
      this.signalCount++;
      this.emit('señalTecnica', signal);

      // Resetear puntuaciones para evitar señales duplicadas inmediatas
      this.config.timeframes.forEach(tf => {
        this.state.get(tf).lastSignalScore = 0;
      });
    }
  }

  stop() {
    logger.info(`[${this.channelContext}] IndicatorEngine: Detenido. Total señales: ${this.signalCount}`);
    this.removeAllListeners('señalTecnica');
  }
}

export default IndicatorEngine;
