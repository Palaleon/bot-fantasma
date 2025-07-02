import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

/**
 * 🕯️ Constructor de Velas Robusto y Etiquetado.
 * Refactorizado para ser consciente del timeframe y asegurar que no se pierdan datos.
 */
class CandleBuilder extends EventEmitter {
    /**
     * @param {number} periodInSeconds El período de la vela en segundos (e.g., 60 para 1m).
     * @param {string} timeframe El string que identifica el timeframe (e.g., '1m', '5m').
     */
    constructor(periodInSeconds, timeframe) {
        super();
        if (!timeframe) {
            throw new Error("CandleBuilder requiere un 'timeframe' en el constructor.");
        }
        this.period = periodInSeconds;
        this.timeframe = timeframe; // ✅ Almacena el timeframe
        this.currentCandle = null;
    }

    addPip(pip) {
        const { price, timestamp } = pip;
        // Normaliza el timestamp al inicio del período de la vela
        const candleTimestamp = Math.floor(timestamp / this.period) * this.period;

        if (!this.currentCandle) {
            this.startNewCandle(price, candleTimestamp);
            return;
        }

        // Si el pip pertenece a un nuevo intervalo de tiempo, cerramos la vela anterior.
        if (candleTimestamp > this.currentCandle.time) {
            this.closeCurrentCandle();
            this.startNewCandle(price, candleTimestamp);
        } else {
            this.updateCurrentCandle(price);
        }
    }

    startNewCandle(price, time) {
        this.currentCandle = {
            open: price,
            high: price,
            low: price,
            close: price,
            volume: 1,
            time: time
        };
    }

    updateCurrentCandle(price) {
        if (!this.currentCandle) return;
        this.currentCandle.high = Math.max(this.currentCandle.high, price);
        this.currentCandle.low = Math.min(this.currentCandle.low, price);
        this.currentCandle.close = price;
        this.currentCandle.volume += 1;
    }

    closeCurrentCandle() {
        if (this.currentCandle) {
            // ✅ Etiqueta la vela con su timeframe antes de emitirla
            const finalCandle = { ...this.currentCandle, timeframe: this.timeframe };
            
            // logger.info(`Vela cerrada para ${this.timeframe} @ ${new Date(finalCandle.time * 1000).toLocaleTimeString()}: C:${finalCandle.close}`);
            this.emit('candleClosed', finalCandle);
            this.currentCandle = null;
        }
    }

    /**
     * ✅ Nuevo método para forzar el cierre de la última vela.
     * Esencial para asegurar que el último dato de una serie histórica se procese.
     */
    flush() {
        this.closeCurrentCandle();
    }
}

export default CandleBuilder;