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

puppeteer.use(StealthPlugin());

class TradingBotFantasma {
  constructor() {
    this.browser = null;
    this.page = null;
    this.auditPage = null;
    this.wsInterceptorMain = null;
    this.wsInterceptorAudit = null;
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

      logger.info('🔗 Conectando el flujo de datos...');
      this.pipReceiver.on('pip', (pipData) => { this.pipWorker.postMessage({ type: 'pip', data: pipData }); });
      this.pipWorker.on('message', (msg) => { if (msg.type === 'candleClosed') this.analysisWorker.postMessage({ type: 'candle', data: msg.data }); });
      this.analysisWorker.on('message', (msg) => { if (msg.type === 'signal') this.operator.executeApprovedTrade(msg.data); });

      // --- FLUJO DE INICIALIZACIÓN CORRECTO ---
      logger.info('🔧 Preparando la intercepción en ambas páginas...');

      // 1. Crear la página de auditoría en blanco
      this.auditPage = await this.browser.newPage();

      // 2. Instalar AMBOS interceptores ANTES de recargar/navegar
      await this.wsInterceptorMain.initialize(this.page, 'wss://ws.qxbroker.com/socket.io/');
      await this.wsInterceptorAudit.initialize(this.auditPage, 'wss://ws.qxbroker.com/socket.io/');
      logger.info('✅ Interceptores instalados y listos.');

      // 3. Recargar la página principal y navegar la de auditoría SIMULTÁNEAMENTE
      logger.info('🔄 Recargando/Navegando páginas para forzar la captura del WebSocket...');
      await Promise.all([
        this.page.reload({ waitUntil: 'networkidle2' }),
        this.auditPage.goto(config.broker.url, { waitUntil: 'networkidle2' })
      ]);
      logger.info('✅ Ambas páginas cargadas con la intercepción activa.');

      // 4. Iniciar el receptor de pips
      this.pipReceiver.start();

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
