import dotenv from 'dotenv';

dotenv.config();

/**
 * @typedef {Object} Config
 * @property {string} nodeEnv
 * @property {string} logLevel
 * @property {string} tcpHost
 * @property {number} tcpPort
 * @property {object} humanizer
 * @property {number} humanizer.maxConsecutiveTrades
 * @property {number} humanizer.minTradeIntervalMs
 * @property {object} trading
 * @property {number} trading.baseStake
 * @property {object} telegram
 * @property {string} telegram.botToken
 * @property {string} telegram.chatId
 */

/**
 * Configuración centralizada de la aplicación.
 * @type {Config}
 */
const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  tcpHost: process.env.TCP_HOST || '127.0.0.1',
  tcpPort: parseInt(process.env.TCP_PORT, 10) || 5000,
  
  humanizer: {
    maxConsecutiveTrades: parseInt(process.env.HUMANIZER_MAX_CONSECUTIVE_TRADES, 10) || 2,
    minTradeIntervalMs: (parseInt(process.env.HUMANIZER_MIN_TRADE_INTERVAL_S, 10) || 60) * 1000,
  },

  trading: {
    baseStake: parseInt(process.env.TRADING_BASE_STAKE, 10) || 1,
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  }
};

export default config;