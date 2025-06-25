/*
================================================================================
||                                                                            ||
||           ESTADO ARQUITECTÓNICO Y PROGRESO DEL BOT FANTASMA                ||
||                            VERSIÓN 2.0 - CORREGIDO                         ||
================================================================================

CORRECCIONES CRÍTICAS APLICADAS:
✅ ChannelManager ahora está inicializado correctamente
✅ Import de ChannelManager agregado
✅ Workers temporalmente deshabilitados (código comentado)
✅ Flujo de datos restaurado: PipReceiver → ChannelManager → Operator
✅ Manejo de errores mejorado

ARQUITECTURA ACTUAL:
- PipReceiver → ChannelManager → TradingChannel(es) → Operator
- Modo compatibilidad por defecto (1 canal global)
- Workers deshabilitados hasta corrección completa
- Sistema funcional y estable

--------------------------------------------------------------------------------
*/

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import logger from './utils/logger.js';
import config from './config/index.js';
import PipReceiver from './modules/pipReceiver.js';
import ChannelManager from './modules/ChannelManager.js';  // ✅ IMPORT RESTAURADO
// import { Worker } from 'worker_threads';  // ❌ TEMPORALMENTE DESHABILITADO
import Operator from './modules/Operator.js';
import BrokerConnector from './connectors/BrokerConnector.js';
import TelegramConnector from './connectors/TelegramConnector.js';

puppeteer.use(StealthPlugin());

class TradingBotFantasma {
  constructor() {
    this.browser = null;
    this.page = null;
    this.pipReceiver = null;
    this.channelManager = null;
    this.operator = null;
    this.brokerConnector = null;
    this.telegramConnector = null;
    // this.channelWorkers = [];  // ❌ TEMPORALMENTE DESHABILITADO
  }

  async initializeBrowser() {
    logger.info('Lanzando navegador en modo sigiloso...');
    this.browser = await puppeteer.launch({
      headless: false,
      executablePath: 'C:\\chrome-win\\chrome.exe',
      args: ['--disable-blink-features=AutomationControlled'],
    });
    this.page = (await this.browser.pages())[0];
    await this.page.setViewport({ width: 1280, height: 720 });
    
    await this.page.exposeFunction('onWebSocketMessage', (message) => {
      this.pipReceiver.emit('websocket-message', message);
    });
    
    await this.page.evaluateOnNewDocument(() => {
        const OriginalWebSocket = window.WebSocket;
        window.WebSocket = function(...args) {
            const socketInstance = new OriginalWebSocket(...args);
            const WSS_URL_PATTERN = 'wss://qxbroker.com/socket.io/';
            if (args[0].startsWith(WSS_URL_PATTERN)) {
                console.log('¡Espía inyectado! WebSocket del bróker interceptado.');
                window.__socket = socketInstance;
                socketInstance.addEventListener('message', (event) => {
                    window.onWebSocketMessage(event.data);
                });
            }
            return socketInstance;
        };
    });
    logger.info('Navegador listo y espía preparado para inyección.');
  }

  async start() {
    logger.info('================================================');
    logger.info('🚀 INICIANDO BOT TRADER FANTASMA v2.0 (CORREGIDO)');
    logger.info(`Entorno: ${config.nodeEnv}`);
    logger.info('================================================');

    try {
      await this.initializeBrowser();

      // Inicializar componentes base
      this.pipReceiver = new PipReceiver();
      this.channelManager = new ChannelManager(); // ✅ AHORA SÍ ESTÁ INICIALIZADO

      /* ❌ WORKERS TEMPORALMENTE DESHABILITADOS - IMPLEMENTACIÓN INCORRECTA
      // Lanzar un worker por cada canal (ejemplo con 2 canales)
      this.channelWorkers = [];
      const activos = ['EURUSD', 'AUDCAD'];

      for (const activo of activos) {
        try {
          // Corrección de ruta: ./modules/ChannelWorker.js
          const worker = new Worker('./modules/ChannelWorker.js', {
            workerData: { activo }
          });
          this.channelWorkers.push(worker);
          worker.postMessage({ type: 'start' });
          logger.info(`Worker iniciado para activo: ${activo}`);
        } catch (error) {
          logger.error(`Error iniciando worker para ${activo}: ${error.message}`);
        }
      }
      */

      // Inicializar conectores
      this.brokerConnector = new BrokerConnector(this.page);
      this.telegramConnector = new TelegramConnector();
      this.operator = new Operator(this.brokerConnector, this.telegramConnector);
      
      // ✅ FLUJO CORREGIDO: PipReceiver → ChannelManager → Operator
      this.pipReceiver.start();
      this.channelManager.start(this.pipReceiver); // ✅ Ahora funciona
      this.operator.start(this.channelManager);    // ✅ Ahora funciona

      logger.info('Navegando a la página del bróker para activar la intercepción...');
      await this.page.goto('https://qxbroker.com/es/trade', { waitUntil: 'networkidle2' });
      
      logger.warn('*** ¡BOT FANTASMA v2.0 TOTALMENTE OPERATIVO! ***');
      logger.info('🎯 Arquitectura Multi-Canal activada en modo compatibilidad');
      logger.info('📊 Sistema funcionando con 1 canal global');
      logger.info('⚠️  Workers temporalmente deshabilitados (implementación en revisión)');
      
      // Exponer channelManager globalmente para debugging
      global.bot = this;
      
    } catch (error) {
      logger.error(`Error fatal durante el arranque: ${error.stack}`);
      await this.stop();
      throw error;
    }
  }

  async stop() {
    logger.info('================================================');
    logger.info('⛔ DETENIENDO BOT TRADER FANTASMA v2.0');
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

      /* ❌ WORKERS DESHABILITADOS
      if (this.channelWorkers && this.channelWorkers.length > 0) {
        for (const worker of this.channelWorkers) {
          try {
            worker.postMessage({ type: 'stop' });
            await worker.terminate();
          } catch (error) {
            logger.error(`Error deteniendo worker: ${error.message}`);
          }
        }
        logger.info('✅ Workers detenidos');
      }
      */

      if (this.browser) {
        await this.browser.close();
        logger.info('✅ Navegador cerrado');
      }
      
      logger.info('✅ Bot Fantasma v2.0 detenido correctamente');
      
    } catch (error) {
      logger.error(`Error durante el apagado: ${error.message}`);
    }
  }

  // Método de utilidad para debugging
  getSystemStatus() {
    return {
      pipReceiver: this.pipReceiver ? 'Activo' : 'Inactivo',
      channelManager: this.channelManager ? 'Activo' : 'Inactivo',
      operator: this.operator ? 'Activo' : 'Inactivo',
      browser: this.browser ? 'Activo' : 'Inactivo',
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