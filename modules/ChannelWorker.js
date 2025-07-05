import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import IndicatorEngine from './IndicatorEngine.js';

class ChannelWorker extends EventEmitter {
    constructor(asset) {
        super();
        this.asset = asset;
        this.indicatorEngine = new IndicatorEngine();
        this.liveSignalTracker = {};
        logger.info(`CHANNEL-WORKER: v5.2 (Lógica Post-Mortem Corregida) creado para ${asset}`, { asset: asset });
    }

    handleCandle(candleData) {
        this.indicatorEngine.update(candleData);
        if (this.indicatorEngine.strategicTimeframes.includes(candleData.timeframe)) {
            const signal = this.evaluateStrategy(candleData.timeframe);
            if (signal) {
                return { ...signal, asset: this.asset, channel: this.asset, triggeredBy: candleData.timeframe };
            }
        }
        return null; // Asegurarse de retornar null si no hay señal
    }

    handleLiveCandle(candleData) {
        if (this.indicatorEngine.strategicTimeframes.includes(candleData.timeframe)) {
            const signal = this.evaluateLiveStrategy(candleData);
            if (signal) {
                return { ...signal, asset: this.asset, channel: this.asset, triggeredBy: `live_${candleData.timeframe}` };
            }
        }
        return null; // Asegurarse de retornar null si no hay señal
    }

    _checkConfluence(direction, timeframe, strategicIndicators) {
        const timeframes = this.indicatorEngine.strategicTimeframes;
        const currentIndex = timeframes.indexOf(timeframe);
        if (currentIndex < 0 || currentIndex >= timeframes.length - 1) {
            return { factor: 1.0, text: "Temporalidad máxima o no encontrada." };
        }
        const higherTimeframe = timeframes[currentIndex + 1];
        const higherTfIndicators = strategicIndicators[higherTimeframe];
        if (!higherTfIndicators) {
            return { factor: 1.0, text: `TF Superior (${higherTimeframe}) no maduro.` };
        }
        const isHigherTfAligned = 
            (direction === 'call' && higherTfIndicators.sma_fast > higherTfIndicators.sma_slow) ||
            (direction === 'put' && higherTfIndicators.sma_fast < higherTfIndicators.sma_slow);
        if (isHigherTfAligned) {
            return { factor: 1.2, text: `Alineado con ${higherTimeframe}.` };
        } else {
            return { factor: 0.7, text: `Conflicto con ${higherTimeframe}!` };
        }
    }

    evaluateStrategy(timeframe) {
        const { strategic, tactic, chartist } = this.indicatorEngine.getIndicators();
        const effectiveness = this.indicatorEngine.getEffectiveness(timeframe);
        if (!strategic[timeframe] || !effectiveness) return null;

        const adxValue = strategic[timeframe].adx;
        const isTrending = adxValue > 22;
        let quantitativeSignal = this._getQuantitativeSignal(strategic[timeframe], tactic, effectiveness, timeframe);
        const chartistSignal = chartist[timeframe];
        
        if (quantitativeSignal && !isTrending) {
            quantitativeSignal.confidence -= 0.1;
            quantitativeSignal.context.push(`Rango (ADX: ${adxValue.toFixed(1)})`);
        } else if (quantitativeSignal) {
            quantitativeSignal.context.push(`Tendencia (ADX: ${adxValue.toFixed(1)})`);
        }

        let finalDecision = null;
        let finalConfidence = 0;
        let diagnosis = {};

        if (quantitativeSignal && chartistSignal) {
            if (quantitativeSignal.direction === chartistSignal.direction) {
                finalDecision = quantitativeSignal.direction;
                finalConfidence = (quantitativeSignal.confidence + chartistSignal.confidence) / 2 + 0.1;
                diagnosis = { source: 'Consenso Total', context: quantitativeSignal.context };
            } else {
                return null;
            }
        } else if (quantitativeSignal) {
            finalDecision = quantitativeSignal.direction;
            finalConfidence = quantitativeSignal.confidence;
            diagnosis = { source: 'Señal Cuantitativa', context: quantitativeSignal.context };
        } else if (chartistSignal) {
            finalDecision = chartistSignal.direction;
            finalConfidence = chartistSignal.confidence;
            diagnosis = { source: 'Patrón de Velas Fiable' };
        }

        if (!finalDecision) return null;

        const confluence = this._checkConfluence(finalDecision, timeframe, strategic);
        finalConfidence *= confluence.factor;
        if (diagnosis.context) {
            diagnosis.context.push(confluence.text);
        } else {
            diagnosis.context = [confluence.text];
        }
        
        if (finalConfidence < 0.65) return null;

        const executionParams = { expiration: 1 };

        logger.warn(`STRATEGY[${this.asset}][${timeframe}]: ¡SEÑAL GENERADA! ${finalDecision.toUpperCase()} con confianza ${finalConfidence.toFixed(2)}.`, { asset: this.asset });

        return { 
            decision: finalDecision, 
            confidence: Math.min(0.98, finalConfidence), 
            diagnosis,
            marketSnapshot: this.indicatorEngine.getIndicators(),
            executionParams,
        };
    }

