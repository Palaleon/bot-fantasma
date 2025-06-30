import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import IndicatorEngine from './IndicatorEngine.js';

<<<<<<< HEAD
=======
/**
 * ChannelWorker Multi-Estratégico
 * Evalúa oportunidades en múltiples temporalidades estratégicas (1m, 5m, 15m),
 * confirmando cada una con una única capa táctica (5s).
 */
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
class ChannelWorker extends EventEmitter {
    constructor(asset) {
        super();
        this.asset = asset;
        this.indicatorEngine = new IndicatorEngine();
        logger.info(`CHANNEL-WORKER: Trabajador Multi-Estratégico creado para ${asset}`);
    }

<<<<<<< HEAD
    handleCandle(candleData) {
        this.indicatorEngine.update(candleData);

=======
    /**
     * Maneja una vela cerrada. Si es estratégica, activa la evaluación.
     * @param {object} candleData - La vela cerrada, que incluye 'timeframe'.
     * @returns Una señal de trading o null.
     */
    handleCandle(candleData) {
        // Siempre actualizamos el motor de indicadores primero.
        this.indicatorEngine.update(candleData);

        // La estrategia se dispara si la vela es de CUALQUIER temporalidad estratégica.
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
        if (this.indicatorEngine.strategicTimeframes.includes(candleData.timeframe)) {
            const signal = this.evaluateStrategy(candleData.timeframe);
            
            if (signal) {
                return {
                    ...signal,
                    asset: this.asset,
                    channel: this.asset,
<<<<<<< HEAD
                    triggeredBy: candleData.timeframe
=======
                    triggeredBy: candleData.timeframe // Añadimos contexto sobre qué disparó la señal
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
                };
            }
        }

        return null;
    }

<<<<<<< HEAD
=======
    /**
     * Evalúa la estrategia para una temporalidad estratégica específica.
     * @param {string} timeframe - La temporalidad estratégica que se está evaluando ('1m', '5m', '15m').
     * @returns Un objeto de señal o null.
     */
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
    evaluateStrategy(timeframe) {
        const indicators = this.indicatorEngine.getIndicators();
        const strategic = indicators.strategic[timeframe];
        const tactic = indicators.tactic;

<<<<<<< HEAD
        if (!strategic || !strategic.sma_fast || !strategic.sma_slow || !strategic.rsi) {
            return null;
=======
        // --- Fase 1: Verificación de Condiciones Estratégicas ---
        if (!strategic || !strategic.sma_fast || !strategic.sma_slow || !strategic.rsi) {
            return null; // Indicadores para esta temporalidad no están listos.
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
        }

        let strategicSignal = null;
        if (strategic.sma_fast > strategic.sma_slow && strategic.rsi < 68) {
            strategicSignal = 'call';
        } else if (strategic.sma_slow > strategic.sma_fast && strategic.rsi > 32) {
            strategicSignal = 'put';
        }

        if (!strategicSignal) {
            return null;
        }
        
        logger.warn(`STRATEGY[${this.asset}][${timeframe}]: Oportunidad estratégica detectada: ${strategicSignal.toUpperCase()}`);

<<<<<<< HEAD
=======
        // --- Fase 2: Búsqueda de Confirmación Táctica ---
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
        if (!tactic.rsi) {
            logger.warn(`STRATEGY[${this.asset}][${timeframe}]: Oportunidad encontrada, pero esperando confirmación táctica (RSI 5s no listo).`);
            return null;
        }

        let isTacticConfirmed = false;
        if (strategicSignal === 'call' && tactic.rsi > 52) {
            isTacticConfirmed = true;
        } else if (strategicSignal === 'put' && tactic.rsi < 48) {
            isTacticConfirmed = true;
        }

        if (!isTacticConfirmed) {
            return null;
        }
        
<<<<<<< HEAD
=======
        // --- Fase 3: Generación de la Señal Final ---
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
        const confidence = this.calculateConfidence(strategic, tactic, strategicSignal);
        
        logger.warn(`STRATEGY[${this.asset}][${timeframe}]: ¡CONFIRMACIÓN TÁCTICA! Generando señal ${strategicSignal.toUpperCase()} con confianza ${confidence.toFixed(2)}.`);

        return {
            decision: strategicSignal,
            confidence: confidence,
        };
    }

<<<<<<< HEAD
=======
    /**
     * Calcula la confianza basada en la fuerza de los indicadores.
     */
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
    calculateConfidence(strategic, tactic, signal) {
        let confidence = 0.5;
        const spread = Math.abs(strategic.sma_fast - strategic.sma_slow) / strategic.sma_slow;

        if (signal === 'call') {
            confidence += (strategic.rsi - 50) / 100 + (tactic.rsi - 50) / 100 + spread * 2;
        } else {
            confidence += (50 - strategic.rsi) / 100 + (50 - tactic.rsi) / 100 + spread * 2;
        }
        return Math.max(0.5, Math.min(1.0, confidence));
    }
}

<<<<<<< HEAD
export default ChannelWorker;
=======
export default ChannelWorker;
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
