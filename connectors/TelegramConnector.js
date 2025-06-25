import TelegramBot from 'node-telegram-bot-api';
import logger from '../utils/logger.js';
import config from '../config/index.js';

class TelegramConnector {
  constructor() {
    this.token = config.telegram.botToken;
    this.chatId = config.telegram.chatId;
    this.bot = null;

    if (this.token && this.chatId && this.token !== 'TU_TOKEN_SECRETO_AQUI') {
      this.bot = new TelegramBot(this.token);
      logger.info('TelegramConnector: Activado y listo para enviar notificaciones.');
    } else {
      logger.warn('TelegramConnector: Token o Chat ID no configurados. Las notificaciones estarán desactivadas.');
    }
  }

  async sendMessage(message, isCritical = false) {
    if (!this.bot) {
      logger.info(`[TELEGRAM PREVIEW]: ${message}`);
      return;
    }

    const finalMessage = isCritical ? `🚨 **ALERTA CRÍTICA** 🚨\n\n${message}` : message;

    try {
      await this.bot.sendMessage(this.chatId, finalMessage, { parse_mode: 'Markdown' });
      logger.info('Notificación enviada a Telegram exitosamente.');
    } catch (error) {
      logger.error(`TelegramConnector: Fallo al enviar mensaje: ${error.message}`);
    }
  }
}

export default TelegramConnector;