    _getQuantitativeSignal(strategic, tactic, effectiveness, timeframe) {
        // UNIFICADO: La misma estrategia robusta se aplica a TODAS las temporalidades.
        if (!strategic || !strategic.sma_fast || !strategic.sma_slow || !strategic.rsi || !strategic.atr) {
            return null; // No hay suficientes datos para una decisión cuantitativa.
        }

        let direction = null;
        if (strategic.sma_fast > strategic.sma_slow && strategic.rsi < 68) {
            direction = 'call';
        } else if (strategic.sma_slow > strategic.sma_fast && strategic.rsi > 32) {
            direction = 'put';
        }

        if (!direction) return null;

        // La confianza base viene de la efectividad histórica del cruce de SMAs.
        let confidence = effectiveness.sma_cross.score;
        let context = [];

        // Ajuste de confianza basado en la separación de las medias (momentum).
        const spread = Math.abs(strategic.sma_fast - strategic.sma_slow) / strategic.sma_slow;
        confidence += spread;
        context.push(`Separación SMA: ${(spread * 100).toFixed(2)}%`);

        // Filtro de volatilidad basado en ATR.
        const price = strategic.sma_fast;
        const atrPercentage = (strategic.atr / price) * 100;
        if (atrPercentage < 0.05) {
            confidence -= 0.2;
            context.push('Volatilidad Baja (ATR)');
        } else {
            context.push('Volatilidad OK (ATR)');
        }

        // Filtro de Soportes y Resistencias.
        if (strategic.support && strategic.resistance) {
            const distanceToResistance = Math.abs(strategic.resistance - price);
            const distanceToSupport = Math.abs(price - strategic.support);
            if (direction === 'call') {
                if (distanceToResistance < strategic.atr) {
                    confidence -= 0.25;
                    context.push('Resistencia cercana');
                } else {
                    context.push('Sin resistencias cercanas');
                }
            } else { // put
                if (distanceToSupport < strategic.atr) {
                    confidence -= 0.25;
                    context.push('Soporte cercano');
                } else {
                    context.push('Sin soportes cercanos');
                }
            }
        }

        return { direction, confidence, context };
    }

