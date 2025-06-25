/*
================================================================================
||                          CHANNEL MANAGER v1.0                              ||
||                    Sistema de Canalización Multi-Activo                    ||
================================================================================

PROPÓSITO:
Este módulo es el CORAZÓN de la arquitectura multi-canal. Actúa como un
distribuidor inteligente que recibe TODOS los pips y los direcciona al canal
correspondiente según el activo.

ARQUITECTURA:
- Fase 1A (ACTUAL): Un canal único que procesa todo (compatibilidad)
- Fase 1B: 2-3 canales activos
- Fase 1C: Worker Threads por canal
- Fase 2: 10 canales paralelos completos

FLUJO:
PipReceiver → ChannelManager → TradingChannel(es) → Operator

VENTAJAS:
1. Elimina el cuello de botella del procesamiento secuencial
2. Permite análisis independiente por activo
3. Aísla fallos (un canal no afecta a otros)
4. Escala horizontalmente sin límites
5. Telemetría detallada por activo

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
      // Fase 1A: modo compatibilidad (un solo canal global)
      compatibilityMode: true,
      maxChannels: 10,
      defaultChannel: 'GLOBAL', // Canal único en modo compatibilidad
    };
    
    // Métricas globales del sistema
    this.metrics = {
      totalPipsReceived: 0,
      pipsPerAsset: new Map(),
      channelCreations: 0,
      lastUpdateTime: Date.now(),
      startTime: Date.now(),
    };
    
    // Estado del sistema
    this.isRunning = false;
    
    logger.info('🎯 ChannelManager inicializado - Arquitectura Multi-Canal v1.0');
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
    
    // NUEVO: Interceptar pips directamente para métricas
    // (El PipReceiver seguirá emitiendo velaCerrada normalmente)
    this._interceptPipReceiver(pipReceiver);
    
    this.isRunning = true;
    logger.info('✅ ChannelManager operativo - Esperando datos...');
    
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
      
      // Re-emitir para que el Operator la capture
      this.emit('señalMultiCanal', signal);
      
      logger.info(`🎯 [${asset}] Señal aprobada y propagada al Operator`);
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
      logger.info(`📊 [${asset}] Procesadas ${assetMetrics} velas`);
    }
  }
  
  /**
   * Intercepta el PipReceiver para métricas sin interferir
   */
  _interceptPipReceiver(pipReceiver) {
    const originalHandleRawMessage = pipReceiver.handleRawMessage.bind(pipReceiver);
    
    pipReceiver.handleRawMessage = (jsonMessage) => {
      try {
        const message = JSON.parse(jsonMessage);
        if (message.event === 'pipUpdate' && message.data) {
          const { raw_asset } = message.data;
          if (raw_asset) {
            this._updateMetrics(raw_asset);
          }
        }
      } catch (e) {
        // Ignorar errores de parseo
      }
      
      // Llamar al método original
      originalHandleRawMessage(jsonMessage);
    };
    
    logger.info('🔍 Interceptor de métricas instalado en PipReceiver');
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
      logger.info(`📡 Canal [${name}]: ${metrics.signalsGenerated} señales, ${metrics.approvedSignals} aprobadas`);
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
      },
      performance: {
        pipsPerSecond: this.metrics.totalPipsReceived / ((Date.now() - this.metrics.startTime) / 1000),
        avgPipsPerChannel: this.metrics.totalPipsReceived / Math.max(1, this.channels.size),
      },
    };
  }
  
  /**
   * Cambia entre modo compatibilidad y multi-canal
   * IMPORTANTE: Esto se usará en Fase 1B para activar multi-canal gradualmente
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