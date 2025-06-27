// ============================
// HISTORIAL DE CAMBIOS (Changelog)
// ============================
//
// [FECHA_ACTUAL] - Optimizaciones del Navegador (Sesión con JEFE):
// 1. Dashboard.log():
//    - Problema: Actualización ineficiente de logs (borraba y reescribía todo).
//    - Cambio: Modificado para eliminar solo los mensajes más antiguos.
//    - Impacto: Menor carga para el navegador.
//
// 2. Dashboard.updateChart() - Límite al historial de velas:
//    - Problema: El array `this.allCandles` crecía indefinidamente.
//    - Cambio: Añadido límite `MAX_HISTORY_CANDLES` para conservar solo velas recientes.
//    - Impacto: Prevenir fuga de memoria que afectaba al gráfico.
//
// 3. Dashboard.cleanBrowserMemory():
//    - Problema: Operaciones de limpieza redundantes o agresivas.
//    - Cambio: Comentadas (desactivadas) líneas de limpieza de series de soporte/resistencia y del área de logs.
//    - Impacto: Evitar trabajo innecesario o problemático para el navegador.
//
// ============================

'use strict';

// Cargar variables de entorno
require('dotenv').config();

// Módulos nativos y externos básicos
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const readline = require('readline');
const https = require('https');
const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const { PipReceiver } = require('./PipReceiver');
const {
  saveCandlePattern,
  findSimilarPatterns,
} = require('./candleRepository'); // Path to candleRepository.js
const {
  MLModel,
  classifySubCandlePattern,
  createPatternFingerprint,
} = require('./MLModel'); // Import MLModel class and helper functions from the correct file
// ============================
// 1. CONFIGURACIÓN GLOBAL
// ============================

/*
 * HUMANIZER (Clase y módulo): Sistema avanzado de auditoría y filtro en tiempo real.
 * Propósito: Detecta manipulación, sentimiento del mercado y confiabilidad antes de cada operación.
 * Uso: SIEMPRE consulta humanizer.getDecision(signal_tecnico) antes de cada trade.
 *      - Si .operar === false → Omitir la operación, seguir el ciclo normal.
 *      - Si .sentido !== signal_tecnico → Invertir la operación.
 *      - SIEMPRE reportar diagnóstico en Telegram/logs.
 *      - TODO registro de trade debe incluir diagnóstico, sentimiento y confianza para auditoría.
 */

// --- Funciones auxiliares para HUMANIZER ---
function media(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function stdev(arr) {
  if (!arr || arr.length === 0) return 0;
  let m = media(arr);
  return Math.sqrt(
    arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length
  );
}

// --- 1. Clase HUMANIZER sofisticada ---
class Humanizer {
  constructor() {
    this.buffer = []; // Últimos 50 pips recientes
    this.sentimiento = 'neutro';
    this.confianza = 1.0;
    this.diagnostico = 'confiable';
    this.anomalia = false;
    this.lastUpdate = Date.now();
  }
  addPip(pip) {
    this.buffer.push(pip);
    if (this.buffer.length > 50) this.buffer.shift();
    this.actualizarDiagnostico();
  }
  actualizarDiagnostico() {
    const ultimos = this.buffer.slice(-12);
    if (ultimos.length < 8) {
      this.sentimiento = 'neutro';
      this.diagnostico = 'raro';
      this.confianza = 0.5;
      return;
    }
    const difs = ultimos.map((v, i, a) => (i > 0 ? v - a[i - 1] : 0)).slice(1);
    if (difs.length === 0) {
      this.sentimiento = 'neutro';
      this.diagnostico = 'datos insuficientes';
      this.confianza = 0.4;
      return;
    }
    const sum = difs.reduce((a, b) => a + b, 0);
    let reversos = 0;
    for (let i = 1; i < difs.length; i++) {
      if (
        Math.sign(difs[i]) !== Math.sign(difs[i - 1]) &&
        Math.abs(difs[i]) > 1e-7 &&
        Math.abs(difs[i - 1]) > 1e-7
      )
        reversos++;
    }
    const stdevVal = stdev(difs) || 1e-7; // Evitar división por cero si stdev es 0
    const meanVal = media(difs);
    const gaps = difs.filter((d) => Math.abs(d) > 3 * stdevVal);
    this.anomalia = gaps.length > 2 || stdevVal > 4 * Math.abs(meanVal) + 1e-7;
    if (this.anomalia) {
      this.diagnostico = 'manipulacion posible';
      this.confianza = 0.2;
      this.sentimiento = 'erratico';
      return;
    }
    if (reversos > 8) {
      this.diagnostico = 'raro';
      this.confianza = 0.3;
      this.sentimiento = 'erratico';
      return;
    }
    if (sum > stdevVal * 2) {
      this.sentimiento = 'alcista';
      this.diagnostico = 'confiable';
      this.confianza = 1.0;
      return;
    }
    if (sum < -stdevVal * 2) {
      this.sentimiento = 'bajista';
      this.diagnostico = 'confiable';
      this.confianza = 1.0;
      return;
    }
    this.sentimiento = 'neutro';
    this.diagnostico = 'confiable';
    this.confianza = 0.8;
  }
  getDecision(signal_tecnico) {
    this.actualizarDiagnostico(); // Asegurar diagnóstico actualizado
    if (this.diagnostico === 'manipulacion posible' || this.confianza < 0.4)
      return {
        operar: false,
        motivo: `mercado ${this.diagnostico}`,
        diagnostico: this.diagnostico,
        confianza: this.confianza,
        sentimiento: this.sentimiento,
        signalOriginal: signal_tecnico,
        signalFinal: null,
      };
    if (
      signal_tecnico === 'green' &&
      this.sentimiento === 'bajista' &&
      this.confianza > 0.6
    )
      // Invertir solo si hay confianza en el sentimiento contrario
      return {
        operar: true,
        sentido: 'red',
        motivo: 'sentimiento contrario (bajista vs green)',
        diagnostico: this.diagnostico,
        confianza: this.confianza,
        sentimiento: this.sentimiento,
        signalOriginal: signal_tecnico,
        signalFinal: 'red',
      };
    if (
      signal_tecnico === 'red' &&
      this.sentimiento === 'alcista' &&
      this.confianza > 0.6
    )
      // Invertir solo si hay confianza en el sentimiento contrario
      return {
        operar: true,
        sentido: 'green',
        motivo: 'sentimiento contrario (alcista vs red)',
        diagnostico: this.diagnostico,
        confianza: this.confianza,
        sentimiento: this.sentimiento,
        signalOriginal: signal_tecnico,
        signalFinal: 'green',
      };
    return {
      operar: true,
      sentido: signal_tecnico,
      motivo: 'acuerdo con sentimiento',
      diagnostico: this.diagnostico,
      confianza: this.confianza,
      sentimiento: this.sentimiento,
      signalOriginal: signal_tecnico,
      signalFinal: signal_tecnico,
    };
  }
}

// --- 2. Instanciar HUMANIZER al inicio global ---
const humanizer = new Humanizer();

const CONFIG = {
  DATA_DIR: path.join(__dirname, 'data'),
  REGISTRY_PATH: path.join(__dirname, 'data', 'registry.json'),
  USER_DATA_DIR: './user_data', // Notar: Usar nombre sin espacios
  CHARTS_LIB_NODE_PATH: path.join(
    __dirname,
    'node_modules',
    'lightweight-charts',
    'dist',
    'lightweight-charts.standalone.production.js'
  ),
  CHARTS_LIB_URL:
    'https://unpkg.com/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js',

  SELECTORS: {
    PIP_MODAL: '.modal-pair-information__body-value',
    PIP_WRAP: '.pair-information',
    STAKE_INPUT: '.input-control__input',
    BALANCE: '.usermenu__info-balance',
    GALE_MULTIPLIER: 2,
    STEALTH: true,
  },

  STRATEGY: {
    // ➡️ Ahora lee IS_DEMO (0 = real, 1 = demo) y sigue aceptando DRY_RUN=true
DRY_RUN:
  (process.env.IS_DEMO ?? process.env.DRY_RUN ?? '0')
    .toString()
    .trim()
    .match(/^(1|true)$/i) !== null,
    SAMPLE_INTERVAL_MS: process.env.SAMPLE_INTERVAL_MS
      ? parseInt(process.env.SAMPLE_INTERVAL_MS)
      : 10,
    POST_TRADE_DELAY_MS: 2500,
    BASE_STAKE: 2,
    MAX_GALE_LEVEL: 2,
    REACTION_WINDOW_MS: 10000,
    REACTION_THRESHOLD: 0.0001,
    REACTION_REVERSAL_RATIO: 0.5,
    PRICE_STRATEGY_MODE: 'compensate',
    PRICE_ADJUSTMENT_FACTOR: 0.0001,
    VELOCITY_MATCH_TOLERANCE: 0.05,
    VELOCITY_DISTANCE_THRESHOLD: 0.35,
  },

  BROWSER: {
    HEADLESS: process.env.HEADLESS === 'true',
    EXECUTABLE_PATH:
      process.env.BROWSER_EXECUTABLE || 'C:\\chrome-win\\chrome.exe',
  },

  UI: {
    MAX_LOG_LINES: 100,
    DASHBOARD_UPDATE_INTERVAL: 1000,
    ENABLE_CHARTS: true,
    CHARTS_TIMEOUT: 10000,
  },

  TCP_PORT: 5000,
};

// ============================
// 2. CLASE DE UTILIDADES (Utils)
// ============================
class Utils {
  /**
   * Retarda la ejecución durante el número de milisegundos indicado.
   * @param {number} ms - Milisegundos a esperar.
   * @returns {Promise<void>}
   */
  static delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Solicita al usuario presionar ENTER para continuar.
   * @param {string} msg - Mensaje a mostrar.
   * @returns {Promise<void>}
   */
  static promptEnter(msg) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question(`${msg}\n`, () => {
        rl.close();
        resolve();
      });
    });
  }

  /**
   * Verifica la existencia de un directorio o lo crea si no existe.
   * @param {string} dirPath - Ruta del directorio.
   * @returns {Promise<void>}
   */
  static async ensureDir(dirPath) {
    try {
      await fsPromises.access(dirPath, fs.constants.F_OK);
    } catch (err) {
      await fsPromises.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Formatea un número a un porcentaje con precisión dada.
   * @param {number} value - Valor numérico.
   * @param {number} [precision=2] - Precisión opcional.
   * @returns {string} - Representación en porcentaje.
   */
  static formatPercent(value, precision = 2) {
    return `${(value * 100).toFixed(precision)}%`;
  }

  /**
   * Calcula estadísticas básicas de un arreglo de números.
   * @param {number[]} values - Arreglo de números.
   * @returns {Object} Objeto con min, max, promedio y rango.
   */
  static calculateStats(values) {
    if (!values.length) return { min: 0, max: 0, avg: 0, range: 0 };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    return { min, max, avg, range: max - min || 0.0001 };
  }

  /**
   * Descarga un archivo desde una URL y lo guarda en el destino indicado.
   * @param {string} url - La URL del archivo.
   * @param {string} destination - Ruta de destino para guardar el archivo.
   * @returns {Promise<void>}
   */
  static downloadFile(url, destination) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destination);
      https
        .get(url, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`Error en descarga: ${response.statusCode}`));
            return;
          }
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            console.log(`Archivo descargado en ${destination}`);
            resolve();
          });
        })
        .on('error', (err) => {
          fs.unlink(destination, () => {});
          reject(err);
        });
    });
  }

  /**
   * Verifica la disponibilidad de la biblioteca de gráficos y, si no está instalada, la descarga.
   * @param {Object} config - Objeto de configuración.
   * @returns {Promise<boolean>} - Verdadero si la biblioteca está lista.
   */
  static async ensureChartsLibrary(config) {
    try {
      await fsPromises.access(config.CHARTS_LIB_NODE_PATH, fs.constants.F_OK);
      console.log('Biblioteca de gráficos encontrada en node_modules.');
      return true;
    } catch (err) {
      console.log(
        'Biblioteca de gráficos no encontrada en node_modules. Descargando desde CDN...'
      );
      try {
        await Utils.downloadFile(
          config.CHARTS_LIB_URL,
          config.CHARTS_LIB_NODE_PATH
        );
        return true;
      } catch (downloadErr) {
        console.error(
          'Error al descargar la biblioteca de gráficos:',
          downloadErr
        );
        return false;
      }
    }
  }
}

// ============================
// Exportación para uso interno
// ============================
// En el contexto de un único archivo, se pueden colocar estas constantes y clases en la parte superior.
// Más adelante se agregarán las clases adicionales (DataManager, PipReceiver, etc.)
// Puedes utilizar CONFIG y Utils en las siguientes arepas.

// ============================
// AREPA 2: DataManager, ChartContext y ReactionStatsManager
// ============================

// DataManager: Registro y manejo de trades en un archivo JSON.
class DataManager {
  constructor(config) {
    this.config = config;
    this.registry = [];
    this.ensureInitialized();
  }

  // Inicializa el registro leyendo el archivo si existe o creando uno nuevo.
  async ensureInitialized() {
    await Utils.ensureDir(this.config.DATA_DIR);
    try {
      const data = await fsPromises.readFile(this.config.REGISTRY_PATH, 'utf8');
      this.registry = JSON.parse(data);
    } catch (err) {
      this.registry = [];
    }
  }

  // Registra un trade (añadiéndole la fecha en formato ISO) y lo guarda en archivo.
  async recordTrade(trade) {
    this.registry.push({ ...trade, timestamp: new Date().toISOString() });
    try {
      await fsPromises.writeFile(
        this.config.REGISTRY_PATH,
        JSON.stringify(this.registry, null, 2)
      );
    } catch (err) {
      console.error('Error guardando registro:', err);
    }
  }

  // Calcula estadísticas históricas de los trades.
  getHistoricalStats() {
    const totalTrades = this.registry.length;
    if (!totalTrades) return { winRate: 0, avgProfit: 0, totalTrades: 0 };
    const wins = this.registry.filter((t) => t.result === 'win').length;
    const profits = this.registry.map((t) => t.profit || 0);
    const totalProfit = profits.reduce((a, b) => a + b, 0);
    return {
      winRate: wins / totalTrades,
      avgProfit: totalProfit / totalTrades,
      totalTrades,
    };
  }
}

// ChartContext: Manejo de velas para análisis técnico
class ChartContext {
  /**
   * @param {number} initialWindow - Número inicial de velas a almacenar (por defecto 10).
   * @param {number} maxWindow - Número máximo de velas (por defecto 40).
   */
  constructor(initialWindow = 10, maxWindow = 40) {
    this.candles = []; // Almacena las velas
    this.currentWindow = initialWindow; // Ventana de almacenamiento actual
    this.maxWindow = maxWindow; // Ventana máxima permitida
  }

  /**
   * Agrega una nueva vela al contexto.
   * Si se supera la ventana actual, elimina la vela más antigua.
   * Además, incrementa gradualmente la ventana hasta alcanzar el máximo.
   * @param {Object} candle - objeto con open, high, low, close y timestamp.
   */
  addCandle(candle) {
    this.candles.push(candle);
    if (this.candles.length > this.currentWindow) {
      this.candles.shift();
    }
    if (
      this.candles.length === this.currentWindow &&
      this.currentWindow < this.maxWindow
    ) {
      this.currentWindow++;
    }
  }

  /**
   * Calcula y retorna los niveles de soporte (mínimo) y resistencia (máximo)
   * basados en el array de velas almacenado.
   * @returns {Object} { support, resistance }
   */
  getSupportResistance() {
    if (this.candles.length === 0) return { support: null, resistance: null };
    const lows = this.candles.map((c) => c.low);
    const highs = this.candles.map((c) => c.high);
    return {
      support: Math.min(...lows),
      resistance: Math.max(...highs),
    };
  }

  /**
   * Retorna el contexto (array de velas) almacenado.
   * @returns {Array}
   */
  getCandleContext() {
    return this.candles;
  }
}

