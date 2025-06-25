import logger from '../utils/logger.js';
import { getCandleStartTimestamp, TIMEFRAMES } from '../utils/timeUtils.js';

class CandleBuilder {
  constructor(onCandleClosed) {
    this.activeCandles = new Map();
    this.onCandleClosed = onCandleClosed;
  }

  addPip(pipData) {
    const { raw_asset, pip, pip_timestamp_ms } = pipData;
    this.checkForClosedCandles(pip_timestamp_ms);

    if (!this.activeCandles.has(raw_asset)) {
      this.activeCandles.set(raw_asset, new Map());
    }
    const assetCandles = this.activeCandles.get(raw_asset);

    for (const [timeframe, durationMs] of Object.entries(TIMEFRAMES)) {
      const candleStart = getCandleStartTimestamp(pip_timestamp_ms, durationMs);
      
      if (!assetCandles.has(timeframe)) {
        const newCandle = {
          open: pip,
          high: pip,
          low: pip,
          close: pip,
          start: candleStart,
          end: candleStart + durationMs,
          asset: raw_asset,
          timeframe: timeframe,
          volume: 1
        };
        assetCandles.set(timeframe, newCandle);
        logger.debug(`[${raw_asset}|${timeframe}] Nueva vela creada. Open: ${pip}`);
      } else {
        const candle = assetCandles.get(timeframe);
        candle.high = Math.max(candle.high, pip);
        candle.low = Math.min(candle.low, pip);
        candle.close = pip;
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