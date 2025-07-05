import { EventEmitter } from 'events';
// Importamos nuestra nueva oficina de DNI para velas.
import { generateCandleId } from '../utils/timeUtils.js';

class CandleBuilder extends EventEmitter {
    constructor(periodInSeconds, timeframe, asset, getTime = null) {
        super();
        if (!timeframe || !asset) {
            throw new Error("CandleBuilder requiere un 'timeframe' y un 'asset' en el constructor.");
        }
        this.period = periodInSeconds;
        this.timeframe = timeframe;
        this.asset = asset; // Guardamos el activo para generar el ID.
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
            time: time,
            // ¡AQUÍ ESTÁ LA MAGIA! Le ponemos su DNI a la vela justo al nacer.
            id: generateCandleId(this.asset, this.timeframe, time * 1000) // time está en segundos, lo pasamos a ms.
        };
    }

    updateCurrentCandle(price) {
        if (!this.currentCandle) return;
        this.currentCandle.high = Math.max(this.currentCandle.high, price);
        this.currentCandle.low = Math.min(this.currentCandle.low, price);
        this.currentCandle.close = price;
        this.currentCandle.volume += 1;

        // Emitir la vela actualizada en tiempo real, asegurándonos de que lleva su DNI.
        const liveCandle = { ...this.currentCandle, timeframe: this.timeframe };
        this.emit('candleUpdated', liveCandle);
    }

    closeCurrentCandle() {
        if (this.currentCandle) {
            // La vela final también llevará su DNI, que fue asignado al crearse.
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