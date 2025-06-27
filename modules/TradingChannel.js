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
import CandleBuilder from '../logic/CandleBuilder.js';
import IndicatorEngine from './IndicatorEngine.js';
import Humanizer from './Humanizer.js';

class TradingChannel extends EventEmitter {
  constructor(assetName) {
    super();
    
    this.asset = assetName;
    this.creationTime = Date.now();
    
    // Estado del canal
    this.state = {
      isActive: true,
      lastCandleTime: 0,
      lastSignalTime: 0,
      consecutiveErrors: 0,
    };
    
    // Métricas específicas del canal
    this.metrics = {
      candlesProcessed: 0,
      signalsGenerated: 0,
      signalsApproved: 0,
      signalsRejected: 0,
      lastUpdateTime: Date.now(),
    };
    
    // Inicializar componentes del pipeline
    this._initializePipeline();
    
    logger.info(`📡 TradingChannel [${this.asset}] creado exitosamente`);
  }
  
  /**
   * Inicializa todos los componentes del pipeline
   */
  _initializePipeline() {
    // IMPORTANTE: Cada canal tiene SUS PROPIAS instancias
    // Esto permite configuración y estado independiente
    
    // 1. Constructor de velas (ya no necesario aquí, viene del PipReceiver)
    // El CandleBuilder global ya maneja las velas, solo procesamos las cerradas
    
    // 2. Motor de indicadores - PROPIO del canal
    this.indicatorEngine = new IndicatorEngine(this.asset);
    
    // 3. Humanizador - PROPIO del canal
    this.humanizer = new Humanizer();
    this.humanizer.setChannelContext(this.asset); // Método nuevo para contexto
    
    // 4. Conectar el flujo interno del canal
    this._connectPipeline();
    
    logger.info(`🔧 Pipeline inicializado para [${this.asset}]`);
  }
  
  /**
   * Conecta los componentes del pipeline entre sí
   */
  _connectPipeline() {
    // IndicatorEngine → Humanizer
    this.indicatorEngine.on('señalTecnica', (signal) => {
      this.metrics.signalsGenerated++;
      
      // Agregar contexto del canal
      signal.channel = this.asset;
      signal.channelMetrics = this.getMetrics();
      
      logger.debug(`[${this.asset}] Señal técnica generada: ${signal.decision}`);
      
      // Pasar al humanizador
      this.humanizer.analyzeSignal(signal);
    });
    
    // Humanizer → Salida del canal
    this.humanizer.on('decisionFinal', (decision) => {
      if (decision.approved) {
        this.metrics.signalsApproved++;
        this.state.lastSignalTime = Date.now();
        
        // Emitir la señal aprobada para que ChannelManager la propague
        this.emit('señalAprobada', decision.signal);
        
        logger.info(`✅ [${this.asset}] Señal APROBADA: ${decision.signal.decision}`);
      } else {
        this.metrics.signalsRejected++;
        logger.debug(`❌ [${this.asset}] Señal rechazada: ${decision.reason}`);
      }
    });
  }
  
  /**
   * Procesa una vela cerrada en este canal
   * @param {Object} candle - Datos de la vela cerrada
   */
  processCandle(candle) {
    if (!this.state.isActive) {
      logger.warn(`[${this.asset}] Canal inactivo, ignorando vela`);
      return;
    }
    
    try {
      this.metrics.candlesProcessed++;
      this.state.lastCandleTime = Date.now();
      this.metrics.lastUpdateTime = Date.now();
      
      // Validar que la vela corresponde a este canal
      // (En modo compatibilidad, todos los activos pasan por el canal GLOBAL)
      
      // Delegar al IndicatorEngine del canal
      this.indicatorEngine.analyzeCandle(candle);
      
      // Reset de errores consecutivos en procesamiento exitoso
      this.state.consecutiveErrors = 0;
      
      // Log periódico de salud
      if (this.metrics.candlesProcessed % 50 === 0) {
        this._logChannelHealth();
      }
      
    } catch (error) {
      logger.error(`❌ [${this.asset}] Error procesando vela: ${error.message}`);
      this.state.consecutiveErrors++;
      
      // Auto-desactivación si hay muchos errores
      if (this.state.consecutiveErrors > 10) {
        logger.error(`🚨 [${this.asset}] Demasiados errores consecutivos, desactivando canal`);
        this.deactivate();
      }
    }
  }
  
  /**
   * Registra el estado de salud del canal
   */
  _logChannelHealth() {
    const uptime = (Date.now() - this.creationTime) / 1000 / 60; // minutos
    const signalRate = this.metrics.signalsGenerated / this.metrics.candlesProcessed;
    const approvalRate = this.metrics.signalsApproved / Math.max(1, this.metrics.signalsGenerated);
    
    logger.info(`📊 [${this.asset}] Estado del Canal:`);
    logger.info(`   ⏱️  Uptime: ${uptime.toFixed(1)} minutos`);
    logger.info(`   📈 Velas: ${this.metrics.candlesProcessed}`);
    logger.info(`   🎯 Señales: ${this.metrics.signalsGenerated} (Rate: ${(signalRate * 100).toFixed(1)}%)`);
    logger.info(`   ✅ Aprobadas: ${this.metrics.signalsApproved} (${(approvalRate * 100).toFixed(1)}%)`);
  }
  
  /**
   * Obtiene las métricas actuales del canal
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.creationTime,
      isActive: this.state.isActive,
      errorRate: this.state.consecutiveErrors,
      timeSinceLastSignal: this.state.lastSignalTime 
        ? Date.now() - this.state.lastSignalTime 
        : null,
    };
  }
  
  /**
   * Obtiene configuración específica para este activo
   * FUTURO: Aquí se pueden agregar configuraciones específicas por activo
   */
  getAssetConfig() {
    // Por ahora, configuración por defecto
    // En el futuro: diferentes estrategias para Forex vs Crypto vs OTC
    const baseConfig = {
      indicators: {
        ema: { fast: 9, slow: 21 },
        rsi: { period: 14, oversold: 30, overbought: 70 },
      },
      humanizer: {
        minInterval: 60000, // 1 minuto mínimo entre trades
        maxConsecutive: 2,
      },
    };
    
    // Configuraciones específicas por tipo de activo
    if (this.asset.includes('_otc')) {
      // Activos OTC pueden ser más agresivos
      baseConfig.humanizer.minInterval = 45000;
      baseConfig.indicators.rsi.oversold = 35;
      baseConfig.indicators.rsi.overbought = 65;
    } else if (this.asset.includes('EUR') || this.asset.includes('USD')) {
      // Forex major pairs - más conservador
      baseConfig.humanizer.minInterval = 90000;
      baseConfig.humanizer.maxConsecutive = 1;
    }
    
    return baseConfig;
  }
  
  /**
   * Actualiza la configuración del canal dinámicamente
   */
  updateConfig(newConfig) {
    logger.info(`🔧 [${this.asset}] Actualizando configuración del canal`);
    
    if (newConfig.indicators) {
      // Actualizar configuración de indicadores
      this.indicatorEngine.updateConfig(newConfig.indicators);
    }
    
    if (newConfig.humanizer) {
      // Actualizar configuración del humanizador
      this.humanizer.updateConfig(newConfig.humanizer);
    }
    
    logger.info(`✅ [${this.asset}] Configuración actualizada`);
  }
  
  /**
   * Desactiva temporalmente el canal
   */
  deactivate() {
    this.state.isActive = false;
    logger.warn(`⏸️  [${this.asset}] Canal desactivado`);
    this.emit('channelDeactivated', { asset: this.asset, metrics: this.getMetrics() });
  }
  
  /**
   * Reactiva el canal
   */
  activate() {
    this.state.isActive = true;
    this.state.consecutiveErrors = 0;
    logger.info(`▶️  [${this.asset}] Canal reactivado`);
    this.emit('channelActivated', { asset: this.asset });
  }
  
  /**
   * Detiene completamente el canal y limpia recursos
   */
  stop() {
    logger.info(`🛑 [${this.asset}] Deteniendo canal...`);
    
    // Desconectar listeners
    this.indicatorEngine.removeAllListeners();
    this.humanizer.removeAllListeners();
    this.removeAllListeners();
    
    // Marcar como inactivo
    this.state.isActive = false;
    
    // Log final de métricas
    this._logChannelHealth();
    
    logger.info(`✅ [${this.asset}] Canal detenido completamente`);
  }
  
  // Métodos de acceso rápido para ChannelManager
  getSignalCount() { return this.metrics.signalsGenerated; }
  getLastSignalTime() { return this.state.lastSignalTime; }
  getCreationTime() { return this.creationTime; }
  isActive() { return this.state.isActive; }
}

export default TradingChannel;