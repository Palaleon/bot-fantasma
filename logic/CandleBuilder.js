import { EventEmitter } from 'events';

class CandleBuilder extends EventEmitter {
    constructor(periodInSeconds, timeframe, getTime = null) {
        super();
        if (!timeframe) {
            throw new Error("CandleBuilder requiere un 'timeframe' en el constructor.");
        }
        this.period = periodInSeconds;
        this.timeframe = timeframe;
        this.getTime = getTime || (() => Math.floor(Date.now() / 1000));
        this.currentCandle = null;
    }

    addPip(pip) {
        const { price, timestamp } = pip;
        const candleTimestamp = Math.floor(timestamp / this.period) * this.period;

        if (!this.currentCandle) {
            this.startNewCandle(price, candleTimestamp);
            return;
        }

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
            const finalCandle = { ...this.currentCandle, timeframe: this.timeframe };
            this.emit('candleClosed', finalCandle);
            this.currentCandle = null;
        }
    }

    flush() {
        this.closeCurrentCandle();
    }
}

export default CandleBuilder;
