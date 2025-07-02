// /modules/IndicatorEngine.js

// CORREGIDO: Se cambió 'hammer' por el nombre de exportación correcto 'hammerpattern'.
import { RSI, SMA, ATR, ADX, bullishengulfingpattern, bearishengulfingpattern, hammerpattern } from 'technicalindicators';
import logger from '../utils/logger.js';

class IndicatorEngine {
    constructor() {
        this.strategicTimeframes = ['1m', '5m', '10m', '15m', '30m'];
        this.tacticTimeframe = '5s';
        this.indicators = {};

        this.strategicTimeframes.forEach(tf => {
            this.indicators[tf] = {
                candles: [],
                isMature: false,
                requiredPeriod: 25,
                sma_slow_period: 25,
                sma_fast_period: 10,
                rsi_period: 14,
                atr_period: 14,
                adx_period: 14,
                effectiveness: {
                    sma_cross: { score: 0.5, total: 0 },
                    bullish_engulfing: { score: 0.5, total: 0 },
                    bearish_engulfing: { score: 0.5, total: 0 },
                    hammer: { score: 0.5, total: 0 } // La clave interna puede mantenerse por consistencia
                },
                isRecalibrating: false,
                recalibrationThreshold: 0.45,
                lastRecalibrationTime: 0
            };
        });

        this.indicators[this.tacticTimeframe] = {
            candles: [],
            isMature: false,
            requiredPeriod: 14,
            rsi_period: 14
        };

        logger.info("INDICATOR-ENGINE: Motor inicializado con v3.0 (ADX y Arsenal Chartist expandido).");
    }

    getEffectiveness(timeframe) {
        return this.indicators[timeframe]?.effectiveness || null;
    }
    
    _simulateEffectiveness(candles, fastPeriod, slowPeriod) {
        if (candles.length < Math.max(fastPeriod, slowPeriod) + 1) {
            return { score: 0.5, total: 0 };
        }

        const closes = candles.map(c => c.close);
        const simulatedTrades = [];
        const requiredSmaLength = Math.max(fastPeriod, slowPeriod);

        if (closes.length < requiredSmaLength) {
            return { score: 0.5, total: 0 };
        }

        const smaFastValues = SMA.calculate({ values: closes, period: fastPeriod });
        const smaSlowValues = SMA.calculate({ values: closes, period: slowPeriod });
        const fastSmaOffset = fastPeriod - 1;
        const slowSmaOffset = slowPeriod - 1;
        const startIndex = Math.max(fastSmaOffset, slowSmaOffset);

        for (let i = startIndex + 1; i < candles.length; i++) {
            const prevSmaFast = smaFastValues[i - 1 - fastSmaOffset];
            const prevSmaSlow = smaSlowValues[i - 1 - slowSmaOffset];
            const currentSmaFast = smaFastValues[i - fastSmaOffset];
            const currentSmaSlow = smaSlowValues[i - slowSmaOffset];

            if (prevSmaFast === undefined || prevSmaSlow === undefined || currentSmaFast === undefined || currentSmaSlow === undefined) {
                continue;
            }

            const isBullishCross = (currentSmaFast > currentSmaSlow) && (prevSmaFast <= prevSmaSlow);
            const isBearishCross = (currentSmaFast < currentSmaSlow) && (prevSmaFast >= prevSmaSlow);

            if (isBullishCross) {
                if (i + 1 < candles.length) {
                    const nextCandle = candles[i + 1];
                    const outcome = nextCandle.close > nextCandle.open;
                    simulatedTrades.push(outcome);
                }
            } else if (isBearishCross) {
                if (i + 1 < candles.length) {
                    const nextCandle = candles[i + 1];
                    const outcome = nextCandle.close < nextCandle.open;
                    simulatedTrades.push(outcome);
                }
            }
        }

        if (simulatedTrades.length === 0) {
            return { score: 0.5, total: 0 };
        }

        const successfulTrades = simulatedTrades.filter(outcome => outcome === true).length;
        return { score: successfulTrades / simulatedTrades.length, total: simulatedTrades.length };
    }