    evaluateLiveStrategy(liveCandle) {
        const timeframe = liveCandle.timeframe;
        const tracker = this.liveSignalTracker[timeframe];
        const { strategic, tactic } = this.indicatorEngine.getIndicatorsForLiveCandle(liveCandle);

        if (!strategic || !strategic[timeframe]) {
            if (tracker) {
                logger.info(`OPE[${this.asset}][live_${timeframe}]: Condición rota por falta de indicadores. Reseteando.`);
                delete this.liveSignalTracker[timeframe];
            }
            return null;
        }

        let potentialSignal = this._getQuantitativeSignal(strategic[timeframe], tactic, { sma_cross: { score: 0.6 } }, timeframe);
        if (potentialSignal) {
            const adxValue = strategic[timeframe].adx;
            potentialSignal.context.push(adxValue > 22 ? `Live-Tendencia (ADX: ${adxValue.toFixed(1)})` : `Live-Rango (ADX: ${adxValue.toFixed(1)})`);
        }

        if (!potentialSignal && !tracker) return null;

        if (!potentialSignal || potentialSignal.confidence < 0.70) {
            if (tracker) {
                logger.info(`OPE[${this.asset}][live_${timeframe}]: Condición para ${tracker.direction.toUpperCase()} rota. Reseteando.`);
                delete this.liveSignalTracker[timeframe];
            }
            return null;
        }

        if (!tracker) {
            this.liveSignalTracker[timeframe] = {
                status: 'observing', direction: potentialSignal.direction, firstSeen: Date.now(), ticksSeen: 1, lastSignal: potentialSignal
            };
            logger.info(`OPE[${this.asset}][live_${timeframe}]: Nueva condición ${potentialSignal.direction.toUpperCase()} en OBSERVACIÓN.`);
            return null;
        }

        if (tracker.direction !== potentialSignal.direction) {
            this.liveSignalTracker[timeframe] = {
                status: 'observing', direction: potentialSignal.direction, firstSeen: Date.now(), ticksSeen: 1, lastSignal: potentialSignal
            };
            logger.info(`OPE[${this.asset}][live_${timeframe}]: Condición cambió de ${tracker.direction.toUpperCase()} a ${potentialSignal.direction.toUpperCase()}. Reiniciando observación.`);
            return null;
        }
        
        if (tracker.status === 'observing') {
            tracker.ticksSeen++;
            tracker.lastSignal = potentialSignal;
            const timeElapsed = Date.now() - tracker.firstSeen;
            if (tracker.ticksSeen >= 5 && timeElapsed >= 3000) {
                logger.warn(`OPE[${this.asset}][live_${timeframe}]: Señal ${tracker.direction.toUpperCase()} CONFIRMADA. Pasando a fase de OPTIMIZACIÓN.`);
                tracker.status = 'optimizing';
                tracker.optimizationData = { bestPriceSeen: liveCandle.close, entryWindowEnd: Date.now() + 5000 };
            }
            return null;
        }

        if (tracker.status === 'optimizing') {
            const optData = tracker.optimizationData;
            let fireSignal = false;
            let reason = '';

            if (tracker.direction === 'put' && liveCandle.close > optData.bestPriceSeen) {
                optData.bestPriceSeen = liveCandle.close;
            } else if (tracker.direction === 'call' && liveCandle.close < optData.bestPriceSeen) {
                optData.bestPriceSeen = liveCandle.close;
            }

            if (Date.now() >= optData.entryWindowEnd) {
                fireSignal = true;
                reason = 'Ventana de optimización cerrada';
            }

            if (fireSignal) {
                const confluence = this._checkConfluence(tracker.direction, timeframe, strategic);
                let finalConfidence = tracker.lastSignal.confidence * confluence.factor;
                tracker.lastSignal.context.push(confluence.text);

                if (finalConfidence < 0.70) {
                    logger.warn(`OPE[${this.asset}][live_${timeframe}]: Señal ${tracker.direction.toUpperCase()} CANCELADA por falta de confluencia. Confianza final: ${finalConfidence.toFixed(2)}`);
                    delete this.liveSignalTracker[timeframe];
                    return null;
                }

                const executionParams = { expiration: 1 };

                logger.warn(`OPE[${this.asset}][live_${timeframe}]: ¡SEÑAL GENERADA! ${tracker.direction.toUpperCase()} por: ${reason}. Precio optimizado: ${optData.bestPriceSeen}.`);
                tracker.status = 'fired';
                
                return { 
                    decision: tracker.direction, 
                    confidence: Math.min(0.98, finalConfidence), 
                    diagnosis: { source: 'Señal Optimizada en Vivo', context: tracker.lastSignal.context },
                    marketSnapshot: this.indicatorEngine.getIndicators(),
                    executionParams,
                };
            }
            return null;
        }

        if (tracker.status === 'fired') {
            return null;
        }

        return null;
    }
}

export default ChannelWorker;