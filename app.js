/*
================================================================================
||           BOT FANTASMA v3.4 - ARQUITECTURA DE DOBLE INTERCEPCIÓN           ||
||        CON RECONSTRUCCIÓN DE VELA ACTUAL E HISTÓRICO COMPLETO            ||
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
    this.socketExporter = null;
  }

  async initializeBrowser() {
    logger.info('🔌 Conectando con el navegador existente...');
    try {
      const browserURL = `http://127.0.0.1:${config.puppeteer.debuggingPort}`;
      this.browser = await puppeteer.connect({ browserURL });

      logger.info('Buscando la página principal del broker...');
      const target = await this.browser.waitForTarget(
        t => t.type() === 'page' && t.url().includes(config.broker.url),
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
    logger.info('🚀 INICIANDO BOT TRADER FANTASMA v3.4');
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
      this.socketExporter = new SocketExporter(config.socketExportPort);

      logger.info('🔗 Conectando el flujo de datos y arrancando workers...');

      const workersReady = Promise.all([
        new Promise(resolve => this.pipWorker.on('message', (msg) => { if (msg.type === 'started') resolve(); })),
        new Promise(resolve => this.analysisWorker.on('message', (msg) => { if (msg.type === 'started') resolve(); }))
      ]);

      this.pipWorker.postMessage({ type: 'start' });
      this.analysisWorker.postMessage({ type: 'start' });
      await workersReady;
      logger.info('✅ Workers de Pips y Análisis listos.');

      // Pipeline de Pips (tiempo real)
      this.pipReceiver.on('pip', (pipData) => {
        this.pipWorker.postMessage({ type: 'pip', data: pipData });
        this.socketExporter.broadcast({ type: 'pip', data: pipData });
      });
      
      this.pipWorker.on('message', (msg) => {
        if (msg.type === 'candleClosed') {
          this.analysisWorker.postMessage({ type: 'candle', data: msg.data });
        }
      });
      
      // **MODIFICADO: Pipeline para Carga Histórica Completa**
      this.wsInterceptorAudit.on('historical-candles', (historicalData) => {
        logger.warn(`[APP] Paquete histórico para ${historicalData.asset} recibido. Distribuyendo a workers...`);
        // 1. Enviar velas completas al worker de análisis para impregnar indicadores
        this.analysisWorker.postMessage({ type: 'prime-indicators', data: historicalData });
        // 2. Enviar ticks de la vela actual al worker de pips para reconstruirla
        this.pipWorker.postMessage({ type: 'prime-current-candle', data: historicalData });
      });

      // Pipeline de Señales (resultado del análisis)
      this.analysisWorker.on('message', (msg) => { 
        if (msg.type === 'signal') {
          this.operator.executeApprovedTrade(msg.data);
        }
      });

      // ... (resto de la configuración no cambia) ...

      logger.info('🔧 Preparando la intercepción en ambas páginas...');
      await this.wsInterceptorMain.initialize(this.page, 'wss://ws2.qxbroker.com/socket.io/');
      
      this.auditPage = await this.browser.newPage();
      logger.info('✅ Página de auditoría creada.');
      
      await this.auditPage.goto(config.broker.url, { waitUntil: 'networkidle2' });
      logger.info('✅ Página de auditoría navegada.');
      
      await this.wsInterceptorAudit.initialize(this.auditPage, 'wss://ws2.qxbroker.com/socket.io/', { method: 'native' });

      this.pipReceiver.start();
      logger.info('✅ Receptor de pips iniciado.');
      
      this.socketExporter.start();
      logger.info('✅ Servidor de exportación de sockets iniciado.');

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
      if (this.socketExporter) this.socketExporter.stop();
      if (this.browser && this.browser.isConnected()) await this.browser.close();
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

process.on('SIGINT', async () => { await bot.stop(); process.exit(0); });
process.on('SIGTERM', async () => { await bot.stop(); process.exit(0); });
process.on('uncaughtException', async (error) => { logger.error(`Excepción no capturada: ${error.stack}`); await bot.stop(); process.exit(1); });
process.on('unhandledRejection', async (reason) => { logger.error(`Rechazo no manejado: ${reason}`); await bot.stop(); process.exit(1); });

export default bot;