import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import IndicatorEngine from './IndicatorEngine.js';

class ChannelWorker extends EventEmitter {
    constructor(asset) {
        super();
        this.asset = asset;
        this.indicatorEngine = new IndicatorEngine(); // Cada canal tiene su propio motor.
        logger.info(`CHANNEL-WORKER: Nuevo trabajador creado para ${asset}`);

        // Aquí podrías tener lógicas diferentes o motores por temporalidad si fuera necesario
        // Por ahora, usamos un único motor que se actualiza desde diferentes velas.
    }

    /**
     * Maneja una vela cerrada de cualquier temporalidad.
     * @param {object} candleData - La vela cerrada, que incluye el 'timeframe'.
     * @returns Una señal de trading o null.
     */
    handleCandle(candleData) {
        // 1. Actualizar indicadores con la vela recibida.
        // El IndicatorEngine internamente podría tener lógicas para usar diferentes temporalidades.
        // Por ahora, asumimos que actualiza un estado general.
        this.indicatorEngine.update(candleData);

        // 2. Evaluar la estrategia basada en el estado actual de los indicadores.
        // Aquí es donde se decide si se debe operar.
        // La lógica de la estrategia podría depender del 'timeframe' de la vela que activó la evaluación.
        const signal = this.evaluateStrategy(candleData.timeframe);

        if (signal) {
            return {
                ...signal,
                asset: this.asset,
                channel: this.asset, // Para referencia
            };
        }
        return null;
    }

    /**
     * Evalúa la estrategia de trading.
     * Esta es la "receta" que decide cuándo comprar o vender.
     * @param {string} triggeredByTimeframe - La temporalidad que disparó esta evaluación.
     * @returns Un objeto de señal o null.
     */
    evaluateStrategy(triggeredByTimeframe) {
        // EJEMPLO DE ESTRATEGIA SIMPLE:
        // Si la vela que cerró es de 5s (táctica), y la media móvil de 1m (estratégica) es alcista, comprar.

        const { rsi, sma_fast, sma_slow } = this.indicatorEngine.getIndicators();

        // Asegurarse de que los indicadores están listos
        if (!rsi || !sma_fast || !sma_slow) {
            return null;
        }

        // Lógica de decisión
        let decision = null;
        let confidence = 0;

        if (rsi > 70 && sma_fast < sma_slow) {
            decision = 'put'; // 'red'
            confidence = (rsi - 70) / 30; // Normalizar confianza
        } else if (rsi < 30 && sma_fast > sma_slow) {
            decision = 'call'; // 'green'
            confidence = (30 - rsi) / 30; // Normalizar confianza
        }

        if (decision) {
            logger.info(`STRATEGY[${this.asset}]: Decisión: ${decision.toUpperCase()} | Confianza: ${confidence.toFixed(2)} | RSI: ${rsi.toFixed(2)}`);
            return {
                decision: decision,
                confidence: parseFloat(confidence.toFixed(2)),
            };
        }

        return null;
    }
}

export default ChannelWorker;
