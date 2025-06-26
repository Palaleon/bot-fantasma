/*
================================================================================
||                          PIP RECEIVER v2.0                                 ||
||                    Receptor Nativo de WebSocket                            ||
================================================================================

CAMBIOS v2.0:
✅ Eliminada TODA dependencia TCP
✅ Consume directamente del WebSocketInterceptor
✅ Mantiene la misma interfaz de eventos para compatibilidad
✅ Procesamiento 100% asíncrono
✅ Sin conexiones externas

FLUJO:
WebSocketInterceptor → PipReceiver → CandleBuilder → ChannelManager

================================================================================
*/

import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import CandleBuilder from '../logic/CandleBuilder.js';

class PipReceiver extends EventEmitter {
  constructor(wsInterceptor) {
    super();
    
    this.wsInterceptor = wsInterceptor;
    this.isRunning = false;
    this.currentAsset = null;
    
    // CandleBuilder para construir velas
    this.candleBuilder = new CandleBuilder((closedCandle) => {
      this.emit('velaCerrada', closedCandle);
    });
    
    // Estadísticas
    this.stats = {
      pipsReceived: 0,
      candlesBuilt: 0,
      startTime: Date.now(),
      lastPipTime: null,
      currentAsset: null
    };
    
    logger.info('📡 PipReceiver v2.0 inicializado (WebSocket nativo)');
  }

  start() {
    if (this.isRunning) {
      logger.warn('PipReceiver ya está en ejecución');
      return;
    }
    
    logger.info('🚀 PipReceiver iniciando...');
    
    // Suscribirse a eventos del WebSocketInterceptor
    this._setupEventListeners();
    
    this.isRunning = true;
    this.emit('connected'); // Mantener compatibilidad
    
    logger.info('✅ PipReceiver activo y escuchando WebSocket nativo');
    
    // Iniciar reporte periódico
    this._startPeriodicReporting();
  }

  _setupEventListeners() {
    // Escuchar pips del interceptor
    this.wsInterceptor.on('pip', (pipData) => {
      this._handlePip(pipData);
    });
    
    // Escuchar cambios de activo
    this.wsInterceptor.on('assetChanged', (assetData) => {
      this._handleAssetChange(assetData);
    });
    
    // Escuchar estado del WebSocket
    this.wsInterceptor.on('websocketStatus', (status) => {
      this._handleWebSocketStatus(status);
    });
  }

  _handlePip(pipData) {
    try {
      // Incrementar contador
      this.stats.pipsReceived++;
      this.stats.lastPipTime = Date.now();
      
      // Construir estructura compatible con el sistema anterior
      const pipUpdate = {
        pip: pipData.price,
        raw_asset: pipData.rawAsset,
        active_asset: pipData.displayAsset,
        pip_timestamp_ms: pipData.timestamp,
        pip_sequence_in_candle: pipData.sequence || this.stats.pipsReceived
      };
      
      // Agregar al constructor de velas
      this.candleBuilder.addPip(pipUpdate);
      
      // Emitir evento para compatibilidad con sistemas legacy
      this.emit('pipReceived', pipUpdate);
      
      // Log periódico
      if (this.stats.pipsReceived % 100 === 0) {
        logger.info(`📈 Pips procesados: ${this.stats.pipsReceived} | Activo: ${pipData.displayAsset}`);
      }
      
    } catch (error) {
      logger.error('Error procesando pip:', error);
      this.emit('error', error);
    }
  }

  _handleAssetChange(assetData) {
    const { rawAsset, displayAsset } = assetData;
    
    if (this.currentAsset !== rawAsset) {
      const previousAsset = this.currentAsset;
      this.currentAsset = rawAsset;
      this.stats.currentAsset = displayAsset;
      
      logger.warn(`🔄 Cambio de activo detectado: ${previousAsset || 'N/A'} → ${displayAsset}`);
      
      // Emitir evento de cambio de activo
      this.emit('assetChanged', {
        previous_asset: previousAsset,
        new_asset: displayAsset,
        raw_asset: rawAsset,
        timestamp: Date.now()
      });
    }
  }

  _handleWebSocketStatus(status) {
    logger.info(`🔌 Estado WebSocket: ${status}`);
    
    if (status === 'connected') {
      this.emit('connected');
    } else if (status === 'disconnected') {
      this.emit('disconnected');
      
      // Intentar reconexión automática
      logger.warn('⚠️ WebSocket desconectado. El navegador manejará la reconexión...');
    }
  }

  _startPeriodicReporting() {
    this.reportInterval = setInterval(() => {
      const uptime = (Date.now() - this.stats.startTime) / 1000;
      const pipsPerSecond = this.stats.pipsReceived / uptime;
      const wsStats = this.wsInterceptor.getStats();
      
      logger.info('📊 === REPORTE PIPRECEIVER ===');
      logger.info(`⏱️  Uptime: ${Math.floor(uptime / 60)} minutos`);
      logger.info(`📈 Pips recibidos: ${this.stats.pipsReceived}`);
      logger.info(`⚡ Velocidad: ${pipsPerSecond.toFixed(2)} pips/segundo`);
      logger.info(`🎯 Activo actual: ${this.stats.currentAsset || 'N/A'}`);
      logger.info(`📊 WebSocket - Válidos: ${wsStats.validPips} | Inválidos: ${wsStats.invalidPips}`);
      logger.info('📊 === FIN REPORTE ===');
      
    }, 60000); // Cada minuto
  }

  stop() {
    logger.info('🛑 Deteniendo PipReceiver...');
    
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
    }
    
    // Remover listeners del interceptor
    if (this.wsInterceptor) {
      this.wsInterceptor.removeAllListeners('pip');
      this.wsInterceptor.removeAllListeners('assetChanged');
      this.wsInterceptor.removeAllListeners('websocketStatus');
    }
    
    this.isRunning = false;
    this.removeAllListeners();
    
    // Estadísticas finales
    const uptime = (Date.now() - this.stats.startTime) / 1000;
    logger.info(`📊 Estadísticas finales:`);
    logger.info(`   Total pips: ${this.stats.pipsReceived}`);
    logger.info(`   Uptime: ${uptime.toFixed(0)}s`);
    logger.info(`   Rate promedio: ${(this.stats.pipsReceived / uptime).toFixed(2)} pips/s`);
    
    logger.info('✅ PipReceiver detenido');
  }

  // Métodos de compatibilidad con la versión anterior
  
  isHealthy() {
    if (!this.isRunning) return false;
    
    // Verificar si hemos recibido pips recientemente
    if (this.stats.lastPipTime) {
      const timeSinceLastPip = Date.now() - this.stats.lastPipTime;
      if (timeSinceLastPip > 60000) { // 1 minuto sin pips
        return false;
      }
    }
    
    return true;
  }

  getStats() {
    const wsStats = this.wsInterceptor ? this.wsInterceptor.getStats() : {};
    
    return {
      ...this.stats,
      isRunning: this.isRunning,
      uptime: Date.now() - this.stats.startTime,
      isHealthy: this.isHealthy(),
      websocketStats: wsStats
    };
  }

  // Método legacy para compatibilidad (ya no hace nada)
  handleRawMessage(jsonMessage) {
    logger.warn('⚠️ handleRawMessage llamado en PipReceiver v2.0 - Este método es legacy');
  }
}

export default PipReceiver;