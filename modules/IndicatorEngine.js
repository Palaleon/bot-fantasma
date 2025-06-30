import { RSI, SMA } from 'technicalindicators';
import logger from '../utils/logger.js';

/**
<<<<<<< HEAD
 * 🧠 Motor de Indicadores Multi-Estratégico y Táctico.
 * Refactorizado para una gestión de estado robusta y cálculos correctos.
 * Ahora es consciente de la "madurez" de los datos para evitar señales prematuras.
 */
class IndicatorEngine {
    constructor() {
        this.strategicTimeframes = ['1m', '5m', '10m', '15m', '30m']; // CONFIGURACIÓN CORREGIDA
        this.tacticTimeframe = '5s';

        this.indicators = {};

        // Inicialización para temporalidades estratégicas
        this.strategicTimeframes.forEach(tf => {
            this.indicators[tf] = {
                closes: [],
                isMature: false,
                requiredPeriod: 25, // El período más largo de los indicadores de este timeframe
                sma_slow_period: 25,
                sma_fast_period: 10,
                rsi_period: 14
            };
        });

        // Inicialización para la temporalidad táctica
        this.indicators[this.tacticTimeframe] = {
            closes: [],
            isMature: false,
            requiredPeriod: 14, // El período del RSI
            rsi_period: 14
        };

        logger.info("INDICATOR-ENGINE: Motor inicializado con nueva arquitectura.");
    }

    /**
     * Impregna los indicadores de una temporalidad específica con velas históricas.
     * @param {Array<object>} historicalCandles - Velas históricas para la temporalidad.
     * @param {string} timeframe - La temporalidad de las velas (e.g., '1m', '5m').
     */
    prime(historicalCandles, timeframe) {
        if (!this.indicators[timeframe]) {
            logger.warn(`INDICATOR-ENGINE: Intento de impregnar un timeframe no configurado: ${timeframe}`);
            return;
        }

        const indicatorSet = this.indicators[timeframe];
        const closes = historicalCandles.map(c => c.close);
        indicatorSet.closes = [...indicatorSet.closes, ...closes];
        
        logger.info(`INDICATOR-ENGINE: Impregnando timeframe '${timeframe}' con ${closes.length} velas.`);

        // Revisa si el indicador ha madurado después de la impregnación
        if (indicatorSet.closes.length >= indicatorSet.requiredPeriod) {
            indicatorSet.isMature = true;
            logger.info(`INDICATOR-ENGINE: ¡Timeframe '${timeframe}' ha madurado!`);
        }
    }

    /**
     * Actualiza el conjunto de indicadores con una nueva vela en tiempo real.
     * @param {object} candle - La vela cerrada, que incluye 'timeframe' y 'close'.
     */
    update(candle) {
        const { timeframe, close } = candle;
        const indicatorSet = this.indicators[timeframe];

        if (!indicatorSet) {
            return; // Ignorar velas de timeframes no monitoreados
        }

        indicatorSet.closes.push(close);

        // Mantiene el array de cierres con un tamaño razonable para no consumir memoria infinita
        // Se guarda el doble del período requerido para asegurar cálculos correctos
        const maxCloses = indicatorSet.requiredPeriod * 2;
        if (indicatorSet.closes.length > maxCloses) {
            indicatorSet.closes.shift(); // Elimina el más antiguo
        }

        // Un indicador madura cuando tiene suficientes datos para el cálculo más largo
        if (!indicatorSet.isMature && indicatorSet.closes.length >= indicatorSet.requiredPeriod) {
            indicatorSet.isMature = true;
            logger.info(`INDICATOR-ENGINE: ¡Timeframe '${timeframe}' ha madurado en tiempo real!`);
        }
    }

    /**
     * Devuelve el estado actual de todos los indicadores calculados.
     * Realiza los cálculos "al vuelo" para asegurar que siempre están actualizados.
     * @returns {object} El estado de los indicadores estratégicos y tácticos.
     */
    getIndicators() {
        const strategicValues = {};

        this.strategicTimeframes.forEach(tf => {
            const indicatorSet = this.indicators[tf];
            if (!indicatorSet.isMature) {
                strategicValues[tf] = { sma_slow: null, sma_fast: null, rsi: null };
            } else {
                const smaSlowInput = { values: indicatorSet.closes, period: indicatorSet.sma_slow_period };
                const smaFastInput = { values: indicatorSet.closes, period: indicatorSet.sma_fast_period };
                const rsiInput = { values: indicatorSet.closes, period: indicatorSet.rsi_period };

                const smaSlowResult = SMA.calculate(smaSlowInput);
                const smaFastResult = SMA.calculate(smaFastInput);
                const rsiResult = RSI.calculate(rsiInput);

                strategicValues[tf] = {
                    sma_slow: smaSlowResult[smaSlowResult.length - 1],
                    sma_fast: smaFastResult[smaFastResult.length - 1],
                    rsi: rsiResult[rsiResult.length - 1]
                };
            }
        });

        const tacticValues = {};
        const tacticSet = this.indicators[this.tacticTimeframe];
        if (!tacticSet.isMature) {
            tacticValues.rsi = null;
        } else {
            const rsiInput = { values: tacticSet.closes, period: tacticSet.rsi_period };
            const rsiResult = RSI.calculate(rsiInput);
            tacticValues.rsi = rsiResult[rsiResult.length - 1];
        }

        return {
            strategic: strategicValues,
            tactic: tacticValues,
        };
    }
=======
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
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
}

export default IndicatorEngine;
