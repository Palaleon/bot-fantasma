/*
================================================================================
||                          TRADING CHANNEL v1.0                              ||
||                    Pipeline Completo por Activo                            ||
================================================================================

PROPÓSITO:
Encapsula TODO el pipeline de procesamiento para UN activo específico:
CandleBuilder → IndicatorEngine → Humanizer → Señal Final

ARQUITECTURA:
Cada TradingChannel es completamente independiente, manteniendo su propio:
- Estado de velas
- Análisis técnico
- Reglas de humanización
- Historial de señales

VENTAJAS:
1. Aislamiento total entre activos
2. Estado independiente (no hay interferencia)
3. Fácil paralelización futura (Worker Threads)
4. Métricas granulares por activo
5. Configuración específica por tipo de activo

EVOLUCIÓN:
- v1.0: Pipeline único con componentes existentes
- v1.1: Indicadores avanzados por activo
- v1.2: Machine Learning por canal
- v2.0: Worker Thread dedicado

================================================================================
*/

import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import IndicatorEngine from './IndicatorEngine.js';

class TradingChannel extends EventEmitter {
  constructor(assetName) {
    super();
    this.asset = assetName;
    // ... (mismas propiedades de estado y métricas)
    this._initializePipeline();
    logger.info(`📡 TradingChannel [${this.asset}] v2.0 creado (simplificado)`);
  }

  _initializePipeline() {
    this.indicatorEngine = new IndicatorEngine(this.asset);
    this._connectPipeline();
    logger.info(`🔧 Pipeline simplificado inicializado para [${this.asset}]`);
  }

  _connectPipeline() {
    // IndicatorEngine → Salida del canal
    this.indicatorEngine.on('señalTecnica', (signal) => {
      this.metrics.signalsGenerated++;
      signal.channel = this.asset; // Adjuntar el nombre del canal
      this.emit('señalTecnicaCanal', signal); // Emitir hacia arriba
    });
  }

  processCandle(candle) {
    // logger.warn(`[DEBUG-AUDIT] TradingChannel [${this.asset}]: Recibida vela ${candle.timeframe}. Pasando a IndicatorEngine.`);
    this.indicatorEngine.analyzeCandle(candle);
  }

  // ... (resto de métodos de utilidad como getMetrics, stop, etc. sin la lógica del Humanizer)
}

export default TradingChannel;
