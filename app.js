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
import TradeResultManager from './modules/TradeResultManager.js';

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
	this.tradeResultManager = null;
  }

  async initializeBrowser() {
    logger.info('🚀 Iniciando navegador para login manual...');
    const braveExecutablePath = `C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`;
    const userDataDir = './bot_browser_profile'; // Directorio para el perfil del bot

    try {
      logger.info(`Lanzando Brave con perfil de usuario dedicado en: ${userDataDir}`);
      this.browser = await puppeteer.launch({
        executablePath: braveExecutablePath,
        headless: false,
        userDataDir: userDataDir, // Usar un perfil dedicado
        args: [
          '--no-first-run',
          '--no-default-browser-check',
          '--start-maximized'
        ]
      });

      this.page = (await this.browser.pages())[0] || await this.browser.newPage();
      
      logger.info(`Navegando a la página del broker: ${config.broker.url}`);
      await this.page.goto(config.broker.url, { waitUntil: 'networkidle2' });

      // Comprobar si ya se ha iniciado sesión desde el perfil persistente
      if (this.page.url().includes(config.broker.url) && !this.page.url().includes('sign-in')) {
        logger.warn('✅ Sesión ya activa en el perfil del bot. Login no fue necesario.');
        logger.info(`Página de operaciones lista: ${this.page.url()}`);
      } else {
        // Si no se ha iniciado sesión, solicitar al usuario
        logger.warn('🛑 ACCIÓN REQUERIDA: Por favor, inicie sesión en la ventana de Brave.');
        logger.warn('Una vez que haya iniciado sesión y vea la página de trading, presione la tecla ENTER en esta consola para continuar...');

        // Esperar a que el usuario presione Enter
        await new Promise(resolve => {
          process.stdin.once('data', () => {
            resolve();
          });
        });

        // Después de que el usuario presione enter, verificar que el login fue exitoso
        const pages = await this.browser.pages();
        this.page = pages.find(p => p.url().includes(config.broker.url) && !p.url().includes('sign-in'));

        if (!this.page) {
          // Si no se encuentra, puede que la página activa sea la correcta
          this.page = pages[pages.length - 1];
          if (this.page.url().includes('sign-in')) {
            throw new Error('El login manual falló o no se completó. La página sigue en el formulario de acceso.');
          }
        }
         
        logger.warn('✅ ¡Éxito! El bot continuará con la sesión iniciada manualmente.');
        logger.info(`Página de operaciones lista: ${this.page.url()}`);
      }

    } catch (error) {
      logger.error(`❌ FALLO CRÍTICO DURANTE EL INICIO DEL NAVEGADOR O LOGIN: ${error.message}`);
      logger.error('El bot no puede continuar. Terminando proceso.');
      if (this.browser) await this.browser.close();
      process.exit(1);
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

      
      // 1. Creamos todos los componentes, incluyendo nuestro nuevo "cerebro de evaluacion de resultados de trades"
      this.telegramConnector = new TelegramConnector();
      this.tradeResultManager = new TradeResultManager(); // ¡Aquí nace!
      this.operator = new Operator(this.webSocketTrader, this.telegramConnector, null, this.tradeResultManager); // Le pasamos el cerebro al Operator
      this.humanizer = new Humanizer(this.telegramConnector);
      this.pipWorker = new Worker('./logic/pip-worker.js');
      this.analysisWorker = new Worker('./logic/analysis-worker.js');
      this.socketExporter = new SocketExporter(config.socketExportPort);
      this.tcpConnector = new TCPConnector(config.harvester.port, config.harvester.host);

      logger.info('🔗 Conectando el nuevo flujo de datos inteligente...');

      // La lógica de los workers no cambia
      const workersReady = Promise.all([
        new Promise(resolve => this.pipWorker.on('message', (msg) => { if (msg.type === 'started') resolve(); })),
        new Promise(resolve => this.analysisWorker.on('message', (msg) => { if (msg.type === 'started') resolve(); }))
      ]);
      this.pipWorker.postMessage({ type: 'start' });
      this.analysisWorker.postMessage({ type: 'start' });
      await workersReady;
      logger.info('✅ Workers de Pips y Análisis listos.');
      
      // La lógica de recibir datos del Harvester tampoco cambia
      this.tcpConnector.on('pip', (payload) => {
        this.pipWorker.postMessage({ type: 'pip', data: payload });
        this.socketExporter.broadcast({ type: 'pip', data: payload });
      });
      this.tcpConnector.on('historical-candles', (payload) => {
        logger.warn(`[APP] Datos históricos para ${payload.asset} (${payload.timeframe}s) recibidos. Enviando a workers...`);
        this.analysisWorker.postMessage({ type: 'prime-indicators', data: payload });
		this.socketExporter.broadcast({ type: 'historical-candles', data: payload });
      });
      this.pipWorker.on('message', (msg) => {
        if (msg.type === 'candleClosed') {
          this.analysisWorker.postMessage({ type: 'candle', data: msg.data });
		  this.socketExporter.broadcast({ type: 'candle', data: msg.data });
        } else if (msg.type === 'liveCandleUpdate') {
          this.analysisWorker.postMessage({ type: 'liveCandle', data: msg.data });
          this.socketExporter.broadcast({ type: 'liveCandle', data: msg.data });
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

      // 2. Conectamos los "oídos" (WebSocketTrader) al "cerebro" (Manager)
      // Cuando el oído detecta una apertura, le avisa al cerebro para que mapee el ID.
      this.webSocketTrader.on('tradeOpened', ({ requestId, uniqueId }) => {
        this.tradeResultManager.mapTradeId(requestId, uniqueId);
      });

      // Cuando el oído detecta un resultado individual, se lo pasa al cerebro para que lo procese.
      this.webSocketTrader.on('individualTradeResult', (deal) => {
        this.tradeResultManager.processIndividualResult(deal);
      });

      // 3. La conexión de aprendizaje ahora escucha al "cerebro"
      // El evento 'tradeCompleted' ahora lo emite el Manager, no el Operator.
      this.tradeResultManager.on('tradeCompleted', (tradeData) => {
        // Notificamos al Humanizer para que aprenda (esto no cambia)
        this.humanizer.processTradeResult(tradeData);
        
        logger.info(`APP: Trade completado. Resultado: ${tradeData.isWin ? 'GANADA' : 'PERDIDA'}`);
        this.socketExporter.broadcast({ type: 'tradeResult', data: tradeData });

        // Recuperamos la notificación de resultado de Telegram que quitamos del Operator
        const header = tradeData.isWin ? '🎉 *¡RESULTADO EXITOSO!* 🎉' : '💔 *RESULTADO REGISTRADO* 💔';
        const resultText = tradeData.isWin ? '*VICTORIA* ✅' : '*PÉRDIDA, SEGUIMOS ANALIZANDO CHICOS - BOT FANTASMA* ❌';
        const message = `\n${header}\n\n*ID de Orden*: \`${tradeData.signal.requestId}\`\n*Resultado*: ${resultText}\n    `;
        this.telegramConnector.sendMessage(message, { parse_mode: 'Markdown' });
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