// ReactionStatsManager: Maneja las estadísticas de reacción para señales "green" y "red"
class ReactionStatsManager {
  constructor(config) {
    this.config = config;
    // Ruta donde se guardarán las estadísticas en formato JSON.
    this.filePath = path.join(this.config.DATA_DIR, 'reactionStats.json');
    // Estructura inicial para almacenar estadísticas de cada reacción con subdivisión para datos no confiables.
    this.reactionStats = {
      green: {
        count: 0,
        wins: 0,
        losses: 0,
        nonReliable: { count: 0, wins: 0, losses: 0 },
      },
      red: {
        count: 0,
        wins: 0,
        losses: 0,
        nonReliable: { count: 0, wins: 0, losses: 0 },
      },
    };
    this.load();
  }

  // Carga las estadísticas desde el archivo JSON; en caso de error, utiliza la estructura inicial.
  async load() {
    try {
      const data = await fsPromises.readFile(this.filePath, 'utf8');
      this.reactionStats = JSON.parse(data);
      // Asegura que la subdivisión "nonReliable" existe para ambas reacciones.
      for (const reaction of ['green', 'red']) {
        if (!this.reactionStats[reaction].nonReliable) {
          this.reactionStats[reaction].nonReliable = {
            count: 0,
            wins: 0,
            losses: 0,
          };
        }
      }
    } catch (err) {
      this.reactionStats = {
        green: {
          count: 0,
          wins: 0,
          losses: 0,
          nonReliable: { count: 0, wins: 0, losses: 0 },
        },
        red: {
          count: 0,
          wins: 0,
          losses: 0,
          nonReliable: { count: 0, wins: 0, losses: 0 },
        },
      };
    }
  }

  // Guarda las estadísticas actuales en disco.
  async save() {
    try {
      await fsPromises.writeFile(
        this.filePath,
        JSON.stringify(this.reactionStats, null, 2)
      );
    } catch (err) {
      console.error('Error al guardar las estadísticas de reacción:', err);
    }
  }

  /**
   * Actualiza las estadísticas para una reacción dada.
   * @param {string} reaction - "green" o "red".
   * @param {boolean} win - Si el trade fue ganador.
   * @param {boolean} [predictionReliability=true] - Indica si la predicción fue confiable.
   */
  async updateStats(reaction, win, predictionReliability = true) {
    if (!this.reactionStats[reaction]) {
      this.reactionStats[reaction] = {
        count: 0,
        wins: 0,
        losses: 0,
        nonReliable: { count: 0, wins: 0, losses: 0 },
      };
    }
    this.reactionStats[reaction].count++;
    if (win) {
      this.reactionStats[reaction].wins++;
    } else {
      this.reactionStats[reaction].losses++;
    }
    // Actualiza también en la subdivisión nonReliable si la predicción no es confiable.
    if (!predictionReliability) {
      this.reactionStats[reaction].nonReliable.count++;
      if (win) {
        this.reactionStats[reaction].nonReliable.wins++;
      } else {
        this.reactionStats[reaction].nonReliable.losses++;
      }
    }
    await this.save();
  }

  /**
   * Verifica si hay suficientes datos y si la tasa de éxito es al menos el 60%.
   * @param {string} reaction - "green" o "red".
   * @returns {boolean} - true si se considera confiable.
   */
  isReliable(reaction) {
    const stats = this.reactionStats[reaction];
    if (!stats || stats.count < 5) return false;
    return stats.wins / stats.count >= 0.6;
  }

  /**
   * Retorna todas las estadísticas almacenadas de las reacciones.
   * @returns {Object}
   */
  getStats() {
    return this.reactionStats;
  }
}

// ============================
// NUEVA SECCIÓN: SubCandleBuilder (Velas de 2 segundos)
// ============================
class SubCandleBuilder {
  constructor() {
    // Inicializa la vela actual y el historial de subvelas
    this.currentCandle = null;
    this.subCandles = [];
    // Inicia la primera vela
    this.initCandle();
  }

  // Función para iniciar o reiniciar la vela actual
  initCandle() {
    this.currentCandle = {
      open: null,
      high: -Infinity,
      low: Infinity,
      close: null,
      startTime: Date.now(),
      ticks: [], // Guarda todos los pips recibidos durante la vela de 2 s
    };
  }

  // Función que se llama cada vez que se recibe un pip (se usará en el pipReceiver)
  addTick(pipData) {
    const value = pipData.pip;
    // Si aún no se ha establecido la apertura de la vela, se asigna el primer valor recibido
    if (this.currentCandle.open === null) {
      this.currentCandle.open = value;
    }
    // Actualiza el máximo y mínimo de la vela
    if (value > this.currentCandle.high) {
      this.currentCandle.high = value;
    }
    if (value < this.currentCandle.low) {
      this.currentCandle.low = value;
    }
    // Se actualiza el cierre con el último pip recibido
    this.currentCandle.close = value;
    // Agrega el pip al arreglo de ticks
    this.currentCandle.ticks.push(pipData);
  }

  // Función que finaliza la vela actual y la almacena en el historial
  finalizeCandle() {
    // AÑADIMOS ESTA VALIDACIÓN CRÍTICA
    if (this.currentCandle.ticks.length === 0) {
      // Si no hay ticks, no es una vela válida. Reiniciar y no hacer nada más.
      this.initCandle();
      return;
    }

    this.currentCandle.endTime = Date.now();
    // Almacena la vela finalizada en el historial
    this.subCandles.push(this.currentCandle);
    // Opcional: Limitar el historial a las últimas 10 subvelas
    if (this.subCandles.length > 10) {
      this.subCandles.shift();
    }
    // Reinicia la vela actual para empezar a acumular el siguiente bloque de 2 s
    this.initCandle();
  }

  // Devuelve las últimas n subvelas; en este caso, necesitamos las 6 últimas
  getLastSubCandles(n) {
    return this.subCandles.slice(-n);
  }
}

// Fin de SubCandleBuilder
const subCandleBuilder = new SubCandleBuilder();


// ============================
// AREPA 5: Clase Dashboard (Interfaz visual y gráficos) - VERSIÓN ULTRA OPTIMIZADA
// ============================

class Dashboard {
  /**
   * Crea una instancia del Dashboard.
   * @param {object} page - La instancia de la página (Puppeteer).
   * @param {object} config - Objeto de configuración global.
   */
  constructor(page, config) {
    this.page = page;
    this.config = config;
    this.chartsEnabled = config.UI.ENABLE_CHARTS;
    this.hasCharts = false;
    this.allCandles = []; // Historial de velas para reseteo del gráfico
    this.maxCandlesBeforeReset = 100; // Resetear el gráfico cada 100 velas para mantenerlo limpio
  }

  /**
   * Configura el Dashboard esperando la carga de selectores claves.
   */
  async setup() {
    try {
      await this.page.waitForSelector('#trading-bot-dashboard', { timeout: 10000 });
      console.log('Dashboard externo cargado correctamente.');

      if (this.chartsEnabled) {
        await this.initChart();
      }
    } catch (err) {
      console.error('Error en Dashboard.setup, continuando en modo sin UI:', err.message);
      this.chartsEnabled = false;
    }
  }

  /**
   * Inicializa el gráfico usando LightweightCharts.
   */
  async initChart() {
    if (!this.chartsEnabled) {
      console.log('Gráficos deshabilitados en la configuración.');
      return;
    }
    try {
      await this.page.waitForFunction(
        () => typeof window.LightweightCharts !== 'undefined',
        { timeout: this.config.UI.CHARTS_TIMEOUT }
      );

      await this.page.evaluate(() => {
        // Prevenir reinicialización si ya existe
        if (window.myChart) return; 
        
        const container = document.getElementById('bot-chart-container');
        if (!container) {
            console.error('Contenedor del gráfico #bot-chart-container no encontrado.');
            return;
        }
        window.myChart = LightweightCharts.createChart(container, {
          width: container.offsetWidth,
          height: container.offsetHeight,
          layout: { backgroundColor: '#121212', textColor: '#ffffff' },
          grid: { vertLines: { color: '#2e2e2e' }, horzLines: { color: '#2e2e2e' } },
          timeScale: { borderColor: '#8a2be2', timeVisible: true, secondsVisible: false },
          priceScale: { borderColor: '#8a2be2' },
        });
        window.candlestickSeries = window.myChart.addCandlestickSeries({
          upColor: '#4CAF50',
          downColor: '#f44336',
          borderVisible: true,
          wickUpColor: '#4CAF50',
          wickDownColor: '#f44336',
        });
      });
      
      this.hasCharts = true;
      console.log('Gráfico Lightweight Charts inicializado correctamente.');

    } catch (err) {
      console.error('Error fatal en la inicialización de gráficos:', err.message);
      this.hasCharts = false;
      this.chartsEnabled = false;
    }
  }

  /**
   * ❗ FUNCIÓN CLAVE MODIFICADA: Actualiza el gráfico con la vela finalizada.
   * Se llama únicamente al cierre de cada vela de 5 minutos.
   * @param {object} candle - Objeto con datos: open, high, low, close y timestamp.
   */
  async updateChart(candle) {
    if (!this.hasCharts) return;
    
    try {
      const timeValue = Math.floor(new Date(candle.timestamp).getTime() / 1000);
      const candleData = {
        time: timeValue,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      };

      this.allCandles.push(candleData);

      // Si el historial es demasiado grande, reseteamos el gráfico con las últimas velas
      if (this.allCandles.length > this.maxCandlesBeforeReset) {
        console.log(`[Dashboard] Límite de ${this.maxCandlesBeforeReset} velas alcanzado. Reseteando gráfico.`);
        this.allCandles = this.allCandles.slice(-this.maxCandlesBeforeReset);
        
        await this.page.evaluate((candles) => {
          if (window.candlestickSeries) {
            window.candlestickSeries.setData(candles);
          }
        }, this.allCandles);

      } else {
        // Actualización normal, añadiendo la última vela
        await this.page.evaluate((candle) => {
          if (window.candlestickSeries) {
            window.candlestickSeries.update(candle);
          }
        }, candleData);
      }
    } catch (err) {
      console.warn('Error al actualizar el gráfico. Desactivando para esta sesión:', err.message);
      this.hasCharts = false; // Desactivar si falla para prevenir más errores.
    }
  }

  /**
   * Actualiza el panel de estadísticas en el contenedor 'bot-stats'.
   * @param {object} stats - Objeto con estadísticas (balance, ganadas, perdidas, etc.).
   */
  async updateStats(stats) {
    // Esta función no es de alta frecuencia, por lo que su impacto es mínimo. Se mantiene.
    const {
      initialBalance,
      currentBalance,
      startTime,
      wins,
      losses,
      gales,
      previousCandle,
      manipulatedCandle,
    } = stats;
    let profitability = '';
    if (initialBalance && currentBalance) {
      profitability = Utils.formatPercent(
        (currentBalance - initialBalance) / initialBalance
      );
    }
    const mode = this.config.STRATEGY.DRY_RUN ? 'Demo' : 'Real';
    const statsHtml = `
      <div>Modo: ${mode}</div>
      <div>Saldo inicial: ${initialBalance !== null ? initialBalance : 'N/A'}</div>
      <div>Hora de inicio: ${startTime || 'N/A'}</div>
      <div>Ganadas: ${wins}</div>
      <div>Perdidas: ${losses}</div>
      <div>Gales: ${gales || 0}</div>
      <div>Rentabilidad: ${profitability}</div>
      <div>Activo: ${stats.activeAsset}</div>
      <div>Gráficos: ${this.hasCharts ? 'Activados' : 'Desactivados'}</div>
    `;
    try {
      await this.page.evaluate((html) => {
        const el = document.getElementById('bot-stats');
        if (el) el.innerHTML = html;
      }, statsHtml);
    } catch (err) {
      // Ignorar errores si la página no está disponible.
    }
  }

  // ❌ FUNCIÓN 'log' ELIMINADA. Ya no se interactúa con #bot-log-area.
  // ❌ FUNCIÓN 'updateCandleVisual' ELIMINADA. La actualización en tiempo real era la causa del colapso.
  // ❌ FUNCIÓN 'cleanBrowserMemory' ELIMINADA. Las optimizaciones la hacen innecesaria y su lógica era riesgosa.
  // ❌ FUNCIÓN 'updateSupportResistance' ELIMINADA. Era código muerto.

  /**
   * Detiene todos los intervalos del Dashboard (si los hubiera).
   */
  stop() {
    // No hay intervalos activos en esta versión optimizada.
    console.log('[Dashboard] Dashboard detenido. No hay procesos activos.');
  }
}

module.exports = Dashboard;
// ============================
// AREPA 6: Clase MarketAnalyzer (Cálculo de señales técnicas y aceleración GPU)
// VERSIÓN CORREGIDA Y OPTIMIZADA
// ============================

class MarketAnalyzer {
  constructor(config) {
    this.config = config;
    this.prevCandle = 'N/A';
    this.recentCandles = [];
    this.volatilityHistory = [];
    this.lastTickTime = null;
    this.lastTickValue = null;
    this.adaptiveThresholdFactor = 0.15;

    // Inicializar motor GPU con manejo robusto de errores
    this.initializeGPUEngine();

    // Pesos de las señales (AHORA SÍ SE USAN)
    this.signalWeights = {
      priceAction: 0.4,
      momentum: 0.25,
      volumeTrend: 0.15,
      qcp: 0.2,
    };

    // Estadísticas internas de análisis
    this.analysisStats = {
      totalCalls: 0,
      gpuSuccess: 0,
      cpuFallback: 0,
      errors: 0,
    };

    // Límites para prevenir memory leaks
    this.MAX_VOLATILITY_HISTORY = 10;
    this.MAX_RECENT_CANDLES = 50;
  }

  /**
   * Inicializa el motor GPU con manejo robusto de errores
   */
  initializeGPUEngine() {
    try {
      const { MarketAnalyzerGPU } = require('./gpu-market-analyzer');
      this.gpuEngine = new MarketAnalyzerGPU(this.config);
      this.gpuAvailable = true;
      console.log('🚀 Motor GPU MarketAnalyzer inicializado correctamente');
    } catch (error) {
      console.warn('⚠️ GPU no disponible. Usando CPU fallback. Error:', error.message);
      this.gpuEngine = null;
      this.gpuAvailable = false;
    }
  }

  /**
   * Calcula las métricas de velocidad del precio basado en los ticks.
   * @param {Array} ticks - Array de ticks con propiedades pip y time.
   * @returns {Object} Métricas de velocidad.
   */
  async calculateVelocityMetrics(ticks) {
    try {
      // Validación robusta de entrada
      if (!Array.isArray(ticks) || ticks.length < 3) {
        return this.getDefaultVelocityMetrics();
      }

      const validTicks = ticks.filter(tick => 
        tick && 
        typeof tick.pip === 'number' && 
        typeof tick.time === 'number' && 
        !isNaN(tick.pip) && 
        !isNaN(tick.time) &&
        tick.pip > 0
      );

      if (validTicks.length < 3) {
        return this.getDefaultVelocityMetrics();
      }

      // Calcular velocidades entre ticks consecutivos (micropips/ms)
      const velocities = [];
      for (let i = 1; i < validTicks.length; i++) {
        const priceChange = Math.abs(validTicks[i].pip - validTicks[i - 1].pip);
        const timeChange = validTicks[i].time - validTicks[i - 1].time;
        
        if (timeChange > 0) {
          const velocity = priceChange / timeChange;
          velocities.push(velocity);
        }
      }

      if (velocities.length === 0) {
        return this.getDefaultVelocityMetrics();
      }

      // Cálculos estadísticos
      const avgVelocity = velocities.reduce((sum, v) => sum + v, 0) / velocities.length;
      const maxVelocity = Math.max(...velocities);
      const minVelocity = Math.min(...velocities);

      // Calcular aceleración
      let acceleration = 0;
      if (velocities.length >= 3) {
        const halfPoint = Math.floor(velocities.length / 2);
        const firstHalf = velocities.slice(0, halfPoint);
        const secondHalf = velocities.slice(halfPoint);
        
        if (firstHalf.length > 0 && secondHalf.length > 0) {
          const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
          const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
          acceleration = secondAvg - firstAvg;
        }
      }

      const velocityPattern = this.determineVelocityPattern(velocities, avgVelocity, maxVelocity);
      const directionChanges = this.countDirectionChanges(validTicks);
      
      // Métricas adicionales
      const maxVelIndex = velocities.indexOf(maxVelocity);
      const timeToMaxVel = velocities.length > 0 ? maxVelIndex / velocities.length : 0.5;
      
      const velocityVariance = velocities.reduce((sum, v) => sum + Math.pow(v - avgVelocity, 2), 0) / velocities.length;
      const velocityStdDev = Math.sqrt(velocityVariance);
      const velocityConsistency = avgVelocity > 0 ? Math.max(0, Math.min(1, 1 - (velocityStdDev / avgVelocity))) : 0;

      // Convertir a micropips para mejor legibilidad
      const MICROPIP_FACTOR = 1e6;
      
      console.log(`🚀 VelocityAnalyzer: avgVel=${(avgVelocity * MICROPIP_FACTOR).toFixed(2)}µ/ms, maxVel=${(maxVelocity * MICROPIP_FACTOR).toFixed(2)}µ/ms, pattern=${velocityPattern}`);

      return {
        avgVelocity: Number((avgVelocity * MICROPIP_FACTOR).toFixed(6)),
        maxVelocity: Number((maxVelocity * MICROPIP_FACTOR).toFixed(6)),
        minVelocity: Number((minVelocity * MICROPIP_FACTOR).toFixed(6)),
        acceleration: Number((acceleration * MICROPIP_FACTOR).toFixed(6)),
        velocityPattern,
        directionChanges,
        timeToMaxVel: Number(timeToMaxVel.toFixed(3)),
        velocityConsistency: Number(velocityConsistency.toFixed(3)),
        totalTicks: validTicks.length,
        analysisTime: Date.now(),
      };
    } catch (error) {
      console.error('❌ Error en calculateVelocityMetrics:', error.message);
      this.analysisStats.errors++;
      return this.getDefaultVelocityMetrics();
    }
  }

