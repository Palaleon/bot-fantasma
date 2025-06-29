import { RSI, Stochastic } from 'technicalindicators';
import logger from '../utils/logger.js';
import { EventEmitter } from 'events';

/**
 * IndicatorEngine v4.0 - Motor de Análisis Híbrido (Estratégico-Táctico)
 *
 * =================================================================================
 * ||                        NUEVA ARQUITECTURA v4.0                              ||
 * =================================================================================
 *
 * Esta versión introduce un modelo de análisis de dos capas para mejorar la
 * precisión de las señales y reducir las entradas falsas.
 *
 * 1. CAPA ESTRATÉGICA (Análisis de Contexto):
 *    - Opera con velas de temporalidades largas (1m, 5m, 15m).
 *    - Utiliza un conjunto de indicadores (Acción de Precio, RSI, Estocástico)
 *      para determinar la tendencia general del mercado y las zonas de alta
 *      probabilidad (sobrecompra/sobreventa).
 *    - Su objetivo es responder: "¿Es este un buen momento para BUSCAR una
 *      operación y en qué dirección?"
 *
 * 2. CAPA TÁCTICA (Análisis de Momentum):
 *    - Opera con velas de muy corta temporalidad (5s).
 *    - Utiliza un indicador rápido (RSI) para medir el "pulso" o momentum
 *      inmediato del mercado.
 *    - Su objetivo es responder: "La dirección del precio AHORA MISMO, en los
 *      últimos segundos, ¿está alineada con nuestra estrategia?"
 *
 * FLUJO DE DECISIÓN:
 * 1. El motor es alimentado con TODAS las velas (5s, 1m, 5m, 15m).
 * 2. Los indicadores de ambas capas se actualizan constantemente.
 * 3. Al CIERRE de una vela ESTRATÉGICA (ej. 1m), se dispara el proceso de decisión.
 * 4. Se calcula la PUNTUACIÓN ESTRATÉGICA basada en la confluencia de indicadores
 *    de largo plazo.
 * 5. SI la puntuación estratégica supera un umbral mínimo (es prometedora),
 *    se consulta el ESTADO TÁCTICO.
 * 6. La señal solo se APRUEBA si la capa táctica CONFIRMA que el momentum
 *    inmediato está alineado con la dirección estratégica.
 *
 * RESULTADO:
 * Se filtran las operaciones en las que la estrategia a largo plazo parece
 * buena, pero el precio en el momento exacto de la entrada está yendo en
 * contra, previniendo así muchas operaciones perdedoras.
 * =================================================================================
 */
class IndicatorEngine extends EventEmitter {
  constructor(asset) {
    super();
    this.asset = asset;
    this.channelContext = asset; // Para logs consistentes

    // --- CONFIGURACIÓN DEL MOTOR HÍBRIDO ---
    this.config = {
      // --- Capa Estratégica ---
      strategicTimeframes: ['1m', '5m', '15m'],
      strategicDecisionTimeframe: '1m', // Timeframe que dispara las decisiones
      strategicThreshold: 5.0, // Umbral mínimo para considerar una señal estratégica
      finalDecisionThreshold: 7.0, // Umbral final para emitir la señal (Estratégico + Táctico)
      
      weights: {
        timeframe: { '1m': 0.6, '5m': 1.2, '15m': 2.5 },
        indicator: { priceAction: 1.5, rsi: 1.0, stochastic: 1.0 }
      },
      priceAction: {
        minBodyRatio: 0.60,
        momentumCloseRatio: 0.25,
        minCandleSizePts: (asset.includes('_otc') || asset.includes('JPY')) ? 0.005 : 0.00005
      },
      rsi: { period: 14, oversold: 35, overbought: 65 },
      stochastic: { period: 14, signalPeriod: 3 },

      // --- Capa Táctica ---
      tacticalTimeframe: '5s',
      tacticalRsi: {
        period: 24, // Analiza los últimos 2 minutos (24 velas * 5s = 120s)
        neutralZone: [45, 55], // Zona donde el momentum es indefinido
        confirmationWeight: 2.5 // Puntuación extra si el momentum confirma
      }
    };

    // --- ESTADO INTERNO DEL MOTOR ---
    this.strategicState = new Map();
    this.config.strategicTimeframes.forEach(tf => {
      this.strategicState.set(tf, {
        rsi: new RSI({ period: this.config.rsi.period, values: [] }),
        stochastic: new Stochastic({
          period: this.config.stochastic.period,
          signalPeriod: this.config.stochastic.signalPeriod,
          high: [], low: [], close: []
        }),
        lastSignalScore: 0,
        open: [], high: [], low: [], close: []
      });
    });

    this.tacticalState = {
      rsi: new RSI({ period: this.config.tacticalRsi.period, values: [] })
    };

    this.signalCount = 0;
    logger.info(`[${this.asset}] IndicatorEngine v4.0 (Híbrido) inicializado`);
  }

