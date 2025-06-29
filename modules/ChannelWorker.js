import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import IndicatorEngine from './IndicatorEngine.js';

class ChannelWorker extends EventEmitter {
    constructor(asset) {
        super();
        this.asset = asset;
        this.indicatorEngine = new IndicatorEngine();
        logger.info(`CHANNEL-WORKER: Trabajador Multi-Estratégico creado para ${asset}`);
    }

    handleCandle(candleData) {
        this.indicatorEngine.update(candleData);

        if (this.indicatorEngine.strategicTimeframes.includes(candleData.timeframe)) {
            const signal = this.evaluateStrategy(candleData.timeframe);
            
            if (signal) {
                return {
                    ...signal,
                    asset: this.asset,
                    channel: this.asset,
                    triggeredBy: candleData.timeframe
                };
            }
        }

        return null;
    }

    evaluateStrategy(timeframe) {
        const indicators = this.indicatorEngine.getIndicators();
        const strategic = indicators.strategic[timeframe];
        const tactic = indicators.tactic;

        if (!strategic || !strategic.sma_fast || !strategic.sma_slow || !strategic.rsi) {
            return null;
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
        
        const confidence = this.calculateConfidence(strategic, tactic, strategicSignal);
        
        logger.warn(`STRATEGY[${this.asset}][${timeframe}]: ¡CONFIRMACIÓN TÁCTICA! Generando señal ${strategicSignal.toUpperCase()} con confianza ${confidence.toFixed(2)}.`);

        return {
            decision: strategicSignal,
            confidence: confidence,
        };
    }

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

export default ChannelWorker;