  /**
   * Determina el patrón de velocidad
   */
  determineVelocityPattern(velocities, avgVelocity, maxVelocity) {
    try {
      if (!Array.isArray(velocities) || velocities.length < 5 || avgVelocity <= 0) {
        return 'steady';
      }

      const sorted = [...velocities].sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      const p95Velocity = sorted[Math.min(p95Index, sorted.length - 1)];

      // Detectar patrón explosivo
      if (p95Velocity > avgVelocity * 5) {
        return 'explosive';
      }

      // Calcular desviación estándar
      const variance = velocities.reduce((sum, v) => sum + Math.pow(v - avgVelocity, 2), 0) / velocities.length;
      const stdDev = Math.sqrt(variance);
      
      // Patrones basados en variabilidad
      if (stdDev < avgVelocity * 0.3) {
        return 'gradual';
      }
      if (stdDev > avgVelocity * 1.5) {
        return 'erratic';
      }

      // Analizar tendencia
      const quarterSize = Math.floor(velocities.length / 4);
      if (quarterSize > 0) {
        const firstQuarter = velocities.slice(0, quarterSize);
        const lastQuarter = velocities.slice(-quarterSize);
        
        const firstAvg = firstQuarter.reduce((s, v) => s + v, 0) / firstQuarter.length;
        const lastAvg = lastQuarter.reduce((s, v) => s + v, 0) / lastQuarter.length;
        
        if (lastAvg > firstAvg * 1.5) {
          return 'accelerating';
        } else if (firstAvg > lastAvg * 1.5) {
          return 'decelerating';
        }
      }
      
      return 'steady';
    } catch (error) {
      console.error('❌ Error en determineVelocityPattern:', error);
      return 'unknown';
    }
  }

  /**
   * Cuenta cambios direccionales en el precio
   */
  countDirectionChanges(ticks) {
    try {
      if (!Array.isArray(ticks) || ticks.length < 2) {
        return 0;
      }

      let changes = 0;
      let lastDirection = null;
      
      for (let i = 1; i < ticks.length; i++) {
        const diff = ticks[i].pip - ticks[i - 1].pip;
        
        if (Math.abs(diff) > 1e-7) {
          const currentDirection = diff > 0 ? 'up' : 'down';
          
          if (lastDirection && lastDirection !== currentDirection) {
            changes++;
          }
          
          lastDirection = currentDirection;
        }
      }
      
      return changes;
    } catch (error) {
      console.error('❌ Error en countDirectionChanges:', error);
      return 0;
    }
  }

  /**
   * Retorna métricas por defecto
   */
  getDefaultVelocityMetrics() {
    return {
      avgVelocity: 0,
      maxVelocity: 0,
      minVelocity: 0,
      acceleration: 0,
      velocityPattern: 'unknown',
      directionChanges: 0,
      timeToMaxVel: 0.5,
      velocityConsistency: 0,
      totalTicks: 0,
      analysisTime: Date.now(),
    };
  }

  /**
   * Predice el patrón de subvelas de 2 segundos
   */
  predictSubCandlePattern() {
    try {
      const subCandles = subCandleBuilder.getLastSubCandles(5);
      
      if (!subCandles || subCandles.length < 5) {
        console.log('MarketAnalyzer: Subvelas insuficientes para análisis');
        return null;
      }

      // Obtener el patrón específico
      const { classifySubCandlePattern } = require('./MLModel');
      const patternName = classifySubCandlePattern(subCandles);

      console.log(`👉 [2s Indicator] Patrón detectado: ${patternName}`);

      // Mapeo de patrones a señales
      const patternSignals = {
        // Patrones ALCISTAS
        gap_alcista: 'green',
        explosion_final: 'green',
        tres_soldados_blancos: 'green',
        escalera_alcista: 'green',
        dump_and_pump: 'green',
        reversion_final_alcista: 'green',
        impulso_final_alcista: 'green',
        lateral_rompiendo_arriba: 'green',
        martillo_2s: 'green',
        falsa_ruptura_bajista: 'green',

        // Patrones BAJISTAS
        gap_bajista: 'red',
        tres_cuervos_negros: 'red',
        escalera_bajista: 'red',
        pump_and_dump: 'red',
        reversion_final_bajista: 'red',
        impulso_final_bajista: 'red',
        lateral_rompiendo_abajo: 'red',
        falsa_ruptura_alcista: 'red',
        estrella_fugaz_2s: 'red',

        // Patrones NEUTRALES
        compresion_volatilidad: null,
        pausa_o_agotamiento: null,
        triangulo_convergente: null,
        patron_indefinido: null,
        datos_insuficientes: null,
      };

      const signal = patternSignals[patternName] || null;

      // Análisis adicional para patrones neutrales
      if (signal === null && subCandles.length >= 5) {
        const firstCandle = subCandles[0];
        const lastCandle = subCandles[4];
        const priceChange = lastCandle.close - firstCandle.open;
        const threshold = firstCandle.open * 0.0001; // 0.01%

        if (Math.abs(priceChange) > threshold) {
          return priceChange > 0 ? 'green' : 'red';
        }
      }

      return signal;
    } catch (error) {
      console.error('❌ Error en predictSubCandlePattern:', error);
      return null;
    }
  }

  /**
   * MÉTODO PRINCIPAL: Predice la señal de la próxima vela
   */
  async predictNextCandleSignal(openPip, ticks, candleEndTime) {
    console.log('\n⚡ === INICIANDO ANÁLISIS DE SEÑAL ===');
    console.log(`📊 Parámetros: openPip=${openPip?.toFixed(5)}, ticks=${ticks?.length}, cierre=${new Date(candleEndTime).toLocaleTimeString()}`);

    const startTime = Date.now();
    this.analysisStats.totalCalls++;

    try {
      // Validaciones críticas de entrada
      if (!this.validateInputs(openPip, ticks, candleEndTime)) {
        return null;
      }

      console.log('✅ Validación de entrada completada');

      // Intentar primero con GPU si está disponible
      if (this.gpuAvailable && this.gpuEngine) {
        const gpuResult = await this.tryGPUAnalysis(openPip, ticks, candleEndTime);
        if (gpuResult !== null) {
          const processingTime = Date.now() - startTime;
          console.log(`✅ GPU exitoso: ${gpuResult} en ${processingTime}ms`);
          this.analysisStats.gpuSuccess++;
          return gpuResult;
        }
      }

      // Fallback a CPU
      console.log('🔄 Usando análisis CPU con indicadores completos');
      this.analysisStats.cpuFallback++;

      // Filtrar ticks relevantes (últimos 4 segundos)
      const lookbackWindow = 4000;
      const relevantTicks = ticks.filter(t => t.time >= candleEndTime - lookbackWindow);

      if (relevantTicks.length < 3) {
        console.log('❌ Ticks insuficientes para análisis detallado');
        const avgPrice = ticks.reduce((sum, tick) => sum + tick.pip, 0) / ticks.length;
        return avgPrice > openPip ? 'green' : 'red';
      }

      // Ejecutar análisis multi-dimensional
      const signals = await this.performMultiDimensionalAnalysis(openPip, relevantTicks, ticks, candleEndTime);
      
      // Combinar señales con pesos adaptativos
      const finalSignal = this.combineFinalSignal(signals);
      
      const processingTime = Date.now() - startTime;
      console.log(`✅ CPU completado: ${finalSignal} en ${processingTime}ms`);
      console.log(`🎯 RESULTADO FINAL: ${finalSignal}\n`);

      return finalSignal;

    } catch (error) {
      console.error('❌ Error crítico en predictNextCandleSignal:', error);
      this.analysisStats.errors++;
      return null;
    }
  }

  /**
   * Valida las entradas del método principal
   */
  validateInputs(openPip, ticks, candleEndTime) {
    if (!openPip || isNaN(openPip) || openPip <= 0) {
      console.error('❌ openPip inválido:', openPip);
      return false;
    }
    
    if (!Array.isArray(ticks) || ticks.length === 0) {
      console.error('❌ ticks inválidos:', ticks);
      return false;
    }
    
    if (!candleEndTime || isNaN(candleEndTime)) {
      console.error('❌ candleEndTime inválido:', candleEndTime);
      return false;
    }
    
    return true;
  }

