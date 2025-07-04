import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import IndicatorEngine from './IndicatorEngine.js';

class ChannelWorker extends EventEmitter {
    constructor(asset) {
        super();
        this.asset = asset;
        this.indicatorEngine = new IndicatorEngine();
        // INICIO: Rastreador de Estado de Señales en Vivo (v5.0)
        this.liveSignalTracker = {}; // Objeto para rastrear el ciclo de vida completo de las señales
        // FIN: Rastreador de Estado de Señales en Vivo (v5.0)
        logger.info(`CHANNEL-WORKER: v5.1 (Estrategia 1M Avanzada) creado para ${asset}`, { asset: asset });
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

    handleLiveCandle(candleData) {
        if (this.indicatorEngine.strategicTimeframes.includes(candleData.timeframe)) {
            const signal = this.evaluateLiveStrategy(candleData);
            if (signal) {
                return { ...signal, asset: this.asset, channel: this.asset, triggeredBy: `live_${candleData.timeframe}` };
            }
        }
        return null;
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
            return { factor: 1.2, text: `Alineado con ${higherTimeframe}.` }; // Bonus por alineación
        } else {
            return { factor: 0.7, text: `Conflicto con ${higherTimeframe}!` }; // Penalización si no hay alineación
        }
    }

    evaluateStrategy(timeframe) {
        const { strategic, tactic, chartist } = this.indicatorEngine.getIndicators();
        const effectiveness = this.indicatorEngine.getEffectiveness(timeframe);

        if (!strategic[timeframe] || !effectiveness) {
            return null;
        }

        const adxValue = strategic[timeframe].adx;
        const isTrending = adxValue > 22;

        // MODIFICADO: Se pasa el timeframe a la función de señal cuantitativa
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

        logger.warn(`STRATEGY[${this.asset}][${timeframe}]: ¡DECISIÓN FINAL! ${finalDecision.toUpperCase()} con confianza ${finalConfidence.toFixed(2)}.`, { asset: this.asset });
        return { decision: finalDecision, confidence: Math.min(0.98, finalConfidence), diagnosis };
    }

    // =========================================================================
    // === INICIO: LÓGICA DE SEÑAL CUANTITATIVA v2.0 (MULTI-ESTRATEGIA) ===
    // =========================================================================
    _getQuantitativeSignal(strategic, tactic, effectiveness, timeframe) {
        // --- ESTRATEGIA AVANZADA PARA 1M ---
        if (timeframe === '1m') {
            // Asegurarse de que los indicadores avanzados para 1M están disponibles
            if (!strategic.macd || !strategic.bb) {
                return null;
            }

            let direction = null;
            let context = [];
            let confidence = 0.6; // Confianza base para la estrategia de 1M

            const price = strategic.sma_fast; // Usamos un precio de referencia
            
            // Condición para CALL
            if (price <= strategic.bb.lower && strategic.macd.histogram > 0) {
                direction = 'call';
                context.push('Precio cerca de BB Inferior');
                context.push(`MACD Histograma positivo (${strategic.macd.histogram.toFixed(4)})`);
                confidence += 0.1;
                if (strategic.rsi < 40) {
                    confidence += 0.1;
                    context.push(`RSI bajo (${strategic.rsi.toFixed(1)})`);
                }
            }
            // Condición para PUT
            else if (price >= strategic.bb.upper && strategic.macd.histogram < 0) {
                direction = 'put';
                context.push('Precio cerca de BB Superior');
                context.push(`MACD Histograma negativo (${strategic.macd.histogram.toFixed(4)})`);
                confidence += 0.1;
                if (strategic.rsi > 60) {
                    confidence += 0.1;
                    context.push(`RSI alto (${strategic.rsi.toFixed(1)})`);
                }
            }

            if (!direction) return null;

            return { direction, confidence, context };
        }
        // --- ESTRATEGIA ESTÁNDAR PARA OTRAS TEMPORALIDADES ---
        else {
            let direction = null;
            if (strategic.sma_fast > strategic.sma_slow && strategic.rsi < 68) {
                direction = 'call';
            } else if (strategic.sma_slow > strategic.sma_fast && strategic.rsi > 32) {
                direction = 'put';
            }
            if (!direction) return null;

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

            // En la estrategia estándar, los soportes y resistencias son más relevantes
            if (strategic.support && strategic.resistance) {
                const distanceToResistance = Math.abs(strategic.resistance - price);
                const distanceToSupport = Math.abs(price - strategic.support);
                if (direction === 'call') {
                    if (distanceToResistance < strategic.atr) confidence -= 0.25; else context.push('Sin resistencias cercanas');
                } else {
                    if (distanceToSupport < strategic.atr) confidence -= 0.25; else context.push('Sin soportes cercanos');
                }
            }

            return { direction, confidence, context };
        }
    }
    // =========================================================================
    // === FIN: LÓGICA DE SEÑAL CUANTITATIVA v2.0 ===
    // =========================================================================


