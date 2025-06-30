/*
================================================================================
||           BOT FANTASMA v4.0 - ARQUITECTURA HÍBRIDA (CEREBRO & BRAZO)        ||
================================================================================
* CEREBRO (Node.js): Análisis, Lógica de Trading, Ejecución de Órdenes.
* OÍDOS (harvester.py): Captura de datos 24/7 vía Playwright.
* BRAZO (Node.js): Inyección de trades vía Puppeteer.
*/

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import logger from './utils/logger.js';
import config from './config/index.js';
import BrokerConnector from './connectors/BrokerConnector.js';
import TelegramConnector from './connectors/TelegramConnector.js';
<<<<<<< HEAD
import TCPConnector from './connectors/TCPConnector.js';
=======
import TCPConnector from './connectors/TCPConnector.js'; // NUEVO
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
import { Worker } from 'worker_threads';
import SocketExporter from './modules/SocketExporter.js';
import Operator from './modules/Operator.js';
import { logEmitter } from './utils/logger.js';
<<<<<<< HEAD
import WebSocketInjector from './modules/WebSocketInterceptor.js';
import Humanizer from './modules/Humanizer.js';
=======
import WebSocketInterceptor from './modules/WebSocketInterceptor.js';

>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71

puppeteer.use(StealthPlugin());

class TradingBotFantasmaV4 {
  constructor() {
    this.browser = null;
<<<<<<< HEAD
    this.page = null;
    this.brokerConnector = null;
    this.tcpConnector = null;      // El Oído, escucha al Harvester.
    this.wsInjector = null;        // El Brazo, inyecta órdenes.
    this.humanizer = null;         // El Cerebro Estratégico.
  }

  async initializeBrowser() {
    logger.info('🔌 Conectando con el navegador...');
    try {
      const browserURL = `http://127.0.0.1:${config.puppeteer.debuggingPort}`;
      this.browser = await puppeteer.connect({ browserURL });
=======
    this.page = null; // Página para operar
    this.wsInterceptorMain = null;
    this.tcpConnector = null; // Reemplaza al interceptor de auditoría
  }

  async initializeBrowser() {
    logger.info('🔌 Conectando con el navegador para OPERACIONES...');
    try {
      const browserURL = `http://127.0.0.1:${config.puppeteer.debuggingPort}`;
      this.browser = await puppeteer.connect({ browserURL });
      
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
      const pages = await this.browser.pages();
      this.page = pages.find(p => p.url().includes(config.broker.url));

      if (!this.page) {
<<<<<<< HEAD
        logger.warn(`No se encontró página de trading. Usando la primera disponible.`);
        this.page = pages[0];
      }
      logger.info(`✅ Página de operaciones lista: ${this.page.url()}`);
=======
        logger.warn(`No se encontró página de trading. Usando la primera página disponible: ${pages[0].url()}`);
        this.page = pages[0];
      }
      logger.info(`✅ Conectado. Página de operaciones: ${this.page.url()}`);
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
    } catch (error) {
      logger.error(`❌ Error al conectar con el navegador: ${error.stack}`);
      throw error;
    }
  }

  async start() {
    logger.info('================================================');
    logger.info('🚀 INICIANDO BOT TRADER FANTASMA v4.0 - HÍBRIDO');
    logger.info('================================================');

    try {
      await this.initializeBrowser();

      logger.info('🏗️  Construyendo la arquitectura de componentes...');
<<<<<<< HEAD
      this.wsInjector = new WebSocketInjector('main');
      await this.wsInjector.initialize(this.page); // Prepara el brazo para operar

      this.brokerConnector = new BrokerConnector(this.page); // Ya no necesita el inyector en el constructor
      this.telegramConnector = new TelegramConnector();
      this.operator = new Operator(this.brokerConnector, this.telegramConnector);
      this.humanizer = new Humanizer(); // ¡AQUÍ ESTÁ!
      this.pipWorker = new Worker('./logic/pip-worker.js');
      this.analysisWorker = new Worker('./logic/analysis-worker.js');
      this.socketExporter = new SocketExporter(config.socketExportPort);
      this.tcpConnector = new TCPConnector(config.harvester.port, config.harvester.host);
=======
      this.wsInterceptorMain = new WebSocketInterceptor('main'); // Para inyectar trades
      this.brokerConnector = new BrokerConnector(this.page, this.wsInterceptorMain);
      this.telegramConnector = new TelegramConnector();
      this.operator = new Operator(this.brokerConnector, this.telegramConnector);
      this.pipWorker = new Worker('./logic/pip-worker.js');
      this.analysisWorker = new Worker('./logic/analysis-worker.js');
      this.socketExporter = new SocketExporter(config.socketExportPort);
      this.tcpConnector = new TCPConnector(); // Nuestro nuevo oído
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71

      logger.info('🔗 Conectando el flujo de datos...');
      
      const workersReady = Promise.all([
        new Promise(resolve => this.pipWorker.on('message', (msg) => { if (msg.type === 'started') resolve(); })),
        new Promise(resolve => this.analysisWorker.on('message', (msg) => { if (msg.type === 'started') resolve(); }))
      ]);
      this.pipWorker.postMessage({ type: 'start' });
      this.analysisWorker.postMessage({ type: 'start' });
      await workersReady;
      logger.info('✅ Workers de Pips y Análisis listos.');

<<<<<<< HEAD
      // Conectar la salida del TCP Connector (Oído) a los workers
=======
      // Conectar la salida del TCP Connector a los workers
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
      this.tcpConnector.on('pip', (payload) => {
        this.pipWorker.postMessage({ type: 'pip', data: payload });
        this.socketExporter.broadcast({ type: 'pip', data: payload });
      });

      this.tcpConnector.on('historical-candles', (payload) => {
<<<<<<< HEAD
        logger.warn(`[APP] Datos históricos para ${payload.asset} (${payload.timeframe}s) recibidos. Enviando a workers...`);
        this.analysisWorker.postMessage({ type: 'prime-indicators', data: payload });
      });

      // Flujo de lógica de trading (no cambia)
=======
        logger.warn(`[TCP] Datos históricos para ${payload.asset} recibidos del Harvester.`);
        this.analysisWorker.postMessage({ type: 'prime-indicators', data: payload });
        this.pipWorker.postMessage({ type: 'prime-current-candle', data: payload });
      });

      // El resto del flujo de datos no cambia
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
      this.pipWorker.on('message', (msg) => {
        if (msg.type === 'candleClosed') {
          this.analysisWorker.postMessage({ type: 'candle', data: msg.data });
        }
      });
      
      this.analysisWorker.on('message', (msg) => { 
<<<<<<< HEAD
        if (msg.type === 'signal') this.humanizer.analyzeSignal(msg.data);
      });

      this.humanizer.on('decisionFinal', (decision) => {
        if (decision.approved) {
          this.operator.executeApprovedTrade(decision.signal);
        }
      });
=======
        if (msg.type === 'signal') this.operator.executeApprovedTrade(msg.data);
      });
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
      
      this.operator.on('tradeExecuted', (tradeData) => {
        this.socketExporter.broadcast({ type: 'trade', data: tradeData });
      });

      logEmitter.on('log', (logData) => {
        if (['warn', 'error'].includes(logData.level)) {
            this.socketExporter.broadcast({ type: 'log', data: logData });
        }
      });

      // Inicializar los componentes de red
      this.socketExporter.start();
<<<<<<< HEAD
      this.tcpConnector.connect(); // Inicia la conexión con el Harvester

      logger.info('✅ Arquitectura híbrida iniciada con éxito.');
      logger.info(`👂 Escuchando datos del Harvester en ${config.harvester.host}:${config.harvester.port}...`);
=======
      await this.wsInterceptorMain.initialize(this.page, 'wss://ws2.qxbroker.com/socket.io/');
      this.tcpConnector.connect();

      logger.info('✅ Arquitectura híbrida iniciada con éxito.');
      logger.info('👂 Escuchando datos del Harvester a través de TCP...');
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
      logger.info('💪 Listo para ejecutar operaciones...');


    } catch (error) {
      logger.error(`❌ Error fatal durante el arranque del bot: ${error.stack}`);
      await this.stop();
      process.exit(1);
    }
  }

  async stop() {
    logger.info('================================================');
    logger.info('⛔ DETENIENDO BOT TRADER FANTASMA v4.0');
    logger.info('================================================');
    try {
      if (this.operator) this.operator.stop();
      if (this.pipWorker) await this.pipWorker.terminate();
      if (this.analysisWorker) await this.analysisWorker.terminate();
      if (this.socketExporter) this.socketExporter.stop();
<<<<<<< HEAD
      if (this.wsInjector) this.wsInjector.stop();
=======
      if (this.wsInterceptorMain) this.wsInterceptorMain.stop();
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
      if (this.browser && this.browser.isConnected()) await this.browser.disconnect();
      logger.info('✅ Bot Fantasma detenido correctamente');
    } catch (error) {
      logger.error(`Error durante el apagado: ${error.message}`);
    }
  }
}

const bot = new TradingBotFantasmaV4();

bot.start().catch((error) => {
  logger.error(`Error fatal en la ejecución: ${error.stack}`);
  process.exit(1);
});

process.on('SIGINT', async () => { await bot.stop(); process.exit(0); });
process.on('SIGTERM', async () => { await bot.stop(); process.exit(0); });
process.on('uncaughtException', async (error) => { logger.error(`Excepción no capturada: ${error.stack}`); await bot.stop(); process.exit(1); });
process.on('unhandledRejection', async (reason) => { logger.error(`Rechazo no manejado: ${reason}`); await bot.stop(); process.exit(1); });

export default bot;