  /**
   * Punto de entrada principal. Se llama para CADA vela cerrada.
   */
  analyzeCandle(candle) {
    const { timeframe } = candle;

    // 1. Actualizar el estado del indicador correspondiente (táctico o estratégico)
    if (timeframe === this.config.tacticalTimeframe) {
      this._updateTacticalIndicators(candle);
    } else if (this.config.strategicTimeframes.includes(timeframe)) {
      this._updateStrategicIndicators(timeframe, candle);
    }

    // 2. Si la vela que cerró es la que dispara las decisiones, iniciar análisis.
    if (timeframe === this.config.strategicDecisionTimeframe) {
      this._makeFinalDecision(candle);
    }
  }

  // =======================================================================
  // MÉTODOS DE LA CAPA ESTRATÉGICA
  // =======================================================================

  _updateStrategicIndicators(timeframe, candle) {
    const tfState = this.strategicState.get(timeframe);
    // Actualizar buffers de precios (manteniendo un tamaño máximo)
    ['open', 'high', 'low', 'close'].forEach(key => {
        tfState[key].push(candle[key]);
        if (tfState[key].length > 100) tfState[key].shift();
    });
    
    // Actualizar indicadores
    tfState.rsi.nextValue(candle.close);
    tfState.stochastic.nextValue({ high: candle.high, low: candle.low, close: candle.close });
  }

  _getConsolidatedStrategicScore(currentCandle) {
    let totalScore = 0;
    for (const tf of this.config.strategicTimeframes) {
      const tfState = this.strategicState.get(tf);
      
      // Construir un objeto vela simulado a partir de los datos del estado
      const candleForAnalysis = {
          open: tfState.open.at(-1),
          high: tfState.high.at(-1),
          low: tfState.low.at(-1),
          close: tfState.close.at(-1),
      };

      const scores = {
          priceAction: this._getPriceActionScore(candleForAnalysis),
          rsi: this._getRsiScore(tf),
          stochastic: this._getStochasticScore(tf)
      };
      const weightedScore = this._calculateWeightedScore(scores);
      tfState.lastSignalScore = weightedScore;
      totalScore += weightedScore * this.config.weights.timeframe[tf];
    }
    return totalScore;
  }

  _calculateWeightedScore(scores) {
    const { indicator } = this.config.weights;
    return (scores.priceAction * indicator.priceAction) +
           (scores.rsi * indicator.rsi) +
           (scores.stochastic * indicator.stochastic);
  }