  /**
   * Intenta análisis con GPU
   */
  async tryGPUAnalysis(openPip, ticks, candleEndTime) {
    try {
      const result = await this.gpuEngine.predictNextCandleSignalGPU(openPip, ticks, candleEndTime);
      
      // Sincronizar historial de volatilidad
      if (this.gpuEngine.volatilityHistory && this.gpuEngine.volatilityHistory.length > 0) {
        this.volatilityHistory = [...this.gpuEngine.volatilityHistory];
        this.maintainVolatilityHistory();
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error en motor GPU:', error.message);
      return null;
    }
  }

  /**
   * Realiza análisis multi-dimensional
   */
  async performMultiDimensionalAnalysis(openPip, relevantTicks, allTicks, candleEndTime) {
    const signals = {};

    // 1. PRICE ACTION
    const priceAnalysis = this.analyzePriceAction(openPip, relevantTicks);
    signals.priceAction = priceAnalysis.signal;
    console.log(`💰 Price Action: avg=${priceAnalysis.avgPrice.toFixed(5)}, diff=${priceAnalysis.priceDiff.toFixed(5)}, threshold=${priceAnalysis.threshold.toFixed(5)}, signal=${priceAnalysis.signal}`);

    // 2. MOMENTUM
    signals.momentum = this.analyzeMomentum(relevantTicks);
    console.log(`⚡ Momentum: ${signals.momentum.toFixed(3)}`);

    // 3. VOLUME TREND
    signals.volumeTrend = this.analyzeTickVolume(relevantTicks);
    console.log(`📊 Volume Trend: ${signals.volumeTrend.toFixed(3)}`);

    // 4. QCP (Quantum Candle Prediction)
    if (allTicks.length >= 100) {
      const qcpAnalysis = this.analyzeQCP(openPip, relevantTicks, allTicks);
      signals.qcp = qcpAnalysis.signal;
      console.log(`🔮 QCP: value=${qcpAnalysis.value.toFixed(4)}, signal=${qcpAnalysis.signal}`);
    } else {
      signals.qcp = 0;
      console.log('🔮 QCP: Insuficientes ticks (se requieren mínimo 100)');
    }

    return signals;
  }

  /**
   * Analiza la acción del precio
   */
  analyzePriceAction(openPip, ticks) {
    const avgPrice = ticks.reduce((sum, tick) => sum + tick.pip, 0) / ticks.length;
    const priceDiff = avgPrice - openPip;
    const adaptiveThreshold = this.calculateAdaptiveThreshold(ticks, openPip);
    
    const signal = Math.abs(priceDiff) > adaptiveThreshold 
      ? (priceDiff > 0 ? 1 : -1) 
      : 0;

    return {
      avgPrice,
      priceDiff,
      threshold: adaptiveThreshold,
      signal
    };
  }

  /**
   * Calcula threshold adaptativo
   */
  calculateAdaptiveThreshold(ticks, openPip) {
    if (ticks.length < 2) {
      return this.config.STRATEGY.REACTION_THRESHOLD || 0.0001;
    }

    try {
      const prices = ticks.map(t => t.pip).filter(p => p && !isNaN(p));
      if (prices.length === 0) return 0.0001;

      const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
      const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
      const stdDev = Math.sqrt(variance);
      const volatilityPct = openPip > 0 ? stdDev / openPip : 0;

      // Mantener historial de volatilidad con límite
      this.volatilityHistory.push(volatilityPct);
      this.maintainVolatilityHistory();

      const avgVolatility = this.volatilityHistory.reduce((sum, v) => sum + v, 0) / this.volatilityHistory.length;
      
      // Calcular threshold con límites
      const minThreshold = 0.00005;
      const maxThreshold = 0.0005;
      let adaptiveThreshold = avgVolatility * this.adaptiveThresholdFactor;
      adaptiveThreshold = Math.max(minThreshold, Math.min(maxThreshold, adaptiveThreshold));

      return adaptiveThreshold;
    } catch (error) {
      console.error('❌ Error calculando threshold adaptativo:', error.message);
      return 0.0001;
    }
  }

  /**
   * Mantiene el historial de volatilidad dentro de límites
   */
  maintainVolatilityHistory() {
    while (this.volatilityHistory.length > this.MAX_VOLATILITY_HISTORY) {
      this.volatilityHistory.shift();
    }
  }

  /**
   * Analiza el momentum del precio
   */
  analyzeMomentum(ticks) {
    if (ticks.length < 6) return 0;

    try {
      const halfPoint = Math.floor(ticks.length / 2);
      const firstHalf = ticks.slice(0, halfPoint);
      const secondHalf = ticks.slice(halfPoint);
      
      const firstSlope = this.calculatePriceSlope(firstHalf);
      const secondSlope = this.calculatePriceSlope(secondHalf);
      const acceleration = secondSlope - firstSlope;
      
      // Normalizar a rango [-1, 1]
      const result = Math.max(-1, Math.min(1, acceleration * 20000));
      return isNaN(result) ? 0 : result;
    } catch (error) {
      console.error('❌ Error analizando momentum:', error.message);
      return 0;
    }
  }

  /**
   * Calcula la pendiente del precio usando regresión lineal
   */
  calculatePriceSlope(ticks) {
    if (ticks.length < 2) return 0;

    try {
      const n = ticks.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

      ticks.forEach((tick) => {
        sumX += tick.time;
        sumY += tick.pip;
        sumXY += tick.time * tick.pip;
        sumX2 += tick.time * tick.time;
      });

      const denominator = n * sumX2 - sumX * sumX;
      if (Math.abs(denominator) < 1e-10) return 0;

      const slope = (n * sumXY - sumX * sumY) / denominator;
      return isNaN(slope) ? 0 : slope;
    } catch (error) {
      console.error('❌ Error calculando slope:', error.message);
      return 0;
    }
  }

  /**
   * Analiza el volumen direccional
   */
  analyzeTickVolume(ticks) {
    if (ticks.length < 3) return 0;

    try {
      let upTicks = 0;
      let downTicks = 0;

      for (let i = 1; i < ticks.length; i++) {
        const priceDiff = ticks[i].pip - ticks[i - 1].pip;
        if (priceDiff > 0) upTicks++;
        else if (priceDiff < 0) downTicks++;
      }

      const totalDirectional = upTicks + downTicks;
      if (totalDirectional === 0) return 0;

      const volumeRatio = (upTicks - downTicks) / totalDirectional;
      return isNaN(volumeRatio) ? 0 : volumeRatio;
    } catch (error) {
      console.error('❌ Error analizando volumen:', error.message);
      return 0;
    }
  }

  /**
   * Analiza con indicador QCP
   */
  analyzeQCP(openPip, relevantTicks, allTicks) {
    const lastPip = relevantTicks[relevantTicks.length - 1].pip;
    const candle = { open: openPip, close: lastPip };
    const tickData = allTicks.slice(0, Math.min(300, allTicks.length));
    
    const qcpValue = this.calculateQCP(candle, tickData);
    const qcpPrediction = this.predictReactionFromQCP(qcpValue);
    
    return {
      value: qcpValue,
      signal: qcpPrediction === 'green' ? 1 : qcpPrediction === 'red' ? -1 : 0
    };
  }

  /**
   * Calcula el indicador QCP
   */
  calculateQCP(candle, tickData) {
    if (!tickData || tickData.length < 1) return 0;

    try {
      const len = tickData.length;
      const firstPip = tickData[0].pip;
      const lastPip = tickData[len - 1].pip;

      // IMM - Intramarket Momentum
      const imm = firstPip > 0 ? (lastPip - firstPip) / firstPip : 0;

      // CAP - Central Area Pressure
      const midStart = Math.max(0, Math.floor(len / 2) - 5);
      const midEnd = Math.min(len, Math.floor(len / 2) + 5);
      let capSum = 0;
      let capCount = 0;

      for (let i = midStart; i < midEnd; i++) {
        if (tickData[i] && tickData[i].pip) {
          capSum += tickData[i].pip;
          capCount++;
        }
      }

      const cap = capCount > 0 ? capSum / capCount : lastPip;
      const capPressure = firstPip > 0 ? (cap - firstPip) / firstPip : 0;

      // ODT - Oscillation Detection Threshold
      const first60 = Math.min(60, len);
      const last60Start = Math.max(0, len - 60);

      let first60Sum = 0;
      let last60Sum = 0;

      for (let i = 0; i < first60; i++) {
        first60Sum += tickData[i].pip;
      }
      for (let i = last60Start; i < len; i++) {
        last60Sum += tickData[i].pip;
      }

      const first60Avg = first60Sum / first60;
      const last60Avg = last60Sum / (len - last60Start);
      const odt = first60Avg > 0 ? (last60Avg - first60Avg) / first60Avg : 0;

      // RVT - Rate Velocity Threshold
      let rvt = 0;
      if (len >= 30) {
        const last30Start = len - 30;
        const timeDiff = tickData[len - 1].time - tickData[last30Start].time;
        const priceDiff = tickData[len - 1].pip - tickData[last30Start].pip;
        rvt = timeDiff > 0 ? (priceDiff / timeDiff) * 1000 : 0;
      }

      // IFM - Intramarket Flow Momentum
      const first10End = Math.min(10, len);
      const last10Start = Math.max(0, len - 10);

      let first10Sum = 0;
      let last10Sum = 0;

      for (let i = 0; i < first10End; i++) {
        first10Sum += tickData[i].pip;
      }
      const first10Avg = first10Sum / first10End;

      for (let i = last10Start; i < len; i++) {
        last10Sum += tickData[i].pip;
      }
      const last10Avg = last10Sum / (len - last10Start);

      const ifm = first10Avg > 0 ? (last10Avg - first10Avg) / first10Avg : 0;

      // Fórmula QCP combinada
      const qcp = imm * 2.0 + capPressure * 1.5 + odt * 1.0 + rvt * 0.5 + ifm * 1.0;

      console.log(`QCP Components: IMM=${imm.toFixed(4)}, CAP=${capPressure.toFixed(4)}, ODT=${odt.toFixed(4)}, RVT=${rvt.toFixed(4)}, IFM=${ifm.toFixed(4)}`);

      return qcp;
    } catch (error) {
      console.error('❌ Error calculando QCP:', error);
      return 0;
    }
  }

  /**
   * Predice reacción basada en QCP
   */
  predictReactionFromQCP(qcpValue) {
    const BULLISH_THRESHOLD = 0.0015;
    const BEARISH_THRESHOLD = -0.0008;

    if (qcpValue > BULLISH_THRESHOLD) {
      return 'green';
    } else if (qcpValue < BEARISH_THRESHOLD) {
      return 'red';
    }

    return null;
  }

  /**
   * Combina las señales con pesos adaptativos
   */
  combineFinalSignal(signals) {
    let combinedSignal = 0;

    combinedSignal += (signals.priceAction || 0) * this.signalWeights.priceAction;
    combinedSignal += (signals.momentum || 0) * this.signalWeights.momentum;
    combinedSignal += (signals.volumeTrend || 0) * this.signalWeights.volumeTrend;
    combinedSignal += (signals.qcp || 0) * this.signalWeights.qcp;

    console.log(`🎯 Señal combinada: ${combinedSignal.toFixed(4)}`);
    console.log(`   Componentes: price(${((signals.priceAction || 0) * this.signalWeights.priceAction).toFixed(3)}) + momentum(${((signals.momentum || 0) * this.signalWeights.momentum).toFixed(3)}) + volume(${((signals.volumeTrend || 0) * this.signalWeights.volumeTrend).toFixed(3)}) + qcp(${((signals.qcp || 0) * this.signalWeights.qcp).toFixed(3)})`);

    // Decisión final con umbral
    let finalSignal;
    if (combinedSignal > 0.25) {
      finalSignal = 'green';
    } else if (combinedSignal < -0.25) {
      finalSignal = 'red';
    } else {
      // Desempate usando price action
      finalSignal = signals.priceAction >= 0 ? 'green' : 'red';
      console.log(`⚠️ Señal indecisa (${combinedSignal.toFixed(4)}), usando price action: ${finalSignal}`);
    }

    return finalSignal;
  }

  /**
   * Clasifica patrones de velas (compatibilidad)
   */
  classifyCandlePattern(candle) {
    if (!candle) return 'Unknown';

    const { open, high, low, close } = candle;
    const range = high - low || 0.0001;
    const bodySize = Math.abs(close - open) / range;
    const upperShadow = (high - Math.max(open, close)) / range;
    const lowerShadow = (Math.min(open, close) - low) / range;

    // Clasificación de patrones
    if (bodySize < 0.1) {
      if (upperShadow > 0.4 && lowerShadow < 0.2) return 'Dragonfly Doji';
      else if (lowerShadow > 0.4 && upperShadow < 0.2) return 'Gravestone Doji';
      else return 'Doji';
    } else if (lowerShadow > 0.5 && upperShadow < 0.1) {
      return close > open ? 'Hammer' : 'Hanging Man';
    } else if (upperShadow > 0.5 && lowerShadow < 0.1) {
      return close < open ? 'Shooting Star' : 'Inverted Hammer';
    } else if (bodySize > 0.7) {
      return close > open ? 'Strong Bullish' : 'Strong Bearish';
    }

    return close > open ? 'Bullish' : 'Bearish';
  }

  /**
   * Obtiene estadísticas del análisis
   */
  getAnalysisStats() {
    const totalCalls = this.analysisStats.totalCalls || 1;
    
    return {
      ...this.analysisStats,
      gpuAvailable: this.gpuAvailable,
      successRate: `${((this.analysisStats.gpuSuccess / totalCalls) * 100).toFixed(1)}%`,
      cpuFallbackRate: `${((this.analysisStats.cpuFallback / totalCalls) * 100).toFixed(1)}%`,
      errorRate: `${((this.analysisStats.errors / totalCalls) * 100).toFixed(1)}%`,
    };
  }

  /**
   * Reinicia las estadísticas
   */
  resetStats() {
    this.analysisStats = {
      totalCalls: 0,
      gpuSuccess: 0,
      cpuFallback: 0,
      errors: 0,
    };
    console.log('📊 Estadísticas de análisis reiniciadas');
  }

  /**
   * Limpia recursos y previene memory leaks
   */
  cleanup() {
    // Limpiar arrays con límites
    if (this.volatilityHistory.length > this.MAX_VOLATILITY_HISTORY) {
      this.volatilityHistory = this.volatilityHistory.slice(-this.MAX_VOLATILITY_HISTORY);
    }
    
    if (this.recentCandles.length > this.MAX_RECENT_CANDLES) {
      this.recentCandles = this.recentCandles.slice(-this.MAX_RECENT_CANDLES);
    }

    // Limpiar referencias GPU si existe
    if (this.gpuEngine && typeof this.gpuEngine.cleanup === 'function') {
      this.gpuEngine.cleanup();
    }
  }
}

module.exports.MarketAnalyzer = MarketAnalyzer;

// ============================
// AREPA 7: Clase PlatformController
// ============================

class PlatformController {
  /**
   * Crea una instancia de PlatformController.
   * @param {object} page - Instancia de Puppeteer para interactuar con la UI.
   * @param {object} config - Objeto de configuración global.
   * @param {object} pipReceiver - Instancia de PipReceiver para obtener pips y activos.
   */
  constructor(page, config) {
    this.page = page;
    this.config = config;
    this.selectors = config.SELECTORS;
    this.lastValidPip = null;
    this.connectionCheckInterval = null;
    this.debugMode = true;
  }

  /**
   * Inicializa procedimientos periódicos, como la comprobación de conexión TCP.
   * @returns {Promise<boolean>}
   */
  async initialize() {
    this.connectionCheckInterval = setInterval(() => {
      const isConnected = this.pipReceiver.isConnected();
      if (!isConnected && this.debugMode) {
        console.log(
          '[PlatformController] Sin conexión TCP activa. El bot podría no recibir pips actualizados.'
        );
      }
    }, 30000);
    return true;
  }


  /**
   * Extrae el balance actual desde la UI del broker.
   * En modo simulación, retorna un balance simulado.
   * @returns {Promise<number|null>}
   */
  async readCurrentBalance() {
    try {
      await this.page.waitForSelector(this.selectors.BALANCE, {
        timeout: 1500,
      });
      return await this.page.$eval(this.selectors.BALANCE, (el) =>
        parseFloat(el.textContent.replace(/[^0-9\.]+/g, ''))
      );
    } catch (error) {
      console.warn(
        '[PlatformController] No se encontró el elemento de balance'
      );
      if (process.env.MOCK_PIPS === 'true') {
        const mockBalance = 1000 + Math.random() * 100;
        console.log(
          `[PlatformController] Usando balance simulado: ${mockBalance.toFixed(2)}`
        );
        return mockBalance;
      }
      return null;
    }
  }

  /**
   * Actualiza el valor del stake en la UI mediante escritura simulada (letra por letra).
   * @param {number} newStake - Nuevo valor para el stake.
   */
  async setStakeValue(newStake) {
    if (process.env.MOCK_PIPS === 'true') {
      console.log(
        `[PlatformController] Simulación: stake actualizado a ${newStake}`
      );
      return;
    }
    try {
      const inputSelector =
        'div.input-control.input-control--number.input-control--dark.input-control--text-left input.input-control__input';
      await this.page.evaluate((selector) => {
        const input = document.querySelector(selector);
        if (input) {
          input.removeAttribute('readonly');
          input.removeAttribute('disabled');
        }
      }, inputSelector);
      await this.page.focus(inputSelector);
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('A');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
      await this.page.keyboard.type(newStake.toString(), { delay: 100 });
      await this.page.evaluate((selector) => {
        const input = document.querySelector(selector);
        if (input) {
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, inputSelector);
      console.log(
        `[PlatformController] Stake actualizado a través de escritura simulada: ${newStake}`
      );
    } catch (error) {
      console.error(
        '[PlatformController] Error actualizando el valor del stake:',
        error
      );
    }
  }

  /**
   * Verifica que la página tenga elementos críticos de la interfaz de trading.
   * Si no se encuentran, recarga la página.
   * @returns {Promise<boolean>}
   */
  async ensurePageHealthy() {
    if (process.env.MOCK_PIPS === 'true') return true;
    try {
      const hasTradeUI =
        (await this.page.$(this.selectors.STAKE_INPUT)) !== null;
      if (!hasTradeUI) {
        console.warn(
          '[PlatformController] Interfaz de trading no encontrada; recargando...'
        );
        await this.page.reload({ waitUntil: 'networkidle2' });
        await Utils.delay(2000);
        return (await this.page.$(this.selectors.STAKE_INPUT)) !== null;
      }
      return true;
    } catch (error) {
      console.error(
        '[PlatformController] Error verificando el estado de la página:',
        error
      );
      return false;
    }
  }

  /**
   * Cambia el activo en la interfaz de usuario de forma asíncrona,
   * buscando elementos de la tabla y haciendo click en el activo correspondiente.
   * @param {string} newAssetName - El nombre del nuevo activo.
   * @returns {Promise<boolean>}
   */
  async changeActiveAsset(newAssetName) {
    if (process.env.MOCK_PIPS === 'true') {
      console.log(
        `[PlatformController] Simulación: cambio de activo a ${newAssetName}`
      );
      return true;
    }

    console.log(
      `[PlatformController] Iniciando cambio asíncrono de activo a: ${newAssetName}`
    );
    setImmediate(async () => {
      try {
        const assetPanelSelector = 'button.asset-select__button';
        await this.page.waitForSelector(assetPanelSelector, { timeout: 3000 });
        await this.page.click(assetPanelSelector);
        console.log('[PlatformController] Panel de activos abierto');
        await Utils.delay(2000);

        let assetElements;
        try {
          await this.page.waitForSelector('.assets-table', { timeout: 3000 });
          console.log('[PlatformController] Tabla de activos encontrada');
          assetElements = await this.page.$$('.assets-table__item');
          console.log(
            `[PlatformController] Se encontraron ${assetElements.length} elementos de activos`
          );
        } catch (err) {
          console.warn(
            '[PlatformController] Tabla de activos no encontrada:',
            err.message
          );
          return;
        }

        if (!assetElements || assetElements.length === 0) {
          console.warn(
            '[PlatformController] No se encontraron elementos de activos'
          );
          return;
        }

        let targetElement = null;
        function cleanAssetText(text) {
          if (!text || typeof text !== 'string') return '';
          let cleanText = text.trim();
          if (cleanText.includes('\n')) {
            cleanText = cleanText.split('\n')[0].trim();
          }
          const patterns = [
            /Añadido.*$/,
            /-?\d+\.\d+%.*$/,
            /\d+%.*$/,
            /\s+\d+%/,
            /\s+[-+]\d/,
          ];
          for (const pattern of patterns) {
            cleanText = cleanText.replace(pattern, '').trim();
          }
          return cleanText;
        }

        const cleanSearchName = cleanAssetText(newAssetName);
        console.log(
          `[PlatformController] Buscando activo limpio: "${cleanSearchName}"`
        );
        for (const element of assetElements) {
          try {
            const rawText = await element.evaluate((el) =>
              el.textContent?.trim()
            );
            if (rawText) {
              const cleanElementText = cleanAssetText(rawText);
              console.log(
                `[PlatformController] Elemento detectado: "${cleanElementText}"`
              );
              if (cleanElementText === cleanSearchName) {
                targetElement = element;
                console.log('[PlatformController] ¡Coincidencia encontrada!');
                break;
              }
            }
          } catch (err) {
            console.warn(
              '[PlatformController] Error al revisar elemento:',
              err.message
            );
            continue;
          }
        }

        if (targetElement) {
          await targetElement.click();
          console.log(`[PlatformController] Activo cambiado a ${newAssetName}`);
        } else {
          console.warn(
            `[PlatformController] Activo no encontrado: ${newAssetName}`
          );
        }
      } catch (error) {
        console.error(
          '[PlatformController] Error en cambio asíncrono de activo:',
          error.message
        );
      }
    });
    console.log(
      `[PlatformController] Cambio asíncrono iniciado para: ${newAssetName}`
    );
    return true;
  }

  /**
   * Detiene procesos internos, como intervalos de conexión.
   */
  stop() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
  }
}

module.exports.PlatformController = PlatformController;

// ============================
// AREPA 8: CandleLifecycleManager y TradingStrategy (VERSIÓN FERRARI)
// VERSIÓN CORREGIDA Y OPTIMIZADA
// ============================

class CandleLifecycleManager {
  constructor(config) {
    this.config = config;
    this.currentState = 'WAITING_FOR_CANDLE';
    this.currentCycle = null;
    this.stateTransitionLog = [];
    this.lastProcessedBoundary = 0;
    
    // Estados disponibles para el ciclo de vela
    this.STATES = {
      WAITING_FOR_CANDLE: 'WAITING_FOR_CANDLE',
      CANDLE_ACTIVE: 'CANDLE_ACTIVE',
      PRE_TRADE_WINDOW: 'PRE_TRADE_WINDOW',
      TRADE_EXECUTED: 'TRADE_EXECUTED',
      COLLECTING_CLOSE: 'COLLECTING_CLOSE',
      CANDLE_CLOSED: 'CANDLE_CLOSED',
    };
    
    // Precisión temporal usando high-resolution si está disponible
    this.timingPrecision = { 
      useHighResolution: true, 
      bufferMs: 50 
    };
  }

