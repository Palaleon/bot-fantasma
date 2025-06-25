import net from 'net';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import CandleBuilder from '../logic/CandleBuilder.js';

class PipReceiver extends EventEmitter {
  constructor() {
    super();
    this.client = new net.Socket();
    this.buffer = '';
    this.reconnectInterval = 5000;
    this.candleBuilder = new CandleBuilder((closedCandle) => {
      this.emit('velaCerrada', closedCandle);
    });
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.stats = {
      pipsReceived: 0,
      errorsCount: 0,
      lastPipTime: null,
      startTime: Date.now()
    };
    this.setupListeners();
  }

  setupListeners() {
    this.client.on('connect', () => {
      logger.info(`✅ Conectado al analizador en ${config.tcpHost}:${config.tcpPort}`);
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
    });

    this.client.on('data', (chunk) => {
      this.buffer += chunk.toString();
      let boundary = this.buffer.indexOf('\n');
      
      while (boundary !== -1) {
        const message = this.buffer.substring(0, boundary);
        this.buffer = this.buffer.substring(boundary + 1);
        
        if (message) {
          this.handleRawMessage(message);
        }
        
        boundary = this.buffer.indexOf('\n');
      }
    });

    this.client.on('close', () => {
      logger.warn('🔌 Conexión con el analizador cerrada. Intentando reconectar...');
      this.isConnected = false;
      this.emit('disconnected');
      this.reconnect();
    });

    this.client.on('error', (err) => {
      logger.error(`Error en la conexión TCP: ${err.message}`);
      this.stats.errorsCount++;
      this.emit('error', err);
    });

    this.client.on('timeout', () => {
      logger.warn('⏱️ Timeout en conexión TCP');
      this.client.destroy();
    });
  }

  handleRawMessage(jsonMessage) {
    try {
      const message = JSON.parse(jsonMessage);
      
      // Log para debugging
      if (this.stats.pipsReceived % 100 === 0) {
        logger.debug(`📊 Mensaje recibido tipo: ${message.event}, pips totales: ${this.stats.pipsReceived}`);
      }
      
      // Manejar diferentes tipos de eventos del analyzer
      switch (message.event) {
        case 'pipUpdate':
          this.handlePipUpdate(message.data);
          break;
          
        case 'candleData':
          this.handleCandleData(message.data);
          break;
          
        case 'assetChange':
          this.handleAssetChange(message.data);
          break;
          
        case 'statusReport':
          this.handleStatusReport(message.data);
          break;
          
        case 'securityAlert':
        case 'healthAlert':
          this.handleAlert(message.event, message.data);
          break;
          
        case 'shutdown':
          this.handleShutdown(message.data);
          break;
          
        default:
          logger.debug(`Evento no manejado: ${message.event}`);
      }
      
    } catch (error) {
      logger.error(`Error al parsear mensaje JSON: ${error.message}`);
      logger.debug(`Mensaje problemático: ${jsonMessage}`);
      this.stats.errorsCount++;
    }
  }

  handlePipUpdate(pipData) {
    try {
      // Validar estructura completa del pip v3.2
      const requiredFields = ['pip', 'active_asset', 'pip_timestamp_ms', 'raw_asset'];
      const hasAllFields = requiredFields.every(field => pipData.hasOwnProperty(field));
      
      if (!hasAllFields) {
        // Si falta raw_asset, intentar extraerlo del active_asset
        if (!pipData.raw_asset && pipData.active_asset) {
          pipData.raw_asset = this.extractRawAsset(pipData.active_asset);
        }
      }
      
      // Validar pip value
      if (typeof pipData.pip !== 'number' || isNaN(pipData.pip) || pipData.pip <= 0) {
        logger.warn(`Pip inválido recibido: ${pipData.pip}`);
        this.stats.errorsCount++;
        return;
      }
      
      // Estadísticas
      this.stats.pipsReceived++;
      this.stats.lastPipTime = Date.now();
      
      // Construir velas
      this.candleBuilder.addPip(pipData);
      
      // Emitir evento de pip para otros componentes
      this.emit('pipReceived', pipData);
      
      // Log periódico
      if (this.stats.pipsReceived % 50 === 0) {
        const uptime = (Date.now() - this.stats.startTime) / 1000;
        const pipsPerSecond = this.stats.pipsReceived / uptime;
        logger.info(`📈 Pips: ${this.stats.pipsReceived} | Rate: ${pipsPerSecond.toFixed(2)}/s | Activo: ${pipData.active_asset}`);
      }
      
    } catch (error) {
      logger.error(`Error procesando pipUpdate: ${error.message}`);
      this.stats.errorsCount++;
    }
  }

