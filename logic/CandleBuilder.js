import logger from '../utils/logger.js';
import { getCandleStartTimestamp, TIMEFRAMES } from '../utils/timeUtils.js';

class CandleBuilder {
  constructor(onCandleClosed) {
    this.activeCandles = new Map();
    this.onCandleClosed = onCandleClosed;
  }

  addPip(pipData) {
    const { rawAsset, price, timestamp } = pipData;
    this.checkForClosedCandles(timestamp);

    if (!this.activeCandles.has(rawAsset)) {
      this.activeCandles.set(rawAsset, new Map());
    }
    const assetCandles = this.activeCandles.get(rawAsset);

    for (const [timeframe, durationMs] of Object.entries(TIMEFRAMES)) {
      const candleStart = getCandleStartTimestamp(timestamp, durationMs);
      
      if (!assetCandles.has(timeframe)) {
        const newCandle = {
          open: price,
          high: price,
          low: price,
          close: price,
          start: candleStart,
          end: candleStart + durationMs,
          asset: rawAsset,
          timeframe: timeframe,
          volume: 1
        };
        assetCandles.set(timeframe, newCandle);
        logger.debug(`[${rawAsset}|${timeframe}] Nueva vela creada. Open: ${price}`);
      } else {
        const candle = assetCandles.get(timeframe);
        candle.high = Math.max(candle.high, price);
        candle.low = Math.min(candle.low, price);
        candle.close = price;
        candle.volume += 1;
      }
    }
  }

  checkForClosedCandles(currentTimestamp) {
    for (const [asset, assetCandles] of this.activeCandles.entries()) {
      for (const [timeframe, candle] of assetCandles.entries()) {
        if (currentTimestamp >= candle.end) {
          logger.info(`[${asset}|${timeframe}] Vela cerrada. OHLC: ${candle.open}/${candle.high}/${candle.low}/${candle.close}`);
          this.onCandleClosed(candle);
          assetCandles.delete(timeframe);
        }
      }
    }
  }
}

export default CandleBuilder;