    _recalibrateParameters(timeframe) {
        const indicatorSet = this.indicators[timeframe];
        if (indicatorSet.isRecalibrating || indicatorSet.candles.length < indicatorSet.requiredPeriod + 1) return;

        logger.info(`INDICATOR-ENGINE (${timeframe}): Iniciando proceso de recalibración...`);
        indicatorSet.isRecalibrating = true;
        indicatorSet.lastRecalibrationTime = Date.now();

        const closes = indicatorSet.candles.map(c => c.close);
        let bestScore = indicatorSet.effectiveness.sma_cross.score;
        let bestFast = indicatorSet.sma_fast_period;
        let bestSlow = indicatorSet.sma_slow_period;

        for (let fast = Math.max(5, indicatorSet.sma_fast_period - 2); fast <= indicatorSet.sma_fast_period + 2; fast++) {
            for (let slow = Math.max(15, indicatorSet.sma_slow_period - 5); slow <= indicatorSet.sma_slow_period + 5; slow++) {
                if (slow <= fast) continue;

                const { score } = this._simulateEffectiveness(closes, fast, slow);
                if (score > bestScore) {
                    bestScore = score;
                    bestFast = fast;
                    bestSlow = slow;
                }
            }
        }

        if (bestFast !== indicatorSet.sma_fast_period || bestSlow !== indicatorSet.sma_slow_period) {
            indicatorSet.sma_fast_period = bestFast;
            indicatorSet.sma_slow_period = bestSlow;
            logger.warn(`INDICATOR-ENGINE (${timeframe}): Parámetros recalibrados. Nuevo SMA_Fast: ${bestFast}, SMA_Slow: ${bestSlow}. Nueva efectividad simulada: ${(bestScore * 100).toFixed(1)}%.`);
        } else {
            logger.info(`INDICATOR-ENGINE (${timeframe}): No se encontraron mejores parámetros. Manteniendo actuales.`);
        }
        indicatorSet.isRecalibrating = false;
        this.validateEffectiveness(indicatorSet.candles, timeframe);
    }
    
    validateEffectiveness(candles, timeframe) {
        const indicatorSet = this.indicators[timeframe];
        if (!indicatorSet || !indicatorSet.effectiveness || candles.length < indicatorSet.requiredPeriod + 1) return;

        const { score: smaScore, total: smaTotal } = this._simulateEffectiveness(candles, indicatorSet.sma_fast_period, indicatorSet.sma_slow_period);
        indicatorSet.effectiveness.sma_cross = { score: smaScore, total: smaTotal };

        let bullish_success = 0, bearish_success = 0, hammer_success = 0;
        let bullish_total = 0, bearish_total = 0, hammer_total = 0;

        for (let i = 1; i < candles.length - 1; i++) {
            const candle1 = candles[i - 1];
            const candle2 = candles[i];
            const nextCandle = candles[i + 1];

            const inputForEngulfing = { open: [candle1.open, candle2.open], high: [candle1.high, candle2.high], low: [candle1.low, candle2.low], close: [candle1.close, candle2.close] };
            
            const hammerLookback = 5;
            if (i < hammerLookback) continue; 

            const hammerCandles = candles.slice(i - hammerLookback, i + 1);
            const inputForHammer = {
                open: hammerCandles.map(c => c.open),
                high: hammerCandles.map(c => c.high),
                low: hammerCandles.map(c => c.low),
                close: hammerCandles.map(c => c.close)
            };

            if (bullishengulfingpattern(inputForEngulfing)) {
                bullish_total++;
                if (nextCandle.close > nextCandle.open) bullish_success++;
            }
            if (bearishengulfingpattern(inputForEngulfing)) {
                bearish_total++;
                if (nextCandle.close < nextCandle.open) bearish_success++;
            }
            // CORREGIDO: Se llama a la función con el nombre correcto 'hammerpattern'.
            if (hammerpattern(inputForHammer)) {
                hammer_total++;
                if (nextCandle.close > nextCandle.open) hammer_success++;
            }
        }
        
        indicatorSet.effectiveness.bullish_engulfing = { score: bullish_total > 0 ? bullish_success / bullish_total : 0.5, total: bullish_total };
        indicatorSet.effectiveness.bearish_engulfing = { score: bearish_total > 0 ? bearish_success / bearish_total : 0.5, total: bearish_total };
        indicatorSet.effectiveness.hammer = { score: hammer_total > 0 ? hammer_success / hammer_total : 0.5, total: hammer_total };

        logger.warn(`INDICATOR-ENGINE (${timeframe}): Validación de efectividad completada.`);
        logger.info(`  -> SMA Cross: ${(smaScore * 100).toFixed(1)}%`);
        logger.info(`  -> Bullish Engulfing: ${(indicatorSet.effectiveness.bullish_engulfing.score * 100).toFixed(1)}%`);
        logger.info(`  -> Bearish Engulfing: ${(indicatorSet.effectiveness.bearish_engulfing.score * 100).toFixed(1)}%`);
        logger.info(`  -> Hammer: ${(indicatorSet.effectiveness.hammer.score * 100).toFixed(1)}%`);

        if (smaScore < indicatorSet.recalibrationThreshold && (Date.now() - indicatorSet.lastRecalibrationTime > 3600000)) {
            this._recalibrateParameters(timeframe);
        }
    }