  handleCandleData(candleData) {
    try {
      logger.info(`🕯️ Vela finalizada recibida: ${candleData.active_asset} - ${candleData.decision}`);
      this.emit('candleCompleted', candleData);
    } catch (error) {
      logger.error(`Error procesando candleData: ${error.message}`);
    }
  }

  handleAssetChange(data) {
    try {
      logger.warn(`🔄 Cambio de activo: ${data.previous_asset} → ${data.new_asset}`);
      this.emit('assetChanged', data);
      
      // Reiniciar estadísticas por activo si es necesario
      if (data.reset_aggregator) {
        logger.info('🔧 Reiniciando agregadores por cambio de activo');
      }
      
    } catch (error) {
      logger.error(`Error procesando assetChange: ${error.message}`);
    }
  }

  handleStatusReport(data) {
    try {
      logger.debug('📊 Reporte de estado del analizador recibido');
      this.emit('analyzerStatus', data);
    } catch (error) {
      logger.error(`Error procesando statusReport: ${error.message}`);
    }
  }

  handleAlert(type, data) {
    try {
      logger.warn(`🚨 Alerta ${type}: ${data.type} - ${data.message || data.details}`);
      this.emit('alert', { type, data });
    } catch (error) {
      logger.error(`Error procesando alerta: ${error.message}`);
    }
  }

  handleShutdown(data) {
    try {
      logger.warn(`🛑 Analizador cerrándose: ${data.reason}`);
      this.emit('analyzerShutdown', data);
    } catch (error) {
      logger.error(`Error procesando shutdown: ${error.message}`);
    }
  }

  extractRawAsset(displayAsset) {
    // Convertir formato display a raw: "EUR/USD (OTC)" → "EURUSD_otc"
    if (!displayAsset) return displayAsset;
    
    let raw = displayAsset.replace(/\//g, '');
    if (raw.includes('(OTC)')) {
      raw = raw.replace(' (OTC)', '_otc').replace('(OTC)', '_otc');
    }
    
    return raw;
  }

  connect() {
    if (this.isConnected) {
      logger.info('📡 Ya conectado al analizador');
      return;
    }
    
    logger.info(`📡 Intentando conectar al analizador en ${config.tcpHost}:${config.tcpPort}...`);
    
    // Configurar timeout
    this.client.setTimeout(30000); // 30 segundos
    
    this.client.connect(config.tcpPort, config.tcpHost);
  }

  start() {
    this.connect();
  }

  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`❌ Máximo de intentos de reconexión alcanzado (${this.maxReconnectAttempts})`);
      this.emit('maxReconnectAttemptsReached');
      return;
    }
    
    this.reconnectAttempts++;
    
    setTimeout(() => {
      logger.info(`🔄 Reintentando conexión... (intento ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      this.connect();
    }, this.reconnectInterval);
  }

  stop() {
    logger.info('PipReceiver: Cerrando conexión con el analizador.');
    
    if (this.client) {
      this.client.destroy();
    }
    
    // Limpiar listeners
    this.removeAllListeners();
    
    // Log estadísticas finales
    const uptime = (Date.now() - this.stats.startTime) / 1000;
    logger.info(`📊 Estadísticas finales:`);
    logger.info(`   Total pips: ${this.stats.pipsReceived}`);
    logger.info(`   Errores: ${this.stats.errorsCount}`);
    logger.info(`   Uptime: ${uptime.toFixed(0)}s`);
    logger.info(`   Rate promedio: ${(this.stats.pipsReceived / uptime).toFixed(2)} pips/s`);
  }

  // Métodos de utilidad
  isHealthy() {
    if (!this.isConnected) return false;
    
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
    return {
      ...this.stats,
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      uptime: Date.now() - this.stats.startTime,
      isHealthy: this.isHealthy()
    };
  }
}

export default PipReceiver;