  getHighResTimestamp() {
    if (this.timingPrecision.useHighResolution && typeof performance !== 'undefined') {
      return performance.now() + performance.timeOrigin;
    }
    return Date.now();
  }

  calculateCandleBoundaries(now = null) {
    const timestamp = now || this.getHighResTimestamp();
    const candleDurationMs = 5 * 60 * 1000; // 5 minutos
    const currentBoundary = Math.floor(timestamp / candleDurationMs) * candleDurationMs;
    const nextBoundary = currentBoundary + candleDurationMs;
    const preTradeTime = nextBoundary - 3000; // 3 segundos antes del cierre
    
    return {
      start: currentBoundary,
      end: nextBoundary,
      preTradeTime: preTradeTime,
      duration: candleDurationMs,
      remaining: nextBoundary - timestamp,
    };
  }

  startNewCycle(openPip) {
    const boundaries = this.calculateCandleBoundaries();
    
    // Prevenir ciclos duplicados
    if (boundaries.start === this.lastProcessedBoundary) {
      console.warn(`[CandleLifecycle] Intento duplicado para boundary ${boundaries.start}`);
      return null;
    }
    
    this.currentCycle = {
      id: `candle_${boundaries.start}_${Math.random().toString(36).substr(2, 9)}`,
      boundaries: boundaries,
      openPip: openPip,
      openTime: this.getHighResTimestamp(),
      ticks: [],
      tickAggregation: { 
        min: openPip, 
        max: openPip, 
        last: openPip, 
        count: 0 
      },
      tradeExecuted: false,
      tradeTimestamp: null,
      decision: null,
      closePip: null,
      closeTime: null,
      state: this.STATES.CANDLE_ACTIVE,
    };
    
    this.lastProcessedBoundary = boundaries.start;
    this.transitionTo(this.STATES.CANDLE_ACTIVE);
    
    console.log(`[CandleLifecycle] Nuevo ciclo iniciado: ${this.currentCycle.id}`);
    console.log(`[CandleLifecycle] Boundaries: ${new Date(boundaries.start).toLocaleTimeString()} - ${new Date(boundaries.end).toLocaleTimeString()}`);
    console.log(`[CandleLifecycle] Pre-trade: ${new Date(boundaries.preTradeTime).toLocaleTimeString()}`);
    
    return this.currentCycle;
  }

  transitionTo(newState) {
    const oldState = this.currentState;
    
    if (!this.isValidTransition(oldState, newState)) {
      console.error(`[CandleLifecycle] Transición inválida: ${oldState} → ${newState}`);
      return false;
    }
    
    this.currentState = newState;
    this.stateTransitionLog.push({
      from: oldState,
      to: newState,
      timestamp: this.getHighResTimestamp(),
      cycleId: this.currentCycle ? this.currentCycle.id : null,
    });
    
    console.log(`[CandleLifecycle] Estado: ${oldState} → ${newState}`);
    return true;
  }

  isValidTransition(from, to) {
    const validTransitions = {
      WAITING_FOR_CANDLE: ['CANDLE_ACTIVE'],
      CANDLE_ACTIVE: ['PRE_TRADE_WINDOW'],
      PRE_TRADE_WINDOW: ['TRADE_EXECUTED'],
      TRADE_EXECUTED: ['COLLECTING_CLOSE'],
      COLLECTING_CLOSE: ['CANDLE_CLOSED'],
      CANDLE_CLOSED: ['WAITING_FOR_CANDLE'],
    };
    
    return validTransitions[from] ? validTransitions[from].includes(to) : false;
  }

  addTick(pipData) {
    if (!this.currentCycle || this.currentState === this.STATES.CANDLE_CLOSED) {
      return false;
    }
    
    const tick = {
      time: pipData.timestamp || this.getHighResTimestamp(),
      pip: pipData.pip,
      sequence: pipData.sequence,
      candleId: pipData.candleId,
    };
    
    this.currentCycle.ticks.push(tick);
    
    // Actualizar agregación
    const agg = this.currentCycle.tickAggregation;
    agg.min = Math.min(agg.min, pipData.pip);
    agg.max = Math.max(agg.max, pipData.pip);
    agg.last = pipData.pip;
    agg.count++;
    
    return true;
  }

  markTradeExecuted(decision, timestamp = null) {
    if (!this.currentCycle || this.currentCycle.tradeExecuted) {
      console.warn('[CandleLifecycle] Trade ya ejecutado o ciclo inexistente.');
      return false;
    }
    
    this.currentCycle.tradeExecuted = true;
    this.currentCycle.tradeTimestamp = timestamp || this.getHighResTimestamp();
    this.currentCycle.decision = decision;
    
    this.transitionTo(this.STATES.TRADE_EXECUTED);
    this.transitionTo(this.STATES.COLLECTING_CLOSE);
    
    return true;
  }

  finalizeCycle(closePip) {
    if (!this.currentCycle) return null;
    
    this.currentCycle.closePip = closePip;
    this.currentCycle.closeTime = this.getHighResTimestamp();
    
    const finalizedCycle = {
      ...this.currentCycle,
      candle: {
        open: this.currentCycle.openPip,
        high: this.currentCycle.tickAggregation.max,
        low: this.currentCycle.tickAggregation.min,
        close: closePip,
        timestamp: new Date(this.currentCycle.boundaries.end),
      },
    };
    
    this.transitionTo(this.STATES.CANDLE_CLOSED);
    this.transitionTo(this.STATES.WAITING_FOR_CANDLE);
    this.currentCycle = null;
    
    return finalizedCycle;
  }

  getCurrentStatus() {
    if (!this.currentCycle) {
      return {
        state: this.currentState,
        cycle: null,
      };
    }
    
    const now = this.getHighResTimestamp();
    return {
      state: this.currentState,
      cycleId: this.currentCycle.id,
      tickCount: this.currentCycle.ticks.length,
      timeToClose: Math.max(0, this.currentCycle.boundaries.end - now),
      tradeExecuted: this.currentCycle.tradeExecuted,
    };
  }

  cleanup() {
    this.currentCycle = null;
    this.stateTransitionLog = [];
    this.currentState = this.STATES.WAITING_FOR_CANDLE;
  }
}

// ===============================================
// TRADING STRATEGY - VERSIÓN OPTIMIZADA
// ===============================================

class TradingStrategy {
  constructor(platform, analyzer, dashboard, dataManager, config, systemHealthMonitor, webSocketTrader) {
	  // --- NUEVO CÓDIGO PARA MANEJAR REDIS ---
this.redisSubscriber = null; // Guardará nuestra conexión
this.redisChannel = 'pip_stream'; // El nombre de la autopista que vamos a escuchar
this.lastPip = 1.0; // Memoria para el último pip recibido
this.activeAsset = 'INICIALIZANDO'; // Memoria para el activo actual
// --- code nuevo agregado en la actualizacion 26-06-2025 a las 22:51
    // Validación de dependencias
    if (!platform || !analyzer || !dashboard || !dataManager || !config || !webSocketTrader) {
      throw new Error('TradingStrategy: Faltan dependencias críticas');
    }

    // Dependencias principales
    this.platform = platform;
    this.analyzer = analyzer;
    this.dashboard = dashboard;
    this.dataManager = dataManager;
    this.config = config;
    this.systemHealthMonitor = systemHealthMonitor;
    this.webSocketTrader = webSocketTrader;

    // Gestores internos
    this.candleLifecycle = new CandleLifecycleManager(config);
    this.mlModel = null; // Se inicializa async

    // Estado de la estrategia
    this.strategyStats = {
      initialBalance: null,
      currentBalance: null,
      wins: 0,
      losses: 0,
      galeLevel: 0,
      startTime: new Date().toISOString(),
    };

    // Control de ejecución
    this.strategyRunning = false;
    this.firstTradeCompleted = false;

    // Gestión de eventos y timers
    this.pipSubscription = null;
    this.preTradeTimer = null;
    this.closeCycleTimer = null;

    // Gestión de trades pendientes (con límite)
    this.pendingTrades = new Map();
    this.MAX_PENDING_TRADES = 10;

    // Pesos adaptativos para señales
    this.adaptiveWeights = { 
      technical: 0.4, 
      ml: 0.3, 
      velocity: 0.3,
      subCandle: 0.2 
    };

    // Historial de trades recientes (con límite)
    this.recentTrades = [];
    this.maxRecentTrades = 20;

    // Cache de datos
    this.tempCandle = null;
    this.prevManipulatedCandle = null;
    this.lastTradeSignals = null;

    console.log('TradingStrategy inicializada (Motor Ferrari v2.0)');
  }

  /**
   * Inicialización asíncrona
   */
  async initialize() {
    try {
      // Inicializar ML Model
      const { MLModel } = require('./MLModel');
      this.mlModel = new MLModel(this.config);
      await this.mlModel.loadModel();

      // Obtener balance inicial
      this.strategyStats.initialBalance = await this.platform.readCurrentBalance();
      
      // Suscribirse a eventos de pip
// --- NUEVO CÓDIGO DE SUSCRIPCIÓN A REDIS ---
// Agregado en el paso anterior, solo para referencia
// this.redisSubscriber = null;
// this.redisChannel = 'pip_stream';

this.redisSubscriber = redis.createClient();
this.redisSubscriber.on('error', (err) => console.error('❌ Redis Subscriber Error', err));

await this.redisSubscriber.connect();

console.log(`[TradingStrategy] ✅ Suscrito a la autopista de datos: ${this.redisChannel}`);

// Empezamos a escuchar los mensajes de pips desde el canal de Redis
await this.redisSubscriber.subscribe(this.redisChannel, (message) => {
    try {
        // Los datos vienen como texto, los convertimos de nuevo a un objeto
        const pipData = JSON.parse(message);
        // Pasamos los datos a la función que ya sabe qué hacer con ellos
        this.handleNewPip(pipData);
    } catch (e) {
        console.error('Error al procesar el pip recibido de Redis:', e);
    }
});
// --- code nuevo agregado en la actualizacion 26-06-2025 a las 22:51

      return true;
    } catch (error) {
      console.error('Error inicializando TradingStrategy:', error);
  } }

/**
   * Maneja nuevos pips recibidos.
   * La única responsabilidad ahora es añadir el pip al ciclo y al humanizer.
   */
  handleNewPip(pipData) {
	  this.lastPip = pipData.pip; // Actualizamos la memoria con el pip más reciente
	  // Actualizamos la memoria del activo si la información viene en el paquete de datos
if (pipData && pipData.asset) {
    this.activeAsset = pipData.asset;
}
    if (!this.candleLifecycle.currentCycle || !pipData) return;

    // Actualizar humanizer (esto es parte de la lógica del bot, se queda)
    if (pipData && typeof pipData.pip === 'number') {
      humanizer.addPip(pipData.pip);
    }

    // Añadir tick al ciclo actual para el análisis final (esencial para la estrategia)
    this.candleLifecycle.addTick(pipData);
  }
  /**
   * Inicia la estrategia de trading
   */
  async start() {
    if (this.strategyRunning) {
      console.warn('La estrategia ya está en ejecución');
      return false;
    }

    try {
      // Verificar inicialización
      if (!this.mlModel) {
        await this.initialize();
      }

      console.log('🚀 Iniciando TradingStrategy (Motor Ferrari)...');
      this.strategyRunning = true;

      // Iniciar el primer ciclo de vela
      await this.initializeNewCandleCycle();
      
      return true;
    } catch (error) {
      console.error('Error iniciando estrategia:', error);
      this.strategyRunning = false;
      return false;
    }
  }

  /**
   * Detiene la estrategia de trading
   */
  async stop() {
    console.log('🛑 Deteniendo TradingStrategy...');
    this.strategyRunning = false;

    // Limpiar timers
    this.clearTimers();

    // Desuscribir eventos
// --- NUEVO CÓDIGO DE DESCONEXIÓN DE REDIS ---
if (this.redisSubscriber) {
  // Si estamos suscritos a la autopista, nos desconectamos de forma segura.
  this.redisSubscriber.quit();
  this.redisSubscriber = null;
  console.log('[TradingStrategy] 🔌 Desconectado de la autopista Redis.');
}
// --- code nuevo agregado en la actualizacion 26-06-2025 a las 22:51

    // Limpiar pendientes
    this.pendingTrades.clear();

    // Limpiar lifecycle
    this.candleLifecycle.cleanup();

    console.log('✅ TradingStrategy detenida.');
  }

  /**
   * Limpia todos los timers activos
   */
  clearTimers() {
    if (this.preTradeTimer) {
      clearTimeout(this.preTradeTimer);
      this.preTradeTimer = null;
    }
    if (this.closeCycleTimer) {
      clearTimeout(this.closeCycleTimer);
      this.closeCycleTimer = null;
    }
  }

  /**
   * Inicializa un nuevo ciclo de vela
   */
  async initializeNewCandleCycle(openPip = null) {
    try {
      console.log('============================================================');
      console.log('🕯️ INICIANDO NUEVO CICLO DE VELA (MODO EVENTOS)');
      console.log('============================================================');

      if (!this.strategyRunning) {
        console.log('[EventChain] Estrategia detenida, no se inicia nuevo ciclo.');
        return;
      }

      // Limpiar timers anteriores por seguridad
      this.clearTimers();

      // Obtener pip de apertura
      const finalOpenPip = openPip || await this.platform.readCurrentPip();
      const cycle = this.candleLifecycle.startNewCycle(finalOpenPip);

      if (!cycle) {
        console.warn('[EventChain] No se pudo iniciar un nuevo ciclo. Reintentando en 1s...');
        setTimeout(() => this.initializeNewCandleCycle().catch(console.error), 1000);
        return;
      }
      // Programar eventos con alta precisión
      this.scheduleTradeEvents(cycle);

    } catch (error) {
      console.error('[InitCycle] Error grave:', error);
      
      // Reintentar después de un delay
      setTimeout(() => {
        if (this.strategyRunning) {
          this.initializeNewCandleCycle().catch(console.error);
        }
      }, 5000);
    }
  }

  /**
   * Programa los eventos del ciclo de trading
   */
  scheduleTradeEvents(cycle) {
    const now = this.candleLifecycle.getHighResTimestamp();
    const timeToPreTrade = cycle.boundaries.preTradeTime - now;
    const timeToClose = cycle.boundaries.end - now;

    // Programar ventana de pre-trade
    if (timeToPreTrade > 0) {
      console.log(`[EventScheduler] Pre-trade en ${timeToPreTrade.toFixed(0)}ms`);
      this.preTradeTimer = setTimeout(() => {
        this.enterPreTradeWindow().catch(console.error);
      }, timeToPreTrade);
    }

    // Programar cierre del ciclo
    if (timeToClose > 0) {
      console.log(`[EventScheduler] Cierre en ${timeToClose.toFixed(0)}ms`);
      this.closeCycleTimer = setTimeout(() => {
        this.finalizeCandleCycle().catch(console.error);
      }, timeToClose);
    } else {
      console.error(`[EventScheduler] Error: tiempo de cierre inválido (${timeToClose.toFixed(0)}ms)`);
      setImmediate(() => this.finalizeCandleCycle().catch(console.error));
    }
  }

