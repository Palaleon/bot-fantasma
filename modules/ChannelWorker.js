import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import IndicatorEngine from './IndicatorEngine.js';

class ChannelWorker extends EventEmitter {
    constructor(asset) {
        super();
        this.asset = asset;
        this.indicatorEngine = new IndicatorEngine();
        logger.info(`CHANNEL-WORKER: v3.0 (Estratega Avanzado) creado para ${asset}`, { asset: asset });
    }

    handleCandle(candleData) {
        this.indicatorEngine.update(candleData);

        if (this.indicatorEngine.strategicTimeframes.includes(candleData.timeframe)) {
            const signal = this.evaluateStrategy(candleData.timeframe);
            if (signal) {
                return { ...signal, asset: this.asset, channel: this.asset, triggeredBy: candleData.timeframe };
            }
        }
        return null;
    }

    // === INICIO ACTUALIZACIÓN v3.0 ===
    /**
     * Verifica que la tendencia en temporalidades mayores apoye la señal actual.
     * @private
     * @param {string} direction - 'call' o 'put'.
     * @param {string} timeframe - La temporalidad de la señal original (ej. '1m').
     * @param {object} strategicIndicators - El objeto con todos los indicadores estratégicos.
     * @returns {object} Un objeto con el factor de confianza y un texto de diagnóstico.
     */
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
            return { factor: 1.0, text: `Alineado con ${higherTimeframe}.` }; // Sin penalización si está alineado
        } else {
            return { factor: 0.7, text: `Conflicto con ${higherTimeframe}!` }; // Penalización si no hay alineación
        }
    }
    // === FIN ACTUALIZACIÓN v3.0 ===

    evaluateStrategy(timeframe) {
        const { strategic, tactic, chartist } = this.indicatorEngine.getIndicators();
        const effectiveness = this.indicatorEngine.getEffectiveness(timeframe);

        if (!strategic[timeframe] || !effectiveness) {
            return null;
        }

        // === INICIO ACTUALIZACIÓN v3.0: Filtro de Régimen de Mercado ===
        const adxValue = strategic[timeframe].adx;
        const isTrending = adxValue > 22; // Umbral de ADX para considerar tendencia
        // === FIN ACTUALIZACIÓN v3.0 ===

        let quantitativeSignal = this._getQuantitativeSignal(strategic[timeframe], tactic, effectiveness);
        const chartistSignal = chartist[timeframe];
        
        // === INICIO ACTUALIZACIÓN v3.0: Aplicar filtro ADX ===
        if (quantitativeSignal && !isTrending) {
            // Si la señal es cuantitativa (cruce de SMA) pero el mercado no está en tendencia, se penaliza.
            quantitativeSignal.confidence -= 0.3; // Fuerte penalización
            quantitativeSignal.context.push(`Rango (ADX: ${adxValue.toFixed(1)})`);
        } else if (quantitativeSignal) {
            quantitativeSignal.context.push(`Tendencia (ADX: ${adxValue.toFixed(1)})`);
        }
        // === FIN ACTUALIZACIÓN v3.0 ===

        let finalDecision = null;
        let finalConfidence = 0;
        let diagnosis = {};

        if (quantitativeSignal && chartistSignal) {
            if (quantitativeSignal.direction === chartistSignal.direction) {
                finalDecision = quantitativeSignal.direction;
                finalConfidence = (quantitativeSignal.confidence + chartistSignal.confidence) / 2 + 0.1;
                diagnosis = {
                    source: 'Consenso Total',
                    quantitative: `Cruce SMA (Efectividad: ${(effectiveness.sma_cross.score * 100).toFixed(0)}%)`,
                    chartist: `${chartistSignal.pattern} (Efectividad: ${(chartistSignal.confidence * 100).toFixed(0)}%)`,
                    context: quantitativeSignal.context
                };
            } else {
                return null;
            }
        } else if (quantitativeSignal) {
            finalDecision = quantitativeSignal.direction;
            finalConfidence = quantitativeSignal.confidence;
            diagnosis = {
                source: 'Señal Cuantitativa',
                quantitative: `Cruce SMA (Efectividad: ${(effectiveness.sma_cross.score * 100).toFixed(0)}%)`,
                context: quantitativeSignal.context
            };
        } else if (chartistSignal) {
            finalDecision = chartistSignal.direction;
            finalConfidence = chartistSignal.confidence;
            diagnosis = { source: 'Patrón de Velas Fiable', chartist: `${chartistSignal.pattern} (Efectividad: ${(chartistSignal.confidence * 100).toFixed(0)}%)` };
        }

        if (!finalDecision) return null;

        // === INICIO ACTUALIZACIÓN v3.0: Filtro de Confluencia ===
        const confluence = this._checkConfluence(finalDecision, timeframe, strategic);
        finalConfidence *= confluence.factor;
        if (diagnosis.context) {
            diagnosis.context.push(confluence.text);
        } else {
            diagnosis.context = [confluence.text];
        }
        // === FIN ACTUALIZACIÓN v3.0 ===
        
        if (finalConfidence < 0.65) return null; // Umbral de confianza ligeramente más exigente

        logger.warn(`STRATEGY[${this.asset}][${timeframe}]: ¡DECISIÓN FINAL! ${finalDecision.toUpperCase()} con confianza ${finalConfidence.toFixed(2)}.`, { asset: this.asset });
        return { decision: finalDecision, confidence: Math.min(0.98, finalConfidence), diagnosis };
    }

    _getQuantitativeSignal(strategic, tactic, effectiveness) {
        let direction = null;
        if (strategic.sma_fast > strategic.sma_slow && strategic.rsi < 68) {
            direction = 'call';
        } else if (strategic.sma_slow > strategic.sma_fast && strategic.rsi > 32) {
            direction = 'put';
        }
        if (!direction) return null;

        if (tactic.rsi !== null) {
            if ((direction === 'call' && tactic.rsi < 52) || (direction === 'put' && tactic.rsi > 48)) {
                return null;
            }
        }

        let confidence = effectiveness.sma_cross.score;
        const spread = Math.abs(strategic.sma_fast - strategic.sma_slow) / strategic.sma_slow;
        confidence += spread;

        const price = strategic.sma_fast;
        const atrPercentage = (strategic.atr / price) * 100;
        let context = [];

        if (atrPercentage < 0.05) {
            confidence -= 0.2;
            context.push('Volatilidad Baja');
        } else {
            context.push('Volatilidad OK');
        }

        const distanceToResistance = Math.abs(strategic.resistance - price);
        const distanceToSupport = Math.abs(price - strategic.support);
        if (direction === 'call') {
            if (distanceToResistance < strategic.atr) confidence -= 0.25; else context.push('Sin resistencias cercanas');
        } else {
            if (distanceToSupport < strategic.atr) confidence -= 0.25; else context.push('Sin soportes cercanos');
        }

        return { direction, confidence, context };
    }
}

export default ChannelWorker;