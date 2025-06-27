import dotenv from 'dotenv';

dotenv.config();

/**
 * @typedef {Object} Config
 * @property {string} nodeEnv
 * @property {string} logLevel
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
 * Configuración centralizada de la aplicación v2.1
 * CAMBIOS: Eliminadas configuraciones TCP (tcpHost, tcpPort)
 * @type {Config}
 */
const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // Configuración del humanizador
  humanizer: {
    maxConsecutiveTrades: parseInt(process.env.HUMANIZER_MAX_CONSECUTIVE_TRADES, 10) || 2,
    minTradeIntervalMs: (parseInt(process.env.HUMANIZER_MIN_TRADE_INTERVAL_S, 10) || 60) * 1000,
    delay: {
      meanMs: parseInt(process.env.HUMANIZER_DELAY_MEAN_MS, 10) || 2500,
      stdDevMs: parseInt(process.env.HUMANIZER_DELAY_STDDEV_MS, 10) || 1000,
    },
  },

  // Configuración de trading
  trading: {
    baseStake: parseInt(process.env.TRADING_BASE_STAKE, 10) || 1,
  },

  // Configuración de Telegram
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },

  // NUEVO: Configuración del Broker
  broker: {
    url: process.env.BROKER_URL || 'https://qxbroker.com/es/trade',
    email: process.env.BROKER_EMAIL,
    password: process.env.BROKER_PASSWORD,
  }
};

export default config;