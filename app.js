/*
================================================================================
||                                                                            ||
||           ESTADO ARQUITECTÓNICO Y PROGRESO DEL BOT FANTASMA                ||
||                            VERSIÓN 2.0                                     ||
================================================================================

ACTUALIZACIÓN v2.0 - SISTEMA DE CANALIZACIÓN BASE
--------------------------------------------------------------------------------

CAMBIOS IMPLEMENTADOS:
✅ ChannelManager: Coordinador central de canales
✅ TradingChannel: Pipeline completo por activo  
✅ Arquitectura preparada para 10 canales paralelos
✅ Métricas detalladas por activo
✅ Modo compatibilidad (1 canal) y multi-canal (N canales)

ARQUITECTURA ACTUAL:
- PipReceiver → ChannelManager → TradingChannel(es) → Operator
- Cada canal tiene su propio: IndicatorEngine + Humanizer
- Estado completamente independiente por activo
- Telemetría granular por canal

MODO DE OPERACIÓN:
- Por defecto: COMPATIBILIDAD (1 canal global procesa todo)
- Multi-canal: channelManager.setMultiChannelMode(true)

PRÓXIMAS FASES:
- v2.1: Activación de 2-3 canales reales
- v2.2: Worker Threads por canal
- v2.3: Gestión de capital avanzada
- v3.0: 10 canales con ML por activo

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
ESTADO ACTUAL (v2.0 - ARQUITECTURA BASE MULTI-CANAL)
--------------------------------------------------------------------------------

El bot es funcional con arquitectura multi-canal en modo compatibilidad.

--- CAPA 1: Recolección y Procesamiento de Datos ---
* ✅ Conexión Robusta y Procesamiento de Flujo de Datos.
* ✅ Constructor de Velas Multi-Activo.
* ✅ ChannelManager distribuye pips por activo.
* ✅ Arquitectura lista para canalización paralela.

--- CAPA 2: Análisis e Inteligencia de Señales ---
* ✅ Motor de Indicadores por Canal (instancia independiente).
* ✅ Humanizer por Canal (reglas independientes).
* ✅ TradingChannel encapsula el pipeline completo.
* ⏳ Análisis en Paralelo real (próxima versión).

--- CAPA 3: Ejecución y Gestión de Capital ---
* ✅ Operator escucha múltiples canales.
* ✅ Conector de Bróker Funcional.
* ✅ Señales incluyen contexto del canal.
* ❌ Gestión de Capital Avanzada (próxima versión).

--- CAPA 4: Monitoreo y Operación ---
* ✅ Control del Navegador y Telemetría por Telegram.
* ✅ Métricas detalladas por activo/canal.
* ✅ Reportes periódicos del sistema multi-canal.
* ❌ Dashboard visual (próxima versión).

*/

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import logger from './utils/logger.js';
import config from '../config/index.js';
import PipReceiver from './modules/pipReceiver.js';
import ChannelManager from './modules/ChannelManager.js';
import Operator from './modules/Operator.js';
import BrokerConnector from './connectors/BrokerConnector.js';
import TelegramConnector from './connectors/TelegramConnector.js';

puppeteer.use(StealthPlugin());

class TradingBotFantasma {
  constructor() {
    this.browser = null;
    this.page = null;
    this.pipReceiver = null;
    this.channelManager = null; // NUEVO: Reemplaza indicatorEngine y humanizer
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
    logger.info('🚀 INICIANDO BOT TRADER FANTASMA v2.0 (Arquitectura Multi-Canal)');
    logger.info(`Entorno: ${config.nodeEnv}`);
    logger.info('================================================');

    await this.initializeBrowser();

    // Inicializar componentes base
    this.pipReceiver = new PipReceiver();
    this.channelManager = new ChannelManager(); // NUEVO: Sistema de canalización
    this.brokerConnector = new BrokerConnector(this.page);
    this.telegramConnector = new TelegramConnector();
    this.operator = new Operator(this.brokerConnector, this.telegramConnector);
    
    // Conectar el flujo: PipReceiver → ChannelManager → Operator
    this.pipReceiver.start();
    this.channelManager.start(this.pipReceiver); // El ChannelManager se suscribe al PipReceiver
    this.operator.start(this.channelManager); // El Operator escucha al ChannelManager

    logger.info('Navegando a la página del bróker para activar la intercepción...');
    await this.page.goto('https://qxbroker.com/es/trade', { waitUntil: 'networkidle2' });
    
    logger.warn('*** ¡BOT FANTASMA v2.0 TOTALMENTE OPERATIVO! ***');
    logger.info('🎯 Arquitectura Multi-Canal activada en modo compatibilidad');
    logger.info('📊 Para activar multi-canal real: channelManager.setMultiChannelMode(true)');
  }

  async stop() {
    logger.info('================================================');
    logger.info('⛔ DETENIENDO BOT TRADER FANTASMA v2.0');
    logger.info('================================================');
    
    if (this.operator) this.operator.stop();
    if (this.channelManager) this.channelManager.stop(); // Detiene todos los canales
    if (this.pipReceiver) this.pipReceiver.stop();

    if (this.browser) {
      await this.browser.close();
    }
    
    logger.info('✅ Bot Fantasma v2.0 detenido correctamente');
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