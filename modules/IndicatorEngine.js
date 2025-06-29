import { RSI, SMA } from 'technicalindicators';
import logger from '../utils/logger.js';

/**
 * Motor de Indicadores Multi-Estratégico y Táctico.
 * Gestiona un conjunto de indicadores para cada temporalidad estratégica (1m, 5m, 15m)
 * y un único conjunto para la temporalidad táctica (5s).
 */
class IndicatorEngine {
    constructor() {
        this.strategicTimeframes = ['1m', '5m', '15m'];
        this.tacticTimeframe = '5s';

        // Almacena un conjunto de indicadores para cada temporalidad estratégica
        this.strategicIndicators = {};
        this.strategicTimeframes.forEach(tf => {
            this.strategicIndicators[tf] = {
                sma_slow: new SMA({ period: 25, values: [] }),
                sma_fast: new SMA({ period: 10, values: [] }),
                rsi: new RSI({ period: 14, values: [] }),
                values: { sma_slow: null, sma_fast: null, rsi: null }
            };
        });

        // Indicador único para la capa táctica
        this.tacticIndicators = {
            rsi: new RSI({ period: 14, values: [] }),
            values: { rsi: null }
        };
    }

    /**
     * Actualiza el conjunto de indicadores correcto según la temporalidad de la vela.
     * @param {object} candle - La vela cerrada, que incluye 'timeframe'.
     */
    update(candle) {
        const { timeframe, close } = candle;

        if (this.strategicTimeframes.includes(timeframe)) {
            const indicators = this.strategicIndicators[timeframe];
            indicators.values.sma_slow = indicators.sma_slow.nextValue(close);
            indicators.values.sma_fast = indicators.sma_fast.nextValue(close);
            indicators.values.rsi = indicators.rsi.nextValue(close);
        } else if (timeframe === this.tacticTimeframe) {
            this.tacticIndicators.values.rsi = this.tacticIndicators.rsi.nextValue(close);
        }
    }

    /**
     * Devuelve el estado actual de los indicadores.
     */
    getIndicators() {
        // Devuelve solo los valores calculados para un acceso más limpio
        const strategicValues = {};
        for (const tf in this.strategicIndicators) {
            strategicValues[tf] = this.strategicIndicators[tf].values;
        }

        return {
            strategic: strategicValues,
            tactic: this.tacticIndicators.values,
        };
    }
    
    /**
     * Impregna los indicadores de 1 minuto con velas históricas.
     * @param {Array<object>} historicalCandles - Velas históricas (deben ser de 1m).
     */
    prime(historicalCandles) {
        logger.info(`INDICATOR-ENGINE: Impregnando indicadores de '1m' con ${historicalCandles.length} velas...`);
        const strategic1m = this.strategicIndicators['1m'];
        if (strategic1m) {
            historicalCandles.forEach(candle => {
                const close = candle.close;
                strategic1m.values.sma_slow = strategic1m.sma_slow.nextValue(close);
                strategic1m.values.sma_fast = strategic1m.sma_fast.nextValue(close);
                strategic1m.values.rsi = strategic1m.rsi.nextValue(close);
            });
            logger.info('INDICATOR-ENGINE: Impregnación de '1m' completada.');
        }
    }
}

export default IndicatorEngine;