  /**
   * Entrada a la ventana de pre-trade
   */
  async enterPreTradeWindow() {
    try {
      const cycle = this.candleLifecycle.currentCycle;
      if (!cycle || cycle.tradeExecuted) return;

      console.log('====================================');
      console.log('⏰ ENTRANDO EN VENTANA DE PRE-TRADE');
      console.log('====================================');

      this.candleLifecycle.transitionTo('PRE_TRADE_WINDOW');

      // Ejecutar análisis completo
      const tradeDecision = await this.performTradeAnalysis(cycle);

      if (!tradeDecision) {
        console.log('[PreTrade] Análisis no produjo decisión válida');
        return;
      }

      // Ejecutar trade si es válido
      if (tradeDecision.execute) {
        await this.executeTrade(tradeDecision, cycle);
      } else {
        console.log(`[PreTrade] Trade omitido: ${tradeDecision.reason}`);
        
        // Marcar como procesado aunque no se ejecute
        cycle.tradeExecuted = true;
        cycle.decision = 'NO_TRADE';
      }

    } catch (error) {
      console.error('[PreTradeWindow] Error:', error);
    }
  }

  /**
   * Realiza análisis completo para decisión de trade
   */
  async performTradeAnalysis(cycle) {
    try {
      // Obtener datos actuales
      const tradePip = await this.platform.readCurrentPip();
      const openPip = cycle.openPip;
      
      // Actualizar agregación con el pip actual
      cycle.tickAggregation.min = Math.min(cycle.tickAggregation.min, tradePip);
      cycle.tickAggregation.max = Math.max(cycle.tickAggregation.max, tradePip);
      cycle.tickAggregation.last = tradePip;

      // 1. Análisis técnico
      const technicalSignal = await this.analyzer.predictNextCandleSignal(
        openPip,
        [...cycle.ticks],
        cycle.boundaries.end - 3000
      );
      
      if (!technicalSignal) {
        console.error('[Analysis] Señal técnica nula');
        return null;
      }


      // 2. Análisis de subvelas (2 segundos)
      const subCandles = subCandleBuilder.getLastSubCandles(5);
      const { classifySubCandlePattern } = require('./MLModel');
      const subCandlePatternName = classifySubCandlePattern(subCandles);
      

      const subCandleSignal = this.analyzer.predictSubCandlePattern();


      // 3. Análisis ML
      this.tempCandle = {
        open: openPip,
        high: cycle.tickAggregation.max,
        low: cycle.tickAggregation.min,
        close: tradePip,
        timestamp: new Date(cycle.boundaries.end),
      };

      const marketContext = {};
      const { createPatternFingerprint } = require('./MLModel');
      const patternFingerprint = createPatternFingerprint(
        this.tempCandle,
        [...cycle.ticks],
        marketContext,
        null,
        {
          subCandleData: subCandles,
          preCalculatedSubCandlePattern: subCandlePatternName,
        }
      );

      const mlPrediction = await this.mlModel.predictReaction(patternFingerprint, marketContext);

      // 4. Análisis de velocidad
      const velocityMetrics = await this.analyzer.calculateVelocityMetrics([...cycle.ticks]);
      
      if (velocityMetrics && velocityMetrics.velocityPattern) {
      }

      // 5. Combinar señales
      const combinedSignal = this.combineSignals(
        technicalSignal,
        mlPrediction,
        velocityMetrics,
        subCandleSignal
      );

      // 6. Aplicar filtro HUMANIZER
      const humanizerDecision = humanizer.getDecision(combinedSignal);
      
      // Logging del diagnóstico
      console.log(
        `[HUMANIZER] Sentimiento: ${humanizerDecision.sentimiento} | ` +
        `Diagnóstico: ${humanizerDecision.diagnostico} | ` +
        `Confianza: ${Math.round(humanizerDecision.confianza * 100)}% | ` +
        `Motivo: ${humanizerDecision.motivo}`
      );

      // Decidir si ejecutar el trade
      if (!humanizerDecision.operar) {
        // Notificar cancelación
        if (global.telegramNotifier) {
          await global.telegramNotifier.sendMessage(
            `🚫 *Trade Omitido por HUMANIZER*\n` +
            `Motivo: ${humanizerDecision.motivo}\n` +
            `Sentimiento: ${humanizerDecision.sentimiento}\n` +
            `Diagnóstico: ${humanizerDecision.diagnostico}\n` +
            `Confianza: ${Math.round(humanizerDecision.confianza * 100)}%`
          );
        }
        
        return {
          execute: false,
          reason: humanizerDecision.motivo,
          humanizerDiagnosis: humanizerDecision
        };
      }

      // Si HUMANIZER invierte la señal
      if (humanizerDecision.sentido !== combinedSignal) {
      }

      // Generar reporte de decisión
      const decisionReport = this.generateDecisionReport(
        tradePip,
        openPip,
        technicalSignal,
        mlPrediction,
        humanizerDecision.sentido
      );
      console.log(decisionReport);

      return {
        execute: true,
        signal: humanizerDecision.sentido,
        tradePip,
        openPip,
        technicalSignal,
        mlPrediction,
        velocityMetrics,
        subCandleSignal,
        subCandlePatternName,
        humanizerDiagnosis: humanizerDecision,
        patternFingerprint,
        marketContext,
        subCandles,
        decisionReport
      };

    } catch (error) {
      console.error('[performTradeAnalysis] Error:', error);
      return null;
    }
  }

  /**
   * Ejecuta el trade
   */
  async executeTrade(decision, cycle) {
    try {
      // Calcular stake con Martingala
      const stake = this.calculateStake();
      const activeAsset = await this.platform.getActiveAsset();
      const normalizedAsset = this.normalizeAssetName(activeAsset);
      const brokerAction = decision.signal === 'green' ? 'call' : 'put';

      console.log('🎯 Ejecutando trade:', {
        asset: normalizedAsset,
        amount: stake,
        action: brokerAction,
        isDemo: this.config.STRATEGY.DRY_RUN ? 1 : 0
      });

      // Configurar orden
      const ordenConfig = {
        asset: normalizedAsset,
        amount: stake,
        action: brokerAction,
        time: 5,
        isDemo: this.config.STRATEGY.DRY_RUN ? 1 : 0,
        tournamentId: 0,
        optionType: 100
      };

      // Enviar orden vía WebSocket
      const requestId = await this.webSocketTrader.enviarOrden(ordenConfig);
      
      // Marcar trade como ejecutado
      this.candleLifecycle.markTradeExecuted(decision.signal);
      

      // Preparar datos del trade
      const balanceBefore = await this.platform.readCurrentBalance();
      const tradeData = {
        decision: decision.signal,
        cycleId: cycle.id,
        candle: this.tempCandle,
        tickData: [...cycle.ticks],
        marketContext: decision.marketContext,
        subCandleData: decision.subCandles,
        result: 'pending',
        profit: 0,
        balanceBefore: balanceBefore,
        balanceAfter: balanceBefore,
        entryPip: decision.tradePip,
        exitPip: null,
        isWin: false,
        timestamp: new Date().toISOString(),
        galeLevel: this.strategyStats.galeLevel,
        velocityMetrics: decision.velocityMetrics,
        mlPrediction: decision.mlPrediction,
        decisionReport: decision.decisionReport,
        patternFingerprint: decision.patternFingerprint,
        humanizerDiagnosis: decision.humanizerDiagnosis,
        subCandlePatternName: decision.subCandlePatternName,
        technicalSignal: decision.technicalSignal,
        stake: stake,
        requestId: requestId
      };

      // Registrar trade pendiente
      const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.registerPendingTrade(tradeId, tradeData);

      // Evaluar resultado después de 10 segundos
      this.evaluateTradeResultAsync(balanceBefore, decision.signal, tradeId);

      // Actualizar estadísticas
      await this.updateStats();

      if (!this.firstTradeCompleted) {
        this.firstTradeCompleted = true;
      }

    } catch (error) {
      console.error('[executeTrade] Error:', error);
      throw error;
    }
  }

  /**
   * Finaliza el ciclo de vela actual
   */
  async finalizeCandleCycle() {
    try {
      console.log('[FinalizeCycle] Finalizando ciclo de vela...');
      
      const cycle = this.candleLifecycle.currentCycle;
      if (!cycle) {
        console.warn('[FinalizeCycle] No hay ciclo actual para finalizar');
        setImmediate(() => this.initializeNewCandleCycle().catch(console.error));
        return;
      }

      // Obtener pip de cierre
      let closePip;
      if (cycle.tickAggregation && typeof cycle.tickAggregation.last === 'number') {
        closePip = cycle.tickAggregation.last;
      } else {
        try {
          closePip = await this.platform.readCurrentPip();
          console.warn(`[FinalizeCycle] Usando fallback readCurrentPip: ${closePip}`);
        } catch (error) {
          console.error('[FinalizeCycle] Error obteniendo pip de cierre:', error);
          closePip = cycle.openPip; // Último recurso
        }
      }

      // Finalizar ciclo
      const finalizedCycle = this.candleLifecycle.finalizeCycle(closePip);
      
      if (!finalizedCycle) {
        console.error('[FinalizeCycle] Error finalizando ciclo');
        setImmediate(() => this.initializeNewCandleCycle().catch(console.error));
        return;
      }

      // Actualizar dashboard
      await this.dashboard.updateChart(finalizedCycle.candle);

      // Pasar estafeta al siguiente ciclo
      console.log(`[EventChain] Fin del ciclo ${cycle.id}. Iniciando siguiente...`);
      setImmediate(() => this.initializeNewCandleCycle(closePip).catch(console.error));

    } catch (error) {
      console.error('[FinalizeCycle] Error grave:', error);
      
      // Forzar reinicio del bucle
      setImmediate(() => this.initializeNewCandleCycle().catch(console.error));
    }
  }

  /**
   * Calcula el stake actual con Martingala
   */
  calculateStake() {
    return this.config.STRATEGY.BASE_STAKE * 
           Math.pow(this.config.SELECTORS.GALE_MULTIPLIER, this.strategyStats.galeLevel);
  }

