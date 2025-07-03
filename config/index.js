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
 * @property {number} trading.minInvestment
 * @property {number} trading.maxInvestment
 * @property {object} telegram
 * @property {string} telegram.botToken
 * @property {string} telegram.chatId
 * @property {number} socketExportPort
 */

/**
 * Configuración centralizada de la aplicación v2.2
 * CAMBIOS: Implementado rango de inversión dinámico (min/max)
 * @type {Config}
 */
const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  // Configuración del humanizador (se mantiene tu estructura original)
  humanizer: {
    maxConsecutiveTrades: parseInt(process.env.HUMANIZER_MAX_CONSECUTIVE_TRADES, 10) || 2,
    minTradeIntervalMs: (parseInt(process.env.HUMANIZER_MIN_TRADE_INTERVAL_S, 10) || 60) * 1000,
    delay: {
      meanMs: parseInt(process.env.HUMANIZER_DELAY_MEAN_MS, 10) || 2500,
      stdDevMs: parseInt(process.env.HUMANIZER_DELAY_STDDEV_MS, 10) || 1000,
    },
  },

  // =======================================================================
  // AVISO: SECCIÓN DE TRADING ACTUALIZADA PARA INVERSIÓN DINÁMICA
  // =======================================================================
  trading: {
    // Rango de inversión para la estrategia dinámica.
    // El bot calculará el monto a invertir dentro de este rango,
    // basándose en la confianza de la señal.
    minInvestment: parseFloat(process.env.MIN_INVESTMENT) || 5,
    maxInvestment: parseFloat(process.env.MAX_INVESTMENT) || 25,
  },
  // =======================================================================

  // Configuración de Telegram (se mantiene tu estructura original)
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },

  // Configuración del Broker (se mantiene tu estructura original)
  broker: {
    url: process.env.BROKER_URL || 'https://qxbroker.com/es/trade',
    email: process.env.BROKER_EMAIL || '',
    password: process.env.BROKER_PASSWORD || '',
  },

  // Configuración de Puppeteer (se mantiene tu estructura original)
  puppeteer: {
    debuggingPort: parseInt(process.env.PUPPETEER_DEBUGGING_PORT, 10) || 9222,
  },

  // =======================================================================
  // CAMBIO: Puerto actualizado para prueba de conexión del visualizador
  // =======================================================================
  socketExportPort: parseInt(process.env.SOCKET_EXPORT_PORT, 10) || 3355,
  // =======================================================================


  // Configuración del Harvester (se mantiene tu estructura original)
  harvester: {
    host: process.env.HARVESTER_HOST || '127.0.0.1',
    port: parseInt(process.env.HARVESTER_PORT, 10) || 8765,
  },
};

export default config;