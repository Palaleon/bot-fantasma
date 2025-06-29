/*
================================================================================
||           BOT FANTASMA v3.2 - ARQUITECTURA DE DOBLE INTERCEPCIÓN           ||
================================================================================
*/

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import logger from './utils/logger.js';
import config from './config/index.js';
import WebSocketInterceptor from './modules/WebSocketInterceptor.js';
import PipReceiver from './modules/pipReceiver.js';
import Operator from './modules/Operator.js';
import BrokerConnector from './connectors/BrokerConnector.js';
import TelegramConnector from './connectors/TelegramConnector.js';
import { Worker } from 'worker_threads';
import SocketExporter from './modules/SocketExporter.js';
import { logEmitter } from './utils/logger.js';

puppeteer.use(StealthPlugin());

class TradingBotFantasma {
  constructor() {
    this.browser = null;
    this.page = null;
    this.auditPage = null;
    this.wsInterceptorMain = null;
    this.wsInterceptorAudit = null;
    this.socketExporter = null; // Nuevo: Servidor de exportación de sockets
    // ... el resto de las propiedades
  }

  async initializeBrowser() {
    logger.info('🔌 Conectando con el navegador existente...');
    try {
      const browserURL = `http://127.0.0.1:${config.puppeteer.debuggingPort}`;
      this.browser = await puppeteer.connect({ browserURL });

      logger.info('Buscando la página principal del broker...');
      const target = await this.browser.waitForTarget(
        t => t.type() === 'page' && t.url() !== 'about:blank',
        { timeout: 15000 }
      );

      if (!target) throw new Error('No se encontró la página del broker después de esperar.');
      
      this.page = await target.page();
      if (!this.page) throw new Error('No se pudo obtener el objeto de la página desde el target.');

      logger.info('✅ Conectado al navegador y a la página principal.');

    } catch (error) {
      logger.error(`❌ Error al conectar con el navegador: ${error.stack}`);
      throw error;
    }
  }