    _detectAndEvaluatePatterns(timeframe) {
        const indicatorSet = this.indicators[timeframe];
        if (indicatorSet.candles.length < 2) return null;

        const candle1 = indicatorSet.candles[indicatorSet.candles.length - 2];
        const candle2 = indicatorSet.candles[indicatorSet.candles.length - 1];
        
        const inputForEngulfing = { open: [candle1.open, candle2.open], high: [candle1.high, candle2.high], low: [candle1.low, candle2.low], close: [candle1.close, candle2.close] };

        const hammerLookback = 5;
        if (indicatorSet.candles.length < hammerLookback) return null;

        const hammerCandles = indicatorSet.candles.slice(-hammerLookback);
        const inputForHammer = {
            open: hammerCandles.map(c => c.open),
            high: hammerCandles.map(c => c.high),
            low: hammerCandles.map(c => c.low),
            close: hammerCandles.map(c => c.close)
        };
        
        if (bullishengulfingpattern(inputForEngulfing)) {
            return { pattern: 'BullishEngulfing', direction: 'call', confidence: indicatorSet.effectiveness.bullish_engulfing.score };
        }
        if (bearishengulfingpattern(inputForEngulfing)) {
            return { pattern: 'BearishEngulfing', direction: 'put', confidence: indicatorSet.effectiveness.bearish_engulfing.score };
        }
        // CORREGIDO: Se llama a la función con el nombre correcto 'hammerpattern'.
        if (hammerpattern(inputForHammer)) {
            return { pattern: 'Hammer', direction: 'call', confidence: indicatorSet.effectiveness.hammer.score };
        }
        return null;
    }

    prime(historicalCandles, timeframe) {
        const indicatorSet = this.indicators[timeframe];
        if (!indicatorSet) return;

        const MAX_CANDLES = 200;
        indicatorSet.candles = historicalCandles.slice(-MAX_CANDLES);

        logger.info(`INDICATOR-ENGINE (${timeframe}): Impregnado con ${indicatorSet.candles.length} velas.`);

        if (indicatorSet.candles.length >= indicatorSet.requiredPeriod) {
            indicatorSet.isMature = true;
            logger.warn(`INDICATOR-ENGINE (${timeframe}): ¡Indicadores maduros y listos para el análisis!`);
            this.validateEffectiveness(indicatorSet.candles, timeframe);
        } else {
            logger.warn(`INDICATOR-ENGINE (${timeframe}): No hay suficientes velas históricas para madurar (${indicatorSet.candles.length}/${indicatorSet.requiredPeriod}).`);
        }
    }

    update(candle) {
        const { timeframe } = candle;
        const indicatorSet = this.indicators[timeframe];
        if (!indicatorSet) return;

        indicatorSet.candles.push(candle);
        if (indicatorSet.candles.length > 200) {
            indicatorSet.candles.shift();
        }

        if (!indicatorSet.isMature) {
            if (indicatorSet.candles.length >= indicatorSet.requiredPeriod) {
                indicatorSet.isMature = true;
                logger.warn(`INDICATOR-ENGINE (${timeframe}): ¡Indicadores maduros tras actualización en tiempo real!`);
                this.validateEffectiveness(indicatorSet.candles, timeframe);
            }
        } else {
            if (indicatorSet.candles.length % 50 === 0) {
                this.validateEffectiveness(indicatorSet.candles, timeframe);
            }
        }
    }

    getIndicators() {
        const strategicValues = {};
        const chartistSignals = {};

        this.strategicTimeframes.forEach(tf => {
            const indicatorSet = this.indicators[tf];
            if (!indicatorSet.isMature) {
                strategicValues[tf] = null;
                chartistSignals[tf] = null;
            } else {
                const closes = indicatorSet.candles.map(c => c.close);
                const highs = indicatorSet.candles.map(c => c.high);
                const lows = indicatorSet.candles.map(c => c.low);
                const atrInput = { high: highs, low: lows, close: closes, period: indicatorSet.atr_period };
                const lookbackCandles = indicatorSet.candles.slice(-indicatorSet.requiredPeriod);
                
                const adxInput = { high: highs, low: lows, close: closes, period: indicatorSet.adx_period };
                const adxResult = ADX.calculate(adxInput).slice(-1)[0];

                strategicValues[tf] = {
                    sma_slow: SMA.calculate({ values: closes, period: indicatorSet.sma_slow_period }).slice(-1)[0],
                    sma_fast: SMA.calculate({ values: closes, period: indicatorSet.sma_fast_period }).slice(-1)[0],
                    rsi: RSI.calculate({ values: closes, period: indicatorSet.rsi_period }).slice(-1)[0],
                    atr: ATR.calculate(atrInput).slice(-1)[0],
                    support: Math.min(...lookbackCandles.map(c => c.low)),
                    resistance: Math.max(...lookbackCandles.map(c => c.high)),
                    adx: adxResult ? adxResult.adx : 0
                };
                chartistSignals[tf] = this._detectAndEvaluatePatterns(tf);
            }
        });

        const tacticValues = { rsi: null };
        const tacticSet = this.indicators[this.tacticTimeframe];
        if (tacticSet.isMature) {
            tacticValues.rsi = RSI.calculate({ values: tacticSet.candles.map(c => c.close), period: tacticSet.rsi_period }).slice(-1)[0];
        }

        return {
            strategic: strategicValues,
            tactic: tacticValues,
            chartist: chartistSignals
        };
    }
}

export default IndicatorEngine;