    // =========================================================================
    // === INICIO: LÓGICA DE ESTRATEGIA EN VIVO v5.0 (CON OPE) ===
    // =========================================================================
    evaluateLiveStrategy(liveCandle) {
        const timeframe = liveCandle.timeframe;
        const tracker = this.liveSignalTracker[timeframe];

        // Obtener indicadores hipotéticos
        const { strategic, tactic } = this.indicatorEngine.getIndicatorsForLiveCandle(liveCandle);

        // Si no hay indicadores, la condición se rompe. Si había un tracker, se resetea.
        if (!strategic || !strategic[timeframe]) {
            if (tracker) {
                logger.info(`OPE[${this.asset}][live_${timeframe}]: Condición rota por falta de indicadores. Reseteando.`);
                delete this.liveSignalTracker[timeframe];
            }
            return null;
        }

        // MODIFICADO: Se pasa el timeframe a la función de señal cuantitativa
        let potentialSignal = this._getQuantitativeSignal(strategic[timeframe], tactic, { sma_cross: { score: 0.6 } }, timeframe);
        if (potentialSignal) {
            const adxValue = strategic[timeframe].adx;
            potentialSignal.context.push(adxValue > 22 ? `Live-Tendencia (ADX: ${adxValue.toFixed(1)})` : `Live-Rango (ADX: ${adxValue.toFixed(1)})`);
        }

        // --- INICIO GESTOR DE ESTADOS DEL TRACKER ---

        // ESTADO: SIN SEÑAL
        // Si no hay señal potencial y no hay tracker, no hacemos nada.
        if (!potentialSignal && !tracker) {
            return null;
        }

        // Si la condición se rompe (no hay señal o la confianza es baja), reseteamos el tracker y salimos.
        if (!potentialSignal || potentialSignal.confidence < 0.70) {
            if (tracker) {
                logger.info(`OPE[${this.asset}][live_${timeframe}]: Condición para ${tracker.direction.toUpperCase()} rota. Reseteando.`);
                delete this.liveSignalTracker[timeframe];
            }
            return null;
        }

        // ESTADO: OBSERVANDO
        // Si hay una señal potencial pero no hay tracker, lo creamos en estado 'observing'.
        if (!tracker) {
            this.liveSignalTracker[timeframe] = {
                status: 'observing',
                direction: potentialSignal.direction,
                firstSeen: Date.now(),
                ticksSeen: 1,
                lastSignal: potentialSignal
            };
            logger.info(`OPE[${this.asset}][live_${timeframe}]: Nueva condición ${potentialSignal.direction.toUpperCase()} en OBSERVACIÓN.`);
            return null;
        }

        // Si la dirección de la señal cambia, reseteamos el tracker y empezamos a observar la nueva señal.
        if (tracker.direction !== potentialSignal.direction) {
            logger.info(`OPE[${this.asset}][live_${timeframe}]: Condición cambió de ${tracker.direction.toUpperCase()} a ${potentialSignal.direction.toUpperCase()}. Reiniciando observación.`);
            this.liveSignalTracker[timeframe] = {
                status: 'observing',
                direction: potentialSignal.direction,
                firstSeen: Date.now(),
                ticksSeen: 1,
                lastSignal: potentialSignal
            };
            return null;
        }
        
        // Si la señal persiste y estamos observando, actualizamos el contador.
        if (tracker.status === 'observing') {
            tracker.ticksSeen++;
            tracker.lastSignal = potentialSignal;

            const timeElapsed = Date.now() - tracker.firstSeen;
            const MIN_TICKS = 5;
            const MIN_TIME_MS = 3000;

            // Comprobamos si la señal se ha estabilizado
            if (tracker.ticksSeen >= MIN_TICKS && timeElapsed >= MIN_TIME_MS) {
                logger.warn(`OPE[${this.asset}][live_${timeframe}]: Señal ${tracker.direction.toUpperCase()} CONFIRMADA. Pasando a fase de OPTIMIZACIÓN.`);
                tracker.status = 'optimizing';
                tracker.optimizationData = {
                    bestPriceSeen: liveCandle.close, // El precio actual es el primero que vemos
                    entryWindowEnd: Date.now() + 5000 // Ventana de 5 segundos para buscar mejor precio
                };
            }
            return null; // Aún no disparamos
        }

        // ESTADO: OPTIMIZANDO
        if (tracker.status === 'optimizing') {
            const optData = tracker.optimizationData;
            let fireSignal = false;
            let reason = '';

            // Actualizar el mejor precio visto
            if (tracker.direction === 'put' && liveCandle.close > optData.bestPriceSeen) {
                optData.bestPriceSeen = liveCandle.close;
            } else if (tracker.direction === 'call' && liveCandle.close < optData.bestPriceSeen) {
                optData.bestPriceSeen = liveCandle.close;
            }

            // Comprobar si la ventana de optimización ha terminado
            if (Date.now() >= optData.entryWindowEnd) {
                fireSignal = true;
                reason = 'Ventana de optimización cerrada';
            }

            // Si decidimos disparar la señal (por ahora, solo por tiempo)
            if (fireSignal) {
                // *** APLICAR FILTRO DE CONFLUENCIA ANTES DE DISPARAR ***
                const confluence = this._checkConfluence(tracker.direction, timeframe, strategic);
                let finalConfidence = tracker.lastSignal.confidence * confluence.factor;
                tracker.lastSignal.context.push(confluence.text);

                if (finalConfidence < 0.70) {
                    logger.warn(`OPE[${this.asset}][live_${timeframe}]: Señal ${tracker.direction.toUpperCase()} CANCELADA por falta de confluencia. Confianza final: ${finalConfidence.toFixed(2)}`);
                    delete this.liveSignalTracker[timeframe]; // Se cancela, se resetea
                    return null;
                }

                logger.warn(`OPE[${this.asset}][live_${timeframe}]: ¡EJECUTANDO! ${tracker.direction.toUpperCase()} por: ${reason}. Precio optimizado: ${optData.bestPriceSeen}.`);
                tracker.status = 'fired'; // Aplicar seguro post-señal
                
                return { 
                    decision: tracker.direction, 
                    confidence: Math.min(0.98, finalConfidence), 
                    diagnosis: { source: 'Señal Optimizada en Vivo', context: tracker.lastSignal.context } 
                };
            }
            return null; // Aún no disparamos, seguimos en la ventana de optimización
        }

        // ESTADO: DISPARADO (FIRED)
        // Si ya disparamos, no hacemos nada más hasta que la condición se rompa (lo que resetea el tracker).
        if (tracker.status === 'fired') {
            return null;
        }

        return null;
    }
    // =========================================================================
    // === FIN: LÓGICA DE ESTRATEGIA EN VIVO v5.0 ===
    // =========================================================================
}

export default ChannelWorker;
