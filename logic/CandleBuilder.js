import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

class CandleBuilder extends EventEmitter {
    constructor(periodInSeconds) {
        super();
        this.period = periodInSeconds;
        this.currentCandle = null;
    }

    addPip(pip, priming = false) {
        const { price, timestamp } = pip;
        const candleTimestamp = Math.floor(timestamp / this.period) * this.period;

        if (!this.currentCandle) {
            this.startNewCandle(price, candleTimestamp);
            return;
        }

        if (candleTimestamp > this.currentCandle.time && !priming) {
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
        // logger.debug(`Nueva vela iniciada a las ${new Date(time * 1000).toLocaleTimeString()}`);
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
            // logger.info(`Vela cerrada para ${new Date(this.currentCandle.time * 1000).toLocaleTimeString()}: O:${this.currentCandle.open}, H:${this.currentCandle.high}, L:${this.currentCandle.low}, C:${this.currentCandle.close}`);
            this.emit('candleClosed', this.currentCandle);
            this.currentCandle = null;
        }
    }
}

export default CandleBuilder;