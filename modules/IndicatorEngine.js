import { RSI, SMA } from 'technicalindicators';
import logger from '../utils/logger.js';

/**
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
}

export default IndicatorEngine;
