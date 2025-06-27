/*
================================================================================
||                                                                            ||
||           ESTADO ARQUITECTÓNICO Y PROGRESO DEL BOT FANTASMA                ||
||                            VERSIÓN 2.1 - WEBSOCKET NATIVO                  ||
================================================================================

CAMBIOS CRÍTICOS v2.1:
✅ WebSocketInterceptor nativo integrado
✅ Eliminada dependencia del analizador Python
✅ Eliminado TCP Server completamente
✅ Flujo directo: WebSocket → PipReceiver → ChannelManager
✅ Latencia reducida de ~10ms a ~1ms

ARQUITECTURA ACTUAL:
- WebSocketInterceptor → PipReceiver → ChannelManager → Operator
- 100% JavaScript/Node.js
- Sin procesos externos
- Procesamiento asíncrono de pips

--------------------------------------------------------------------------------
*/

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import logger from './utils/logger.js';
import config from './config/index.js';
import WebSocketInterceptor from './modules/WebSocketInterceptor.js';
import PipReceiver from './modules/pipReceiver.js';
import ChannelManager from './modules/ChannelManager.js';
import Operator from './modules/Operator.js';
import BrokerConnector from './connectors/BrokerConnector.js';
import TelegramConnector from './connectors/TelegramConnector.js';

puppeteer.use(StealthPlugin());

import { Worker } from 'worker_threads';

// ... (otras importaciones)

class TradingBotFantasma {
  constructor() {
    // ... (propiedades existentes)
    this.pipWorker = null;
    this.analysisWorker = null;
  }

  // ... (métodos existentes)

  async start() {
    // ... (código de inicio existente)

    try {
      await this.initializeBrowser();

      // Inicializar workers
      this.pipWorker = new Worker('./logic/pip-worker.js');
      this.analysisWorker = new Worker('./logic/analysis-worker.js');

      // Iniciar workers
      this.pipWorker.postMessage({ type: 'start' });
      this.analysisWorker.postMessage({ type: 'start' });

      // ... (código de inicialización de interceptor, etc.)

      // Escuchar pips y enviarlos al pip-worker
      this.pipReceiver.on('pip', (pipData) => {
        this.pipWorker.postMessage({ type: 'pip', data: pipData });
      });

      // Escuchar velas cerradas y enviarlas al analysis-worker
      this.pipWorker.on('message', (message) => {
        if (message.type === 'candleClosed') {
          this.analysisWorker.postMessage({ type: 'candle', data: message.data });
        }
      });

      // Escuchar señales del analysis-worker y pasarlas al Operator
      this.analysisWorker.on('message', (message) => {
        if (message.type === 'signal') {
          this.operator.handleSignal(message.data);
        }
      });

      // ... (resto del código de inicio)


  async stop() {
    logger.info('================================================');
    logger.info('⛔ DETENIENDO BOT TRADER FANTASMA v2.1');
    logger.info('================================================');
    
    try {
      // Detener componentes en orden inverso
      if (this.operator) {
        this.operator.stop();
        logger.info('✅ Operator detenido');
      }
      
      if (this.channelManager) {
        this.channelManager.stop();
        logger.info('✅ ChannelManager detenido');
      }
      
      if (this.pipReceiver) {
        this.pipReceiver.stop();
        logger.info('✅ PipReceiver detenido');
      }
      
      if (this.wsInterceptor) {
        this.wsInterceptor.stop();
        logger.info('✅ WebSocketInterceptor detenido');
      }

      if (this.browser) {
        await this.browser.close();
        logger.info('✅ Navegador cerrado');
      }
      
      logger.info('✅ Bot Fantasma v2.1 detenido correctamente');
      
    } catch (error) {
      logger.error(`Error durante el apagado: ${error.message}`);
    }
  }

  // Método de utilidad para debugging
  getSystemStatus() {
    return {
      wsInterceptor: this.wsInterceptor ? 'Activo' : 'Inactivo',
      pipReceiver: this.pipReceiver ? 'Activo' : 'Inactivo',
      channelManager: this.channelManager ? 'Activo' : 'Inactivo',
      operator: this.operator ? 'Activo' : 'Inactivo',
      browser: this.browser ? 'Activo' : 'Inactivo',
      wsStats: this.wsInterceptor ? this.wsInterceptor.getStats() : null,
      channelStatus: this.channelManager ? this.channelManager.getSystemStatus() : null
    };
  }
}

// Instancia global del bot
const bot = new TradingBotFantasma();

// Manejador mejorado de inicio
bot.start().catch(error => {
    logger.error(`Error fatal durante el arranque: ${error.stack}`);
    process.exit(1);
});

// Manejadores de señales mejorados
process.on('SIGINT', async () => {
  logger.info('\n⌨️  Interrupción detectada (Ctrl+C)');
  if (bot && bot.humanizer) {
    saveState(bot.humanizer.state); // Guardado final
    logger.info('[StateManager] Estado final del Humanizer guardado.');
  }
  await bot.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('\n🛑 Señal SIGTERM recibida');
  await bot.stop();
  process.exit(0);
});

process.on('uncaughtException', async (error) => {
  logger.error(`❌ Excepción no capturada: ${error.stack}`);
  await bot.stop();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  logger.error(`❌ Promesa rechazada no manejada: ${reason}`);
  await bot.stop();
  process.exit(1);
});

// Exportar para testing si es necesario
export default bot;