  // (Los métodos _getPriceActionScore, _getRsiScore, _getStochasticScore son casi idénticos al v3)
  _getPriceActionScore(candle) {
    if (!candle) return 0;
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
  _getRsiScore(timeframe) {
    const rsiValues = this.strategicState.get(timeframe).rsi.getResult();
    if (rsiValues.length < 1) return 0;
    const rsi = rsiValues.at(-1);
    const { oversold, overbought } = this.config.rsi;
    if (rsi > overbought) return -1;
    if (rsi < oversold) return 1;
    return 0;
  }
  _getStochasticScore(timeframe) {
    const stochValues = this.strategicState.get(timeframe).stochastic.getResult();
    if (stochValues.length < 2) return 0;
    const [prev, curr] = stochValues.slice(-2);
    const isBullishCross = prev.k <= prev.d && curr.k > curr.d;
    const isBearishCross = prev.k >= prev.d && curr.k < curr.d;
    if (isBullishCross && curr.k < 30) return 2;
    if (isBearishCross && curr.k > 70) return -2;
    return 0;
  }


  // =======================================================================
  // MÉTODOS DE LA CAPA TÁCTICA
  // =======================================================================

  _updateTacticalIndicators(candle) {
    this.tacticalState.rsi.nextValue(candle.close);
  }

  _getTacticalConfirmationScore() {
    const rsiValues = this.tacticalState.rsi.getResult();
    if (rsiValues.length < 1) return { score: 0, direction: 'none' };

    const rsi = rsiValues.at(-1);
    const { neutralZone, confirmationWeight } = this.config.tacticalRsi;

    if (rsi > neutralZone[1]) {
      return { score: confirmationWeight, direction: 'green' }; // Momentum alcista
    }
    if (rsi < neutralZone[0]) {
      return { score: confirmationWeight, direction: 'red' }; // Momentum bajista
    }
    return { score: 0, direction: 'none' }; // Momentum neutral
  }

  // =======================================================================
  // LÓGICA DE DECISIÓN FINAL
  // =======================================================================

  _makeFinalDecision(candle) {
    // 1. Calcular la puntuación estratégica consolidada
    const strategicScore = this._getConsolidatedStrategicScore(candle);

    // 2. Si la puntuación estratégica no es prometedora, no hacer nada.
    if (Math.abs(strategicScore) < this.config.strategicThreshold) {
      // logger.warn(`[DEBUG-AUDIT] IndicatorEngine [${this.asset}]: Puntuación estratégica ${strategicScore.toFixed(2)} NO supera umbral ${this.config.strategicThreshold}. Descartando.`);
      return;
    }

    // 3. Obtener la confirmación de la capa táctica
    const tacticalConfirmation = this._getTacticalConfirmationScore();
    const strategicDirection = strategicScore > 0 ? 'green' : 'red';

    let finalScore = strategicScore;
    let reason = `Confluencia Estratégica (${strategicScore.toFixed(2)})`;

    // 4. Si el momentum táctico confirma la dirección estratégica, añadir la bonificación.
    if (tacticalConfirmation.direction === strategicDirection) {
      finalScore += (strategicDirection === 'green' ? 1 : -1) * tacticalConfirmation.score;
      reason += ` + Confirmación Táctica (${tacticalConfirmation.score})`;
    } else {
      // Si el momentum es neutral o va en contra, no se añade bonificación.
      // Podríamos incluso penalizarlo, pero por ahora lo dejamos así.
    }

    // 5. Comprobar si la puntuación final supera el umbral de decisión final.
    let decision = 'hold';
    if (finalScore > this.config.finalDecisionThreshold) {
      decision = 'green';
    } else if (finalScore < -this.config.finalDecisionThreshold) {
      decision = 'red';
    }

    if (decision !== 'hold') {
      const signal = {
        asset: this.asset,
        timeframe: candle.timeframe,
        decision,
        confidence: Math.min(1, Math.abs(finalScore) / (this.config.finalDecisionThreshold * 1.5)),
        reason: reason,
        candle,
      };
      
      logger.warn(`[${this.channelContext}] 🏆 ¡¡¡SEÑAL HÍBRIDA GENERADA!!! -> ${decision.toUpperCase()} | Puntuación Final: ${finalScore.toFixed(2)}`);
      this.signalCount++;
      this.emit('señalTecnica', signal);

      // Resetear puntuaciones para evitar señales duplicadas inmediatas
      this.config.strategicTimeframes.forEach(tf => {
        this.strategicState.get(tf).lastSignalScore = 0;
      });
    }
  }

  stop() {
    logger.info(`[${this.channelContext}] IndicatorEngine: Detenido. Total señales: ${this.signalCount}`);
    this.removeAllListeners('señalTecnica');
  }
}

export default IndicatorEngine;