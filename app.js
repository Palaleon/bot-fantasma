/*
================================================================================
||                                                                            ||
||           ESTADO ARQUITECTÓNICO Y PROGRESO DEL BOT FANTASMA                ||
||                                                                            ||
================================================================================

Este documento sirve como un mapa viviente del proyecto. Detalla la visión
final del sistema en producción y el estado actual de sus capacidades.

--------------------------------------------------------------------------------
VISIÓN FINAL: BOT 100% COMPLETO (ARQUITECTURA "MULTI-CANAL")
--------------------------------------------------------------------------------

El sistema final operará como un equipo de 10 especialistas trabajando en
paralelo bajo un comando unificado.

--- CAPA 1: Recolección y Procesamiento de Datos ---
* Receptor de Flujo Masivo: Recibe y procesa pips de todos los activos del analizador.
* Canalización por Activo: Segrega cada pip en un "canal" de procesamiento aislado
    y dedicado para su activo correspondiente (EUR/USD, AUD/CAD, etc.).
* Constructor de Velas por Canal: Cada canal tiene su propio constructor de velas
    independiente para múltiples temporalidades (1m, 5m, 15m).

--- CAPA 2: Análisis e Inteligencia de Señales ---
* Análisis en Paralelo: Cada canal posee su propia instancia del IndicatorEngine y
    Humanizer, analizando los 10 activos de forma simultánea e independiente.
* Estrategias de Confluencia: El IndicatorEngine combina múltiples indicadores
    (EMA, RSI, Bollinger, etc.) para generar señales de alta probabilidad.
* Humanizer por Canal: Cada Humanizer tiene su propia memoria y aplica reglas
    de evasión avanzadas (frecuencia, repetición, diversidad, variabilidad
    de monto y timing) de forma específica para su activo.

--- CAPA 3: Ejecución y Gestión de Capital ---
* Operator Multi-Canal: Un único Operator escucha las decisiones aprobadas
    de los 10 canales y actúa sobre la primera oportunidad válida.
* Gestión de Capital Avanzada: Implementa estrategias configurables de
    Martingala (por activo o global), Stop Loss/Take Profit diario y un
    cálculo de stake dinámico basado en la confianza de la señal.

--- CAPA 4: Monitoreo y Operación ---
* Telemetría Detallada por Canal: Las notificaciones de Telegram especifican
    claramente qué activo generó una señal y su resultado.
* Dashboard de Mando y Control: Una interfaz para visualizar el estado y
    rendimiento de cada canal en tiempo real.
* Sistema de Salud y Auto-reparación: Monitorea activamente los recursos del
    sistema y puede reiniciarse de forma segura.

--------------------------------------------------------------------------------
ESTADO ACTUAL (ARQUITECTURA "MONO-CANAL")
--------------------------------------------------------------------------------

El bot es funcional, pero opera como un único pipeline secuencial.

--- CAPA 1: Recolección y Procesamiento de Datos ---
* ✅ Conexión Robusta y Procesamiento de Flujo de Datos.
* ✅ Constructor de Velas Multi-Activo (la base para la canalización existe).
* ❌ Canalización Aislada y en Paralelo: No implementada.

--- CAPA 2: Análisis e Inteligencia de Señales ---
* ✅ Motor de Indicadores (Básico): Existe un único IndicatorEngine global
    usando una estrategia simple de EMA Crossover.
* ✅ Humanizer (Básico): Existe un único Humanizer global con reglas de
    frecuencia y repetición.
* ❌ Análisis en Paralelo: No implementado.
* ❌ Instancias Dedicadas por Canal: No implementado.

--- CAPA 3: Ejecución y Gestión de Capital ---
* ✅ Operator Funcional: Implementado y operativo.
* ✅ Conector de Bróker Funcional: Implementado y operativo.
* ❌ Gestión de Capital Avanzada: No implementada (usa un stake fijo).

--- CAPA 4: Monitoreo y Operación ---
* ✅ Control del Navegador y Telemetría Básica por Telegram.
* ✅ Gestión de Configuración Externa vía .env.
* ❌ Monitoreo por Canal y Dashboard Avanzado: No implementado.
* ❌ Sistema de Salud y Auto-reparación: No implementado.

*/

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import logger from './utils/logger.js';
import config from '../config/index.js';
import PipReceiver from './modules/pipReceiver.js';
import IndicatorEngine from './modules/IndicatorEngine.js';
import Humanizer from './modules/Humanizer.js';
import Operator from './modules/Operator.js';
import BrokerConnector from './connectors/BrokerConnector.js';
import TelegramConnector from './connectors/TelegramConnector.js';

puppeteer.use(StealthPlugin());

class TradingBotFantasma {
  constructor() {
    this.browser = null;
    this.page = null;
    this.pipReceiver = null;
    this.indicatorEngine = null;
    this.humanizer = null;
    this.operator = null;
    this.brokerConnector = null;
    this.telegramConnector = null;
  }

  async initializeBrowser() {
    logger.info('Lanzando navegador en modo sigiloso...');
    this.browser = await puppeteer.launch({
      headless: false,
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
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
    logger.info('🚀 INICIANDO BOT TRADER FANTASMA v1.8 (Doc Estratégica)');
    logger.info(`Entorno: ${config.nodeEnv}`);
    logger.info('================================================');

    await this.initializeBrowser();

    this.pipReceiver = new PipReceiver();
    this.indicatorEngine = new IndicatorEngine();
    this.humanizer = new Humanizer();
    this.brokerConnector = new BrokerConnector(this.page);
    this.telegramConnector = new TelegramConnector();
    this.operator = new Operator(this.brokerConnector, this.telegramConnector);
    
    this.pipReceiver.start();
    this.indicatorEngine.start(this.pipReceiver);
    this.humanizer.start(this.indicatorEngine);
    this.operator.start(this.humanizer);

    logger.info('Navegando a la página del bróker para activar la intercepción...');
    await this.page.goto('https://qxbroker.com/es/trade', { waitUntil: 'networkidle2' });
    
    logger.warn('*** ¡BOT FANTASMA TOTALMENTE OPERATIVO CON TELEMETRÍA! ***');
  }

  async stop() {
    logger.info('================================================');
    logger.info('⛔ DETENIENDO BOT TRADER FANTASMA');
    logger.info('================================================');
    
    if (this.operator) this.operator.stop();
    if (this.humanizer) this.humanizer.stop();
    if (this.indicatorEngine) this.indicatorEngine.stop();
    if (this.pipReceiver) this.pipReceiver.stop();

    if (this.browser) {
      await this.browser.close();
    }
  }
}

const bot = new TradingBotFantasma();
bot.start().catch(error => {
    logger.error(`Error fatal durante el arranque: ${error.stack}`);
    bot.stop();
});

process.on('SIGINT', async () => {
  await bot.stop();
  process.exit(0);
});