  async start() {
    logger.info('================================================');
    logger.info('🚀 INICIANDO BOT TRADER FANTASMA v3.2');
    logger.info('================================================');

    try {
      await this.initializeBrowser();

      logger.info('🏗️  Construyendo la arquitectura de componentes...');
      this.wsInterceptorMain = new WebSocketInterceptor('main');
      this.wsInterceptorAudit = new WebSocketInterceptor('audit');
      this.telegramConnector = new TelegramConnector();
      this.brokerConnector = new BrokerConnector(this.page, this.wsInterceptorMain);
      this.operator = new Operator(this.brokerConnector, this.telegramConnector);
      this.pipReceiver = new PipReceiver(this.wsInterceptorAudit);
      this.pipWorker = new Worker('./logic/pip-worker.js');
      this.analysisWorker = new Worker('./logic/analysis-worker.js');
      this.socketExporter = new SocketExporter(config.socketExportPort); // Instanciar SocketExporter

      logger.info('🔗 Conectando el flujo de datos y arrancando workers...');

      // Arrancar workers y esperar su confirmación
      const workersReady = Promise.all([
        new Promise(resolve => {
          this.pipWorker.on('message', (msg) => { if (msg.type === 'started') resolve(); });
          this.pipWorker.postMessage({ type: 'start' });
        }),
        new Promise(resolve => {
          this.analysisWorker.on('message', (msg) => { if (msg.type === 'started') resolve(); });
          this.analysisWorker.postMessage({ type: 'start' });
        })
      ]);

      await workersReady;
      logger.info('✅ Workers de Pips y Análisis listos.');

      // Configurar el pipeline de datos entre los componentes
      this.pipReceiver.on('pip', (pipData) => {
        this.pipWorker.postMessage({ type: 'pip', data: pipData });
        this.socketExporter.broadcast({ type: 'pip', data: pipData }); // Exportar pips
      });
      
      this.pipWorker.on('message', (msg) => {
        if (msg.type === 'candleClosed') {
          // logger.warn(`[DEBUG-AUDIT] app.js: Recibida vela de pip-worker. Enviando a analysis-worker...`);
          this.analysisWorker.postMessage({ type: 'candle', data: msg.data });
        }
      });

      this.analysisWorker.on('message', (msg) => { 
        if (msg.type === 'signal') {
          this.operator.executeApprovedTrade(msg.data);
        }
      });

      // Exportar logs importantes
      logEmitter.on('log', (logData) => {
        if (logData.level === 'warn' || logData.level === 'error') { // Solo logs de advertencia y error
          this.socketExporter.broadcast({ type: 'log', data: logData });
        }
      });

      // Exportar operaciones tomadas
      this.operator.on('tradeExecuted', (tradeData) => {
        this.socketExporter.broadcast({ type: 'trade', data: tradeData });
      });

      logger.info('🔧 Preparando la intercepción en ambas páginas...');

      // 1. Instalar interceptor de INYECCIÓN en la página principal.
      await this.wsInterceptorMain.initialize(this.page, 'wss://ws2.qxbroker.com/socket.io/');

      // 2. Crear una nueva página para la auditoría en el contexto existente.
      this.auditPage = await this.browser.newPage();
      logger.info('✅ Página de auditoría creada.');

      // 3. Navegar a la URL del broker. Las cookies de sesión ya están disponibles.
      await this.auditPage.goto(config.broker.url, { waitUntil: 'networkidle2' });
      logger.info('✅ Página de auditoría navegada.');

      // 4. Instalar interceptor NATIVO en la página de auditoría ya cargada.
      await this.wsInterceptorAudit.initialize(this.auditPage, 'wss://ws2.qxbroker.com/socket.io/', { method: 'native' });

      // 6. Iniciar el receptor de pips.
      this.pipReceiver.start();
      logger.info('✅ Receptor de pips iniciado y escuchando.');

      // 7. Iniciar el servidor de exportación de sockets.
      this.socketExporter.start();

      logger.info('✅ Arquitectura construida e iniciada con éxito.');

      logger.info('✅ Arquitectura construida e iniciada con éxito.');

    } catch (error) {
      logger.error(`❌ Error fatal durante el arranque del bot: ${error.stack}`);
      await this.stop();
      process.exit(1);
    }
  }

  async stop() {
    logger.info('================================================');
    logger.info('⛔ DETENIENDO BOT TRADER FANTASMA');
    logger.info('================================================');
    try {
      if (this.operator) this.operator.stop();
      if (this.pipReceiver) this.pipReceiver.stop();
      if (this.wsInterceptorMain) this.wsInterceptorMain.stop();
      if (this.wsInterceptorAudit) this.wsInterceptorAudit.stop();
      if (this.pipWorker) await this.pipWorker.terminate();
      if (this.analysisWorker) await this.analysisWorker.terminate();
      if (this.socketExporter) this.socketExporter.stop(); // Detener el exportador
      if (this.browser) await this.browser.close();
      logger.info('✅ Bot Fantasma detenido correctamente');
    } catch (error) {
      logger.error(`Error durante el apagado: ${error.message}`);
    }
  }
}

const bot = new TradingBotFantasma();

bot.start().catch((error) => {
  logger.error(`Error fatal en la ejecución: ${error.stack}`);
  process.exit(1);
});

// Manejadores de señales
process.on('SIGINT', async () => { await bot.stop(); process.exit(0); });
process.on('SIGTERM', async () => { await bot.stop(); process.exit(0); });
process.on('uncaughtException', async (error) => { logger.error(`Excepción no capturada: ${error.stack}`); await bot.stop(); process.exit(1); });
process.on('unhandledRejection', async (reason) => { logger.error(`Rechazo no manejado: ${reason}`); await bot.stop(); process.exit(1); });

export default bot;