  /**
   * Normaliza el nombre del activo
   */
  normalizeAssetName(assetName) {
    if (typeof assetName !== 'string' || !assetName) {
      console.error('[Normalize] Nombre de activo inválido:', assetName);
      return 'ASSET_ERROR';
    }

    // Limpiar y normalizar
    let cleanName = assetName.toLowerCase()
      .replace(/\s/g, '')
      .replace(/\//g, '')
      .replace(/[()]/g, '');

    // Manejar caso OTC
    if (cleanName.endsWith('otc')) {
      cleanName = cleanName.replace('otc', '_otc');
    }

    // Formatear resultado
    const parts = cleanName.split('_');
    if (parts.length === 2) {
      return `${parts[0].toUpperCase()}_${parts[1]}`;
    }

    return cleanName.toUpperCase();
  }

  /**
   * Registra un trade pendiente con límite
   */
  registerPendingTrade(tradeId, tradeData) {
    // Limpiar trades antiguos si se alcanza el límite
    if (this.pendingTrades.size >= this.MAX_PENDING_TRADES) {
      const oldestKey = this.pendingTrades.keys().next().value;
      this.pendingTrades.delete(oldestKey);
      console.warn(`[PendingTrades] Límite alcanzado, eliminando trade antiguo: ${oldestKey}`);
    }

    this.pendingTrades.set(tradeId, tradeData);
  }

  /**
   * Evalúa el resultado del trade de forma asíncrona
   */
  evaluateTradeResultAsync(balanceBefore, decision, tradeId) {
    setTimeout(async () => {
      try {
        const tradeData = this.pendingTrades.get(tradeId);
        if (!tradeData) {
          console.warn(`[EvaluateResult] Trade no encontrado: ${tradeId}`);
          return;
        }

        // Obtener balance actual
        const currentBalance = await this.platform.readCurrentBalance();
        const diff = currentBalance - balanceBefore;
        
        // Determinar resultado
        let outcome, isWin;
        if (diff > 0) {
          outcome = 'win';
          isWin = true;
          this.strategyStats.wins++;
        } else if (diff < 0) {
          outcome = 'loss';
          isWin = false;
          this.strategyStats.losses++;
        } else {
          outcome = 'neutral';
          isWin = false;
        }

        // Actualizar datos del trade
        tradeData.result = outcome;
        tradeData.isWin = isWin;
        tradeData.profit = diff;
        tradeData.balanceAfter = currentBalance;

        // Guardar en historial reciente
        this.addToRecentTrades(tradeData);

        // Actualizar modelo ML
        this.updateMLModelAsync(tradeData);

        // Enviar reporte a Telegram
        await this.sendTradeReport(tradeData, balanceBefore, currentBalance);

        // Actualizar stake según resultado
        await this.updateStakeAfterTrade(outcome);

        // Eliminar de pendientes
        this.pendingTrades.delete(tradeId);

      } catch (error) {
        console.error('[EvaluateResult] Error:', error);
        // Asegurar limpieza del trade pendiente
        this.pendingTrades.delete(tradeId);
      }
    }, 10000); // 10 segundos
  }

  /**
   * Añade trade al historial reciente con límite
   */
  addToRecentTrades(tradeData) {
    this.recentTrades.push({ ...tradeData });
    
    // Mantener límite
    while (this.recentTrades.length > this.maxRecentTrades) {
      this.recentTrades.shift();
    }
  }

  /**
   * Actualiza el modelo ML con el resultado del trade
   */
  async updateMLModelAsync(tradeData) {
    try {
      console.log(`=== ACTUALIZANDO ML PARA TRADE ${tradeData.decision.toUpperCase()} ===`);
      console.log(`Resultado: ${tradeData.result} | Profit: ${tradeData.profit}`);
      
      
      await this.mlModel.updateModel(tradeData);
      

      // Mostrar estadísticas cada 10 trades
      if (this.mlModel.trainingData && this.mlModel.trainingData.length % 10 === 0) {
        const stats = this.mlModel.getPatternStats();
        console.log('=== ESTADÍSTICAS DE PATRONES ===');
        
        Object.entries(stats).forEach(([pattern, data]) => {
          const successRate = data.total > 0 
            ? ((data.wins / data.total) * 100).toFixed(1) 
            : 0;
          console.log(
            `${pattern}: ${data.wins}W/${data.losses}L (${successRate}% éxito, ${data.total} total)`
          );
        });
      }
    } catch (error) {
      console.error('Error actualizando modelo ML:', error);
    }
  }

  /**
   * Envía reporte del trade a Telegram
   */
  async sendTradeReport(tradeData, balanceBefore, currentBalance) {
    if (!global.telegramNotifier) return;

    try {
      const activeAsset = this.activeAsset; // Usamos nuestra memoria interna
      const rentabilidad = (((currentBalance - balanceBefore) / balanceBefore) * 100).toFixed(2) + '%';
      const outcomeEmoji = tradeData.result === 'win' ? '✅' : tradeData.result === 'loss' ? '❌' : '⚪';

      // Preparar mensaje humanizer
      const humanizerDiag = tradeData.humanizerDiagnosis || {};
      const humanizerMsg = 
        `\n\n🤖 *Diagnóstico HUMANIZER:*\n` +
        `  Sentimiento: ${humanizerDiag.sentimiento || 'N/A'}\n` +
        `  Diagnóstico: ${humanizerDiag.diagnostico || 'N/A'}\n` +
        `  Confianza: ${Math.round((humanizerDiag.confianza || 0) * 100)}%\n` +
        `  Motivo: ${humanizerDiag.motivo || 'N/A'}`;

      // Preparar mensaje de subvelas
      let subCandleMsg = '\nVelas 2s:\n';
      if (tradeData.subCandlePatternName) {
        subCandleMsg += `🎯 PATRÓN: ${tradeData.subCandlePatternName.toUpperCase().replace(/_/g, ' ')}\n\n`;
      }

      // Obtener métricas del sistema
      let systemMetrics = '';
      if (this.systemHealthMonitor) {
        const eventLoop = this.systemHealthMonitor.checkEventLoop();
        const memory = this.systemHealthMonitor.checkMemoryUsage();
        
        systemMetrics = 
          `\n--- Métricas del Sistema ---\n` +
          `Latencia Event Loop: ${eventLoop ? eventLoop.delay : 'N/A'} ms\n` +
          `Uso de Heap: ${memory ? (memory.heap.used / (1024 * 1024)).toFixed(2) : 'N/A'} MB\n` +
          `Memoria RSS: ${memory ? (memory.rss / (1024 * 1024)).toFixed(2) : 'N/A'} MB`;
      }

      // Construir mensaje completo
      const message = 
        `Activo: ${activeAsset}\n` +
        `Resultado: ${outcomeEmoji}\n` +
        `Balance anterior: ${balanceBefore.toFixed(2)}\n` +
        `Balance actual: ${currentBalance.toFixed(2)}\n` +
        `Rentabilidad: ${rentabilidad}\n` +
        `Gale: ${this.strategyStats.galeLevel}\n` +
        `Apertura: ${this.tempCandle.open.toFixed(5)}\n` +
        `Cierre: ${this.tempCandle.close.toFixed(5)}\n` +
        `Mínimo: ${this.tempCandle.low.toFixed(5)}\n` +
        `Máximo: ${this.tempCandle.high.toFixed(5)}\n` +
        `Volumen ticks: ${tradeData.tickData.length}\n` +
        `Velocidad: ${tradeData.velocityMetrics ? tradeData.velocityMetrics.avgVelocity.toFixed(4) + ' µ/ms' : 'N/A'}\n` +
        `${subCandleMsg}` +
        `${humanizerMsg}` +
        `${systemMetrics}`;

      await telegramNotifier.sendMessage(message);
    } catch (error) {
      console.error('[sendTradeReport] Error:', error);
    }
  }

  /**
   * Actualiza el stake después del trade
   */
  async updateStakeAfterTrade(result) {
    if (result === 'win') {
      this.strategyStats.galeLevel = 0;
    } else if (result === 'loss') {
      if (this.strategyStats.galeLevel < this.config.STRATEGY.MAX_GALE_LEVEL) {
        this.strategyStats.galeLevel++;
      } else {
        this.strategyStats.galeLevel = 0;
      }
    }

    const newStake = this.calculateStake();
    console.log(`✅ Nuevo stake: ${newStake} (Gale Level: ${this.strategyStats.galeLevel})`);
    
    await this.platform.setStakeValue(newStake);
  }

  /**
   * Actualiza las estadísticas en el dashboard
   */
  async updateStats() {
    this.strategyStats.currentBalance = await this.platform.readCurrentBalance();
    const activeAsset = this.activeAsset; // Usamos nuestra memoria interna
    
    await this.dashboard.updateStats({
      initialBalance: this.strategyStats.initialBalance,
      currentBalance: this.strategyStats.currentBalance,
      startTime: this.strategyStats.startTime,
      wins: this.strategyStats.wins,
      losses: this.strategyStats.losses,
      galeLevel: this.strategyStats.galeLevel,
      previousCandle: this.analyzer.prevCandle,
      manipulatedCandle: this.prevManipulatedCandle || null,
      activeAsset: activeAsset,
    });
  }

  /**
   * Combina las señales de diferentes indicadores
   */
  combineSignals(technicalSignal, mlPrediction, velocityMetrics, subCandleSignal) {
    // Actualizar pesos adaptativos
    this.updateAdaptiveWeights();
    
    let scores = { green: 0, red: 0 };

    // 1. Señal técnica
    if (technicalSignal === 'green') {
      scores.green += this.adaptiveWeights.technical;
    } else {
      scores.red += this.adaptiveWeights.technical;
    }
    

    // 2. Señal ML
    if (mlPrediction.decision && mlPrediction.confidence > 0.3) {
      const mlContribution = this.adaptiveWeights.ml * mlPrediction.confidence;
      if (mlPrediction.decision === 'green') {
        scores.green += mlContribution;
      } else {
        scores.red += mlContribution;
      }
    }

    // 3. Señal de velocidad
    if (velocityMetrics && velocityMetrics.velocityPattern) {
      const velocityAnalysis = this.analyzeVelocitySignal(technicalSignal, velocityMetrics);
      
      if (velocityAnalysis.signal) {
        const velocityContribution = this.adaptiveWeights.velocity * velocityAnalysis.confidence;
        
        if (velocityAnalysis.signal === 'green') {
          scores.green += velocityContribution;
        } else {
          scores.red += velocityContribution;
        }

      }
    }

    // 4. Señal de subvelas
    if (subCandleSignal) {
      const subCandleWeight = this.adaptiveWeights.subCandle || 0.2;
      
      if (subCandleSignal === 'green') {
        scores.green += subCandleWeight;
      } else if (subCandleSignal === 'red') {
        scores.red += subCandleWeight;
      }
      
    }

    // Decisión final
    const finalDecision = scores.green > scores.red ? 'green' : 'red';
    const confidence = Math.abs(scores.green - scores.red) / (scores.green + scores.red);

    // Guardar señales para referencia
    this.lastTradeSignals = {
      technical: technicalSignal,
      ml: mlPrediction.decision,
      mlConfidence: mlPrediction.confidence,
      velocity: velocityMetrics ? velocityMetrics.velocityPattern : 'N/A',
      subCandle: subCandleSignal,
      final: finalDecision,
      timestamp: Date.now(),
    };



    return finalDecision;
  }

  /**
   * Analiza la señal de velocidad
   */
  analyzeVelocitySignal(technicalSignal, velocityMetrics) {
    let velocitySignal = null;
    let velocityConfidence = 0;

    switch (velocityMetrics.velocityPattern) {
      case 'explosive':
      case 'accelerating':
        velocitySignal = technicalSignal;
        velocityConfidence = 0.8;
        break;
      
      case 'decelerating':
        velocitySignal = technicalSignal === 'green' ? 'red' : 'green';
        velocityConfidence = 0.7;
        break;
      
      case 'steady':
        velocitySignal = technicalSignal;
        velocityConfidence = 0.5;
        break;
      
      case 'erratic':
        velocitySignal = null;
        velocityConfidence = 0.2;
        break;
    }

    // Ajustar confianza basada en consistencia
    if (velocityMetrics.velocityConsistency > 0.7) {
      velocityConfidence = Math.min(1.0, velocityConfidence + 0.2);
    }

    return { signal: velocitySignal, confidence: velocityConfidence };
  }

  /**
   * Actualiza los pesos adaptativos basados en el rendimiento
   */
  updateAdaptiveWeights() {
    if (this.recentTrades.length < 5) return;

    const performance = {
      technical: { wins: 0, total: 0 },
      ml: { wins: 0, total: 0 },
      velocity: { wins: 0, total: 0 },
    };

    // Analizar rendimiento de cada señal
    this.recentTrades.forEach((trade) => {
      if (trade.technicalSignal) {
        performance.technical.total++;
        if (trade.technicalSignal === trade.decision && trade.result === 'win') {
          performance.technical.wins++;
        }
      }

      if (trade.mlPrediction && trade.mlPrediction.confidence > 0.3) {
        performance.ml.total++;
        if (trade.mlPrediction.decision === trade.decision && trade.result === 'win') {
          performance.ml.wins++;
        }
      }

      if (trade.velocityMetrics && trade.velocityMetrics.velocityPattern) {
        performance.velocity.total++;
        // Aquí deberías tener la lógica para verificar si la señal de velocidad fue correcta
      }
    });

    // Calcular nuevos pesos
    const minWeight = 0.15;
    const maxWeight = 0.5;

    const techRate = performance.technical.total > 0 
      ? performance.technical.wins / performance.technical.total 
      : 0.5;
    
    const mlRate = performance.ml.total > 0 
      ? performance.ml.wins / performance.ml.total 
      : 0.5;
    
    const velRate = performance.velocity.total > 0 
      ? performance.velocity.wins / performance.velocity.total 
      : 0.5;

    const totalRate = techRate + mlRate + velRate;

    if (totalRate > 0) {
      // Asignar pesos proporcionales al rendimiento
      this.adaptiveWeights.technical = Math.max(minWeight, Math.min(maxWeight, techRate / totalRate));
      this.adaptiveWeights.ml = Math.max(minWeight, Math.min(maxWeight, mlRate / totalRate));
      this.adaptiveWeights.velocity = Math.max(minWeight, Math.min(maxWeight, velRate / totalRate));

      // Normalizar para que sumen 1
      const sum = this.adaptiveWeights.technical + this.adaptiveWeights.ml + this.adaptiveWeights.velocity;
      this.adaptiveWeights.technical /= sum;
      this.adaptiveWeights.ml /= sum;
      this.adaptiveWeights.velocity /= sum;

    }
  }

  /**
   * Genera reporte de decisión
   */
  generateDecisionReport(tradePip, openPip, technicalSignal, mlPrediction, finalDecision) {
    const isGreen = finalDecision === 'green';
    const emoji = isGreen ? '🟢' : '🔴';
    const priceMovement = tradePip > openPip ? '📈 SUBIDA' : '📉 BAJADA';
    const priceChange = (((tradePip - openPip) / openPip) * 100).toFixed(4);

    let report = `${'='.repeat(60)}\n`;
    report += `${emoji} DECISIÓN EJECUTADA: ${finalDecision.toUpperCase()}\n`;
    report += `${'='.repeat(60)}\n`;
    report += `💰 PRECIO:\n`;
    report += `   • Apertura: ${openPip.toFixed(5)}\n`;
    report += `   • Trade: ${tradePip.toFixed(5)}\n`;
    report += `   • Movimiento: ${priceMovement} (${priceChange}%)\n`;
    report += `\n⚡ TÉCNICOS: ${technicalSignal.toUpperCase()}\n`;

    if (!mlPrediction.decision || mlPrediction.confidence < 0.3) {
      report += `🤖 ML: SIN DATOS SUFICIENTES\n`;
    } else {
      report += `🤖 ML: ${mlPrediction.decision.toUpperCase()} `;
      report += `(${(mlPrediction.confidence * 100).toFixed(1)}% conf, `;
      report += `${mlPrediction.sampleSize || 0} patrones)\n`;
    }

    report += `${'='.repeat(60)}\n`;
    
    return report;
  }

  /**
   * Limpia recursos y previene memory leaks
   */
  cleanup() {
    // Limpiar timers
    this.clearTimers();

    // Limpiar listeners
    if (this.pipSubscription && this.platform.pipReceiver) {
      this.platform.pipReceiver.removeListener('newPip', this.pipSubscription);
    }

    // Limpiar mapas y arrays
    this.pendingTrades.clear();
    this.recentTrades = [];

    // Limpiar lifecycle
    if (this.candleLifecycle) {
      this.candleLifecycle.cleanup();
    }

    console.log('TradingStrategy: Recursos limpiados');
  }
}

module.exports.TradingStrategy = TradingStrategy;
module.exports.CandleLifecycleManager = CandleLifecycleManager;
// ============================
// AREPA 9: Clase TradingBot y Función main (Orquestación Global)
// ============================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// ✅ CÓDIGO NUEVO A PEGAR:
const { QXWebSocketTrader } = require('./modules/QXWebSocketTrader');
puppeteer.use(StealthPlugin());

// Función auxiliar para verificar la conexión a MySQL
function checkEnvVars() {
  const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  // Opcional: TELEGRAM_TOKEN y TELEGRAM_CHAT_ID si las notificaciones son críticas
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length) {
    const errorMsg =
      '❌ Faltan variables de entorno críticas para la base de datos: ' +
      missing.join(', ');
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

// Importar el SystemHealthMonitor avanzado
const SystemHealthMonitorAdvanced = require('./systemHealthMonitor');

async function testMySQLConnection() {
  try {
    // Realizamos una prueba usando un fingerprint de prueba (esto asume que findSimilarPatterns no arroja error si la conexión es correcta)
    await findSimilarPatterns({ patternHash: 'test' });
    console.log('Conexión a MySQL verificada exitosamente.');
  } catch (error) {
    console.error('Error verificando conexión a MySQL:', error);
  }
}

class TradingBot {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.page = null; // Página principal del broker
    this.dashboardPage = null; // Página exclusiva para el Dashboard
    this.isRunning = false;
    this.dataManager = new DataManager(config);
    this.dashboard = null;
    this.platform = null;
    this.analyzer = null;
    this.strategy = null;
    this.subCandleInterval = null; // <--- LÍNEA AÑADIDA
    this.systemHealthMonitor = null; // Para el monitor avanzado
	// ✅ CÓDIGO NUEVO A PEGAR:
this.webSocketTrader = null; // Nuestro nuevo control remoto para WebSockets
    this.mockMode = process.env.MOCK_PIPS === 'true';
  }

  async initialize() {
    console.log('Inicializando TradingBot...');
    // Verificamos la conexión a MySQL antes de seguir
    await testMySQLConnection();

    // Inicializar el SystemHealthMonitor avanzado
    // 'this' (la instancia de TradingBot) se pasa al constructor de SystemHealthMonitorAdvanced
    this.systemHealthMonitor = new SystemHealthMonitorAdvanced(
      this,
      this.config.SYSTEM_HEALTH_OPTIONS || {}
    );

    try {

      const pureMockMode = this.mockMode && process.env.NO_BROWSER === 'true';
      if (!pureMockMode) {
        this.browser = await puppeteer.launch({
          headless: this.config.BROWSER.HEADLESS,
          executablePath: this.config.BROWSER.EXECUTABLE_PATH,
          userDataDir: this.config.USER_DATA_DIR,
          protocolTimeout: 120000,
          args: [
            '--disable-blink-features=AutomationControlled',
            '--remote-debugging-port=9225',
          ],
        });
        // Página principal del broker
        this.page = await this.browser.newPage();
        this.page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
        // Crear una página separada para el Dashboard
        this.dashboardPage = await this.browser.newPage();
        const dashboardPath = `file://${__dirname}/dashboard.html`;
        await this.dashboardPage.goto(dashboardPath, {
          waitUntil: 'networkidle2',
        });
      } else {
        console.log('Modo simulación puro: sin navegador.');
        this.page = {
          addStyleTag: async () => {},
          evaluate: async () => {},
          waitForFunction: async () => {},
          $: async () => null,
          $eval: async () => 1000,
          bringToFront: async () => {},
          focus: async () => {},
          click: async () => {},
          goto: async () => {},
          reload: async () => {},
          on: () => {},
        };
        this.dashboardPage = this.page;
      }

      // Instanciar los módulos del bot
      this.dashboard = new Dashboard(this.dashboardPage, this.config);
this.platform = new PlatformController(this.page, this.config);
	  this.webSocketTrader = new QXWebSocketTrader(this.page);
      await this.platform.initialize();
      this.analyzer = new MarketAnalyzer(this.config);
this.strategy = new TradingStrategy(
        this.platform,
        this.analyzer,
        this.dashboard,
        this.dataManager,
        this.config,
        this.systemHealthMonitor, // Pasar el monitor a la estrategia
        this.webSocketTrader // <<<--- ❗ LE PASAMOS EL CONTROL REMOTO
      );
      // Verificar que el MLModel se haya inicializado (la TradingStrategy se encarga de cargarlo)
      if (!this.strategy.mlModel) {
        console.error('MLModel no se inicializó correctamente.');
      }
      return true;
    } catch (error) {
      console.error('Error al inicializar el bot:', error);
      return false;
    }
  }

async setup() {
    try {
      if (!this.mockMode) {
        // 1. Preparamos nuestro código espía ANTES de cualquier cosa.
        console.log('QXWebSocketTrader: Preparando inyección temprana del hook...');
await this.page.evaluateOnNewDocument(() => {
    // Este código se ejecuta ANTES de que la página de trading cargue sus scripts.
    if (window.__wsHooked) return;

    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function(...args) {
        const wsInstance = new OriginalWebSocket(...args);
        // ❗ CORRECCIÓN: Ahora buscamos 'socket.io', que SÍ está en la URL real.
        if (args[0] && args[0].includes('socket.io')) {
             console.log('✅ Espía: Socket de QXBroker detectado y capturado:', args[0]);
             window.__socket = wsInstance; // Guardamos la conexión correcta.
        }
        return wsInstance;
    };
    window.__wsHooked = true;
});
        // 2. Te llevamos a la página de login.
        await this.page.goto('https://qxbroker.com/es/sign-in/', {
          waitUntil: 'networkidle2',
        });
        console.log('Realice login manualmente en la ventana principal');

        // 3. ESPERAMOS TU SEÑAL (el "GO" para el tren).
        await Utils.promptEnter('Presione ENTER tras el login (esto cargará la página de trade)');

        // 4. Ahora sí, navegamos a la página de trading. Nuestro espía ya está activo.
        console.log('QXWebSocketTrader: Hook listo. Navegando a la página de trading...');
        await this.page.goto('https://qxbroker.com/es/trade', {
          waitUntil: 'networkidle2',
        });

        // 5. Y AHORA, con la acción ya realizada, esperamos a que el socket se conecte.
        await this.webSocketTrader.hookWebSocket();

      } else {
        console.log('Modo simulación: saltando login y navegación.');
      }

      if (!this.mockMode || process.env.NO_BROWSER !== 'true') {
        await Utils.promptEnter('Presione ENTER para cargar gráficos');
        await this.dashboard.setup();
        console.log('Dashboard y gráficos listos');
        await Utils.promptEnter('Presione ENTER para iniciar');
      } else {
        console.log('Modo simulación: omitiendo setup de dashboard');
      }
      return true;
    } catch (error) {
      console.error('Error en setup:', error);
      return false;
    }
  }
  async start() {
    if (this.isRunning) {
      console.warn('El bot ya está en ejecución');
      return false;
    }
    try {
      console.log('Iniciando operaciones...');
      if (!this.mockMode || process.env.NO_BROWSER !== 'true') {
        await Utils.promptEnter('Presione ENTER para comenzar');
        await this.page.addStyleTag({
          content: '.modal-pair-information { z-index: -1 !important; }',
        });
      }
      // Sincronización mejorada de SubCandleBuilder con el ciclo de velas
      this.subCandleInterval = setInterval(() => {
        const now = Date.now();
        const candleDurationMs = 5 * 60 * 1000; // 5 minutos
        const currentBoundary =
          Math.floor(now / candleDurationMs) * candleDurationMs;
        const timeIntoCandle = now - currentBoundary;

        // Solo ejecutar si NO estamos en los primeros 500ms de una nueva vela
        if (timeIntoCandle > 500) {
          subCandleBuilder.finalizeCandle();
        }
      }, 2000);

      await this.strategy.start();
      // Iniciar el monitor de salud del sistema después de que la estrategia haya comenzado
      if (
        this.systemHealthMonitor &&
        typeof this.systemHealthMonitor.start === 'function'
      ) {
        this.systemHealthMonitor.start();
        console.log('SystemHealthMonitor avanzado iniciado.');
      }
      return true;
    } catch (error) {
      console.error('Error al iniciar el bot:', error);
      this.isRunning = false;
      return false;
    }
  }

  async stop() {
    this.isRunning = false;
    if (this.subCandleInterval) {
      // <--- BLOQUE AÑADIDO
      clearInterval(this.subCandleInterval);
    }
    if (this.platform && typeof this.platform.stop === 'function') {
      this.platform.stop();
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
	// ✅ CÓDIGO NUEVO A PEGAR:
if (this.webSocketTrader) {
  await this.webSocketTrader.cleanup();
}
    if (
      this.systemHealthMonitor &&
      typeof this.systemHealthMonitor.stop === 'function'
    ) {
      this.systemHealthMonitor.stop();
      console.log('SystemHealthMonitor avanzado detenido.');
    }
    console.log('Bot detenido');
  }
}

async function main() {
  try {
    checkEnvVars(); // Validar variables de entorno al inicio
    const bot = new TradingBot(CONFIG);
    if (!(await bot.initialize())) {
      console.error('Falló la inicialización del bot');
      process.exit(1);
    }
    if (!(await bot.setup())) {
      console.error('Falló la configuración del bot');
      await bot.stop();
      process.exit(1);
    }
    await bot.start();

    process.on('SIGINT', async () => {
      console.log('\nDeteniendo el bot...');
      if (bot.strategy && typeof bot.strategy.stop === 'function') {
        console.log('Deteniendo estrategia de trading...');
        bot.strategy.stop();
      }
      await bot.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('Error fatal en main:', error);
    process.exit(1);
  }
}

module.exports.TradingBot = TradingBot;
module.exports.main = main;

// ============================
// AREPA 10: DataCollectorAndSender
// ============================

class DataCollectorAndSender {
  /**
   * @param {PlatformController} platform - Para obtener el saldo actual.
   * @param {Dashboard} dashboard - Para mostrar logs en el dashboard.
   * @param {TradingStrategy} tradingStrategy - Para acceder a estadísticas y detalles de la estrategia.
   * @param {TelegramNotifier} telegramNotifier - Instancia para enviar mensajes a Telegram.
   * @param {number} interval - Intervalo en milisegundos para enviar el reporte (default: 60000 ms).
   */
  constructor(
    platform,
    dashboard,
    tradingStrategy,
    telegramNotifier,
    interval = 60000
  ) {
    this.platform = platform;
    this.dashboard = dashboard;
    this.tradingStrategy = tradingStrategy;
    this.telegramNotifier = telegramNotifier;
    this.interval = interval;
    this.timer = null;
  }

  /**
   * Recolecta datos del estado actual, incluyendo balance, estadísticas y detalles de la última vela,
   * y envía un reporte formateado a través de Telegram.
   */
  async collectDataAndSend() {
    try {
      // Obtener el saldo actual mediante PlatformController.
      const currentBalance = await this.platform.readCurrentBalance();
      // Acceder a las estadísticas de la estrategia (como ganadas/perdidas)
      const stats = this.tradingStrategy.strategyStats;
      // Construir un mensaje resumen: incluye datos básicos y, si está disponible, detalles de la última vela.
      let lastCandleMsg = '';
      if (this.tradingStrategy.prevManipulatedCandle) {
        lastCandleMsg = `Apertura: ${this.tradingStrategy.prevManipulatedCandle.open} - Cierre: ${this.tradingStrategy.prevManipulatedCandle.close}`;
      }
      const message =
        `*Resumen de Trading*\n` +
        `*Saldo actual:* ${currentBalance}\n` +
        `*Inicio:* ${stats.initialBalance ? stats.initialBalance : 'N/A'}\n` +
        `*Ganadas:* ${stats.wins}\n` +
        `*Perdidas:* ${stats.losses}\n` +
        `*Última vela:* ${lastCandleMsg}\n`;

      // Enviar el reporte a Telegram de forma asíncrona.
      await this.telegramNotifier.sendMessage(message);
      console.log('Reporte enviado a Telegram.');
      // También, registrar en el dashboard que el reporte se ha enviado.
    } catch (error) {
      console.error('Error recolectando/enviando datos:', error);
    }
  }

  /**
   * Inicia el envío periódico del reporte de datos.
   */
  start() {
    // Enviar reporte inmediatamente...
    this.collectDataAndSend();
    // ... y luego de forma periódica cada 'interval' milisegundos.
    this.timer = setInterval(() => {
      this.collectDataAndSend();
    }, this.interval);
  }

  /**
   * Detiene el envío periódico del reporte.
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports.DataCollectorAndSender = DataCollectorAndSender;

// ============================
// AREPA 11: SystemHealthMonitor (Monitoreo de Salud del Sistema)
// ============================

class SystemHealthMonitor {
  /**
   * Crea una instancia de SystemHealthMonitor.
   * @param {TradingBot} bot - Instancia del bot.
   * @param {object} options - Opciones de configuración del monitor.
   */
  constructor(bot, options) {
    // Opciones predeterminadas con posibilidad de sobrescribir
    this.options = Object.assign(
      {
        maxMemoryUsageMB: 800, // Límite de memoria (MB)
        maxCpuUsagePercent: 80, // Límite de CPU (valor estimado)
        enableAutoRestart: true, // Reinicio automático en caso de condición crítica
        enableTelegramAlerts: true, // Envío de alertas vía Telegram
        monitorInterval: 30000, // Intervalo en ms para revisar la salud
        deepCleanInterval: 3600000, // Intervalo en ms para ejecutar consolidación (GC)
        enableGarbageCollection: true, // Permitir GC manual (requiere --expose-gc)
        enableComponentRestart: true, // Reinicio de componentes críticos (si se detecta anomalía)
      },
      options
    );
    this.bot = bot;
    this.monitorTimer = null;
    this.deepCleanTimer = null;
    // Para monitorear la CPU se conserva la última medición
    this.lastCpuUsage = process.cpuUsage();
  }

  /**
   * Inicia el monitoreo del sistema. Se establece un intervalo para verificar el uso de la memoria.
   * Si se supera el límite, se envían alertas y, opcionalmente, se reinician componentes.
   */
  start() {
    this.monitorTimer = setInterval(() => {
      // Monitoreo de Memoria:
      const memoryUsageMB = process.memoryUsage().rss / (1024 * 1024); // Uso de memoria en MB
      if (memoryUsageMB > this.options.maxMemoryUsageMB) {
        console.warn(
          `ALERTA: Uso de memoria alto: ${memoryUsageMB.toFixed(2)} MB`
        );
        if (this.options.enableTelegramAlerts && global.telegramNotifier) {
          global.telegramNotifier.sendMessage(
            `ALERTA: Uso de memoria alto: ${memoryUsageMB.toFixed(2)} MB`
          );
        }
        if (this.options.enableAutoRestart) {
          console.warn('Reiniciando bot debido a alta memoria...');
          // Reiniciar bot: primero detener y luego iniciar (debe implementarse de forma segura)
          this.bot.stop().then(() => {
            this.bot.start();
          });
        }
      }

      // Monitoreo de CPU (valor aproximado):
      // Se utiliza process.cpuUsage() para obtener microsegundos consumidos.
      const cpuUsageDelta = process.cpuUsage(this.lastCpuUsage);
      this.lastCpuUsage = process.cpuUsage();
      // Convertir los microsegundos a milisegundos e interpretar un porcentaje (aclaramos que es aproximado)
      const cpuTimeMs = (cpuUsageDelta.user + cpuUsageDelta.system) / 1000;
      const cpuPercent = (cpuTimeMs / this.options.monitorInterval) * 100;
      if (cpuPercent > this.options.maxCpuUsagePercent) {
        console.warn(`ALERTA: Uso de CPU elevado: ${cpuPercent.toFixed(1)}%`);
        if (this.options.enableTelegramAlerts && global.telegramNotifier) {
          global.telegramNotifier.sendMessage(
            `ALERTA: Uso de CPU elevado: ${cpuPercent.toFixed(1)}%`
          );
        }
      }
    }, this.options.monitorInterval);

    // Configurar "Deep Clean" si la recolección de basura está habilitada y accesible.
    if (this.options.enableGarbageCollection && global.gc) {
      this.deepCleanTimer = setInterval(() => {
        console.log('Ejecutando garbage collection manual.');
        global.gc();
      }, this.options.deepCleanInterval);
    } else if (this.options.enableGarbageCollection) {
      console.warn(
        'Garbage Collection manual no disponible. Inicie Node.js con --expose-gc.'
      );
    }
    console.log('SystemHealthMonitor iniciado.');
  }

  /**
   * Detiene el monitoreo del sistema.
   */
  stop() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
    if (this.deepCleanTimer) {
      clearInterval(this.deepCleanTimer);
      this.deepCleanTimer = null;
    }
    console.log('SystemHealthMonitor detenido.');
  }
}

module.exports.SystemHealthMonitor = SystemHealthMonitor;
// ============================
// AREPA 12: TelegramNotifier (Módulo de Notificaciones vía Telegram)
// ============================

// Se requiere 'node-fetch' para realizar peticiones HTTP.
// Asegúrate de instalarlo mediante 'npm install node-fetch' o utilizar la versión global de fetch si corresponde.
const fetch = require('node-fetch');

/**
 * Clase TelegramNotifier.
 * Encapsula la lógica para enviar mensajes a un chat mediante la API de Telegram.
 */
class TelegramNotifier {
  /**
   * Crea una instancia de TelegramNotifier.
   * @param {string} token - Token de autenticación del bot.
   * @param {string} chatId - Identificador del chat donde se enviarán los mensajes.
   */
  constructor(token, chatId) {
    this.token = token;
    this.chatId = chatId;
    this.apiUrl = `https://api.telegram.org/bot${this.token}/sendMessage`;
  }

  // Helper to escape text for MarkdownV2
  escapeMarkdownV2(text) {
    if (typeof text !== 'string') {
      return String(text); // Convert non-strings to strings
    }
    // Corrección: Usar una lista más completa de caracteres a escapar para MarkdownV2,
    // similar a la versión en el archivo telegramNotifier.js separado.
    return text
      .replace(/\\/g, '\\\\') // Backslash (debe ser el primero)
      .replace(/\*/g, '\\*') // Asterisco
      .replace(/_/g, '\\_') // Underscore
      .replace(/\[/g, '\\[') // Corchete izquierdo
      .replace(/\]/g, '\\]') // Corchete derecho
      .replace(/\(/g, '\\(') // Paréntesis izquierdo
      .replace(/\)/g, '\\)') // Paréntesis derecho
      .replace(/~/g, '\\~') // Tilde
      .replace(/`/g, '\\`') // Backtick
      .replace(/>/g, '\\>') // Mayor que
      .replace(/#/g, '\\#') // Hashtag
      .replace(/\+/g, '\\+') // Plus
      .replace(/-/g, '\\-') // Guión
      .replace(/=/g, '\\=') // Igual
      .replace(/\|/g, '\\|') // Pipe
      .replace(/\{/g, '\\{') // Llave izquierda
      .replace(/\}/g, '\\}') // Llave derecha
      .replace(/\./g, '\\.') // Punto
      .replace(/!/g, '\\!'); // Exclamación
  }

  /**
   * Envía un mensaje a Telegram de forma asíncrona.
   * @param {string} message - Mensaje a enviar. La función se encarga de escapar el mensaje completo si se usa MarkdownV2.
   * @returns {Promise<void>}
   */
  async sendMessage(message) {
    // Intentar con MarkdownV2 primero
    let payload = {
      chat_id: this.chatId,
      text: message,
      parse_mode: 'MarkdownV2',
    };

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(
          `Error al enviar mensaje a Telegram (MarkdownV2): ${response.status} ${response.statusText}. Body: ${errorBody}`
        );

        // Fallback: intentar enviar como texto plano
        console.log('Intentando enviar como texto plano...');
        const plainPayload = {
          chat_id: this.chatId,
          text: message,
          // No se especifica parse_mode, Telegram lo tratará como texto plano por defecto.
        };

        const plainResponse = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(plainPayload),
        });

        if (!plainResponse.ok) {
          const plainErrorBody = await plainResponse.text();
          console.error(
            `Error enviando como texto plano: ${plainResponse.status} ${plainResponse.statusText}. Body: ${plainErrorBody}`
          );
        } else {
          console.log(
            'Mensaje enviado como texto plano tras fallo inicial con MarkdownV2.'
          );
        }
      } else {
        console.log('Mensaje enviado a Telegram (MarkdownV2) exitosamente.');
      }
    } catch (error) {
      console.error('Error al enviar mensaje a Telegram:', error);
    }
  }
}

module.exports.TelegramNotifier = TelegramNotifier;

// Opcional: Puedes asignar una instancia global usando variables de entorno, por ejemplo:
if (process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_CHAT_ID) {
  global.telegramNotifier = new TelegramNotifier(
    process.env.TELEGRAM_TOKEN,
    process.env.TELEGRAM_CHAT_ID
  );
  console.log('Global telegramNotifier asignado.');
} else {
  console.warn(
    'No se configuraron TELEGRAM_TOKEN o TELEGRAM_CHAT_ID en el entorno.'
  );
}
// --- BLOQUE DE EXPORTACIÓN FINAL Y UNIFICADO ---
// Aseguramos que todas las piezas clave, incluyendo CONFIG, sean visibles
// para otros archivos que las necesiten.
module.exports = {
    CONFIG, // <-- La pieza que faltaba para darle permiso al Colector
    TradingBot,
    main,
    Dashboard,
    PlatformController,
    MarketAnalyzer,
    TradingStrategy,
    CandleLifecycleManager,
    TelegramNotifier,
    DataCollectorAndSender,
    SystemHealthMonitor
    // Nota: PipReceiver ahora está en su propio archivo y no se exporta desde aquí.
};
if (require.main === module) {
  main();
}
