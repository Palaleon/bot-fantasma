// app.js
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import logger from './utils/logger.js';
import config from './config/index.js';
import TelegramConnector from './connectors/TelegramConnector.js';
import TCPConnector from './connectors/TCPConnector.js';
import { Worker } from 'worker_threads';
import SocketExporter from './modules/SocketExporter.js';
import Operator from './modules/Operator.js';
import { logEmitter } from './utils/logger.js';
import Humanizer from './modules/Humanizer.js';
import QXWebSocketTrader from './modules/QXWebSocketTrader.js';

puppeteer.use(StealthPlugin());

class TradingBotFantasmaV4 {
  constructor() {
    this.browser = null;
    this.page = null;
    this.webSocketTrader = null;
    this.tcpConnector = null;
    this.humanizer = null;
    this.operator = null;
    this.telegramConnector = null;
    this.pipWorker = null;
    this.analysisWorker = null;
    this.socketExporter = null;
  }

  async initializeBrowser() {
    logger.info('🔌 Conectando con el navegador...');
    try {
      const browserURL = `http://127.0.0.1:${config.puppeteer.debuggingPort}`;
      this.browser = await puppeteer.connect({ browserURL });
      const pages = await this.browser.pages();
      this.page = pages.find(p => p.url().includes(config.broker.url));

      if (!this.page) {
        logger.warn(`No se encontró página de trading. Usando la primera disponible.`);
        this.page = pages[0];
        if (!this.page) throw new Error("No se encontró ninguna página en el navegador.");
      }
      logger.info(`✅ Página de operaciones lista: ${this.page.url()}`);
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
      
      this.webSocketTrader = new QXWebSocketTrader(this.page);
      await this.webSocketTrader.setupHook();
      
      await this.page.goto('https://qxbroker.com/es/trade', { waitUntil: 'networkidle2' });
	        // =================================================================
      // ¡NUEVO! Implementando tu estrategia de recarga.
      // =================================================================
      logger.info("STRATEGY: Forzando recarga de la página para asegurar la captura del hook...");
      await this.page.reload({ waitUntil: 'networkidle2' });
      logger.info("STRATEGY: Página recargada. Dando 2 segundos para estabilizar...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      // =================================================================

      if (!(await this.webSocketTrader.isReady())) {
        throw new Error("El socket de trading no se pudo inicializar tras cargar la página.");
      }
      
	  logger.info("DEBUG: Intentando inicializar listeners del WebSocketTrader...");
      await this.webSocketTrader.initializeListeners();
	  logger.info("DEBUG: Llamada a initializeListeners completada desde app.js.");
      logger.info('✅ Conexión con WebSocket establecida y escuchando resultados.');

      this.telegramConnector = new TelegramConnector();
      this.operator = new Operator(this.webSocketTrader, this.telegramConnector);
      this.humanizer = new Humanizer(this.telegramConnector);
      this.pipWorker = new Worker('./logic/pip-worker.js');
      this.analysisWorker = new Worker('./logic/analysis-worker.js');
      this.socketExporter = new SocketExporter(config.socketExportPort);
      this.tcpConnector = new TCPConnector(config.harvester.port, config.harvester.host);

      logger.info('🔗 Conectando el flujo de datos...');
      
      const workersReady = Promise.all([
        new Promise(resolve => this.pipWorker.on('message', (msg) => { if (msg.type === 'started') resolve(); })),
        new Promise(resolve => this.analysisWorker.on('message', (msg) => { if (msg.type === 'started') resolve(); }))
      ]);
      this.pipWorker.postMessage({ type: 'start' });
      this.analysisWorker.postMessage({ type: 'start' });
      await workersReady;
      logger.info('✅ Workers de Pips y Análisis listos.');

      this.tcpConnector.on('pip', (payload) => {
        this.pipWorker.postMessage({ type: 'pip', data: payload });
        this.socketExporter.broadcast({ type: 'pip', data: payload });
      });

      this.tcpConnector.on('historical-candles', (payload) => {
        logger.warn(`[APP] Datos históricos para ${payload.asset} (${payload.timeframe}s) recibidos. Enviando a workers...`);
        this.analysisWorker.postMessage({ type: 'prime-indicators', data: payload });
      });

      this.pipWorker.on('message', (msg) => {
        if (msg.type === 'candleClosed') {
          this.analysisWorker.postMessage({ type: 'candle', data: msg.data });
        }
      });
      
      this.analysisWorker.on('message', (msg) => { 
        if (msg.type === 'signal') this.humanizer.analyzeSignal(msg.data);
      });

      this.humanizer.on('decisionFinal', (decision) => {
        if (decision.approved) {
          this.operator.executeApprovedTrade(decision.signal);
        }
      });
      
      this.operator.on('tradeCompleted', (tradeData) => {
        // ¡CONEXIÓN DE APRENDIZAJE!
        // Notificamos al Humanizer sobre el resultado para que pueda aprender.
        this.humanizer.processTradeResult(tradeData);
        
        // El resto de la lógica para este evento no cambia
        logger.info(`APP: Trade completado. Resultado: ${tradeData.isWin ? 'GANADA' : 'PERDIDA'}`);
        this.socketExporter.broadcast({ type: 'tradeResult', data: tradeData });
      });

      logEmitter.on('log', (logData) => {
        if (['warn', 'error'].includes(logData.level)) {
            this.socketExporter.broadcast({ type: 'log', data: logData });
        }
      });

      this.socketExporter.start();
      this.tcpConnector.connect();

      logger.info('✅ Arquitectura híbrida iniciada con éxito.');
      logger.info(`👂 Escuchando datos del Harvester en ${config.harvester.host}:${config.harvester.port}...`);
      logger.info('💪 Listo para ejecutar, aprender y dominar...');

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
      if (this.webSocketTrader) await this.webSocketTrader.cleanup();
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