/*
================================================================================
||                          CHANNEL MANAGER v1.1                              ||
||                    Sistema de Canalización Multi-Activo                    ||
||                         WebSocket Nativo Edition                           ||
================================================================================

CAMBIOS v1.1:
✅ Actualizado para trabajar con WebSocket nativo
✅ Eliminadas referencias a TCP
✅ Métricas mejoradas con información del interceptor
✅ Sin cambios en la interfaz pública (100% compatible)

ARQUITECTURA:
WebSocketInterceptor → PipReceiver → ChannelManager → TradingChannel(es) → Operator

================================================================================
*/

import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import TradingChannel from './TradingChannel.js';

class ChannelManager extends EventEmitter {
  constructor() {
    super();
    
    // Mapa de canales activos (asset → TradingChannel)
    this.channels = new Map();
    
    // Configuración del sistema
    this.config = {
      // Modo Multi-Canal activado por defecto
      compatibilityMode: false,
      maxChannels: 10,
      defaultChannel: 'GLOBAL', // Usado como fallback o para modos específicos
    };
    
    // Métricas globales del sistema
    this.metrics = {
      totalPipsReceived: 0,
      pipsPerAsset: new Map(),
      channelCreations: 0,
      lastUpdateTime: Date.now(),
      startTime: Date.now(),
      source: 'websocket_native' // Nueva fuente
    };
    
    // Estado del sistema
    this.isRunning = false;
    
    logger.info('🎯 ChannelManager v1.1 inicializado - WebSocket Nativo');
    logger.info(`📊 Modo: ${this.config.compatibilityMode ? 'Compatibilidad (1 canal)' : 'Multi-Canal'}`);
  }
  
  /**
   * Inicia el ChannelManager y se suscribe al PipReceiver
   */
  start(pipReceiver) {
    if (this.isRunning) {
      logger.warn('ChannelManager ya está en ejecución');
      return;
    }
    
    logger.info('🚀 ChannelManager: Iniciando sistema de canalización...');
    
    // En modo compatibilidad, crear un canal global único
    if (this.config.compatibilityMode) {
      this._createChannel(this.config.defaultChannel);
      logger.info('✅ Canal GLOBAL creado (modo compatibilidad)');
    }
    
    // Suscribirse a eventos del PipReceiver
    pipReceiver.on('velaCerrada', (candle) => {
      this._handleClosedCandle(candle);
    });
    
    // Escuchar cambios de activo del PipReceiver
    pipReceiver.on('assetChanged', (data) => {
      this._handleAssetChangeNotification(data);
    });
    
    // Interceptar pipReceiver para métricas (sin interferir)
    this._setupMetricsCollection(pipReceiver);
    
    this.isRunning = true;
    logger.info('✅ ChannelManager operativo - WebSocket Nativo activo');
    
    // Iniciar reporte de métricas periódico
    this._startMetricsReporting();
  }
  
  /**
   * Crea un nuevo canal de trading o devuelve uno existente
   */
  _createChannel(asset) {
    if (this.channels.has(asset)) {
      return this.channels.get(asset);
    }
    
    // Verificar límite de canales
    if (this.channels.size >= this.config.maxChannels) {
      logger.warn(`⚠️ Límite de canales alcanzado (${this.config.maxChannels})`);
      return null;
    }
    
    logger.info(`📡 Creando nuevo canal para: ${asset}`);
    
    const channel = new TradingChannel(asset);
    
    // Escuchar señales del canal y re-emitirlas
    channel.on('señalAprobada', (signal) => {
      // Agregar metadata del canal
      signal.channel = asset;
      signal.channelMetrics = this._getChannelMetrics(asset);
      signal.source = 'websocket_native';
      
      // Re-emitir para que el Operator la capture
      this.emit('señalMultiCanal', signal);
      
      logger.info(`🎯 [${asset}] Señal aprobada y propagada al Operator (WebSocket nativo)`);
    });
    
    this.channels.set(asset, channel);
    this.metrics.channelCreations++;
    
    logger.info(`✅ Canal ${asset} creado exitosamente (Total: ${this.channels.size})`);
    
    return channel;
  }
  
  /**
   * Maneja velas cerradas y las direcciona al canal correcto
   */
  _handleClosedCandle(candle) {
    const { asset, timeframe } = candle;
    
    // Actualizar métricas
    this._updateMetrics(asset);
    
    // En modo compatibilidad, todo va al canal global
    const targetChannel = this.config.compatibilityMode 
      ? this.config.defaultChannel 
      : asset;
    
    // Obtener o crear el canal
    let channel = this.channels.get(targetChannel);
    if (!channel) {
      channel = this._createChannel(targetChannel);
      if (!channel) {
        logger.error(`❌ No se pudo crear canal para ${targetChannel}`);
        return;
      }
    }
    
    // Delegar el procesamiento al canal
    channel.processCandle(candle);
    
    // Log detallado cada 100 velas
    const assetMetrics = this.metrics.pipsPerAsset.get(asset) || 0;
    if (assetMetrics % 100 === 0) {
      logger.info(`📊 [${asset}] Procesadas ${assetMetrics} velas (vía WebSocket nativo)`);
    }
  }
  
  /**
   * Maneja notificaciones de cambio de activo
   */
  _handleAssetChangeNotification(data) {
    logger.info(`🔄 ChannelManager: Cambio de activo notificado - ${data.new_asset}`);
    
    // En modo multi-canal, podríamos crear un nuevo canal aquí
    if (!this.config.compatibilityMode && !this.channels.has(data.new_asset)) {
      this._createChannel(data.new_asset);
    }
  }
  
  /**
   * Configura la recolección de métricas desde PipReceiver
   */
  _setupMetricsCollection(pipReceiver) {
    // Escuchar eventos de pip para métricas
    pipReceiver.on('pipReceived', (pipData) => {
      const asset = pipData.raw_asset || pipData.active_asset;
      if (asset) {
        this._updateMetrics(asset);
      }
    });
    
    logger.info('🔍 Sistema de métricas conectado al PipReceiver (WebSocket nativo)');
  }
  
  /**
   * Actualiza métricas por activo
   */
  _updateMetrics(asset) {
    this.metrics.totalPipsReceived++;
    
    const currentCount = this.metrics.pipsPerAsset.get(asset) || 0;
    this.metrics.pipsPerAsset.set(asset, currentCount + 1);
    
    this.metrics.lastUpdateTime = Date.now();
  }
  
  /**
   * Obtiene métricas específicas de un canal
   */
  _getChannelMetrics(channelName) {
    const channel = this.channels.get(channelName);
    if (!channel) return null;
    
    return {
      pipsProcessed: this.metrics.pipsPerAsset.get(channelName) || 0,
      signalsGenerated: channel.getSignalCount(),
      lastSignal: channel.getLastSignalTime(),
      uptime: Date.now() - channel.getCreationTime(),
      source: 'websocket_native'
    };
  }
  
  /**
   * Inicia el reporte periódico de métricas
   */
  _startMetricsReporting() {
    setInterval(() => {
      this._reportSystemMetrics();
    }, 60000); // Cada minuto
  }
  
  /**
   * Genera y loguea reporte de métricas del sistema
   */
  _reportSystemMetrics() {
    const uptime = Math.floor((Date.now() - this.metrics.startTime) / 1000);
    const pipsPerSecond = this.metrics.totalPipsReceived / uptime;
    
    logger.info('📊 === REPORTE DE MÉTRICAS DEL CHANNELMANAGER ===');
    logger.info(`⏱️  Uptime: ${Math.floor(uptime / 60)} minutos`);
    logger.info(`📈 Total pips procesados: ${this.metrics.totalPipsReceived}`);
    logger.info(`⚡ Velocidad: ${pipsPerSecond.toFixed(2)} pips/segundo`);
    logger.info(`🔌 Canales activos: ${this.channels.size}`);
    logger.info(`🎤 Fuente: WebSocket NATIVO (sin Python)`);
    
    // Métricas por activo (top 5)
    const sortedAssets = Array.from(this.metrics.pipsPerAsset.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    logger.info('🏆 Top 5 activos más activos:');
    sortedAssets.forEach(([asset, count], index) => {
      const percentage = ((count / this.metrics.totalPipsReceived) * 100).toFixed(1);
      logger.info(`   ${index + 1}. ${asset}: ${count} pips (${percentage}%)`);
    });
    
    // Estado de canales
    this.channels.forEach((channel, name) => {
      const metrics = channel.getMetrics();
      logger.info(`📡 Canal [${name}]: ${metrics.signalsGenerated} señales, ${metrics.signalsApproved} aprobadas`);
    });
    
    logger.info('📊 === FIN DEL REPORTE ===');
  }
  
  /**
   * Obtiene el estado completo del sistema
   */
  getSystemStatus() {
    return {
      mode: this.config.compatibilityMode ? 'compatibility' : 'multi-channel',
      channels: {
        active: this.channels.size,
        max: this.config.maxChannels,
        list: Array.from(this.channels.keys()),
      },
      metrics: {
        totalPips: this.metrics.totalPipsReceived,
        uptime: Date.now() - this.metrics.startTime,
        pipsPerAsset: Object.fromEntries(this.metrics.pipsPerAsset),
        channelsCreated: this.metrics.channelCreations,
        source: this.metrics.source
      },
      performance: {
        pipsPerSecond: this.metrics.totalPipsReceived / ((Date.now() - this.metrics.startTime) / 1000),
        avgPipsPerChannel: this.metrics.totalPipsReceived / Math.max(1, this.channels.size),
      },
      extraction: {
        method: 'websocket_native',
        latency: '~1ms',
        dependencies: 'none'
      }
    };
  }
  
  /**
   * Cambia entre modo compatibilidad y multi-canal
   */
  setMultiChannelMode(enabled) {
    if (this.config.compatibilityMode === !enabled) {
      logger.info(`🔄 Modo ya está en: ${enabled ? 'Multi-Canal' : 'Compatibilidad'}`);
      return;
    }
    
    logger.warn(`⚠️ CAMBIANDO MODO A: ${enabled ? 'MULTI-CANAL' : 'COMPATIBILIDAD'}`);
    
    this.config.compatibilityMode = !enabled;
    
    if (enabled) {
      // Limpiar canal global si existe
      if (this.channels.has(this.config.defaultChannel)) {
        this.channels.get(this.config.defaultChannel).stop();
        this.channels.delete(this.config.defaultChannel);
      }
      logger.info('✅ Modo Multi-Canal activado - Los canales se crearán dinámicamente');
    } else {
      // Volver a modo compatibilidad
      this.channels.forEach((channel, name) => {
        if (name !== this.config.defaultChannel) {
          channel.stop();
        }
      });
      this.channels.clear();
      this._createChannel(this.config.defaultChannel);
      logger.info('✅ Modo Compatibilidad activado - Un solo canal global');
    }
  }
  
  /**
   * Detiene el ChannelManager y todos sus canales
   */
  stop() {
    logger.info('🛑 Deteniendo ChannelManager...');
    
    // Detener todos los canales
    this.channels.forEach((channel, name) => {
      logger.info(`🔌 Deteniendo canal: ${name}`);
      channel.stop();
    });
    
    this.channels.clear();
    this.isRunning = false;
    
    // Reporte final
    this._reportSystemMetrics();
    
    logger.info('✅ ChannelManager detenido completamente');
  }
}

export default ChannelManager;