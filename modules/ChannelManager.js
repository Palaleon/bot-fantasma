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
import Humanizer from './Humanizer.js'; // Importar Humanizer

class ChannelManager extends EventEmitter {
  constructor() {
    super();
    this.channels = new Map();
    this.humanizer = new Humanizer(); // Instancia única y centralizada
    // ... (misma configuración y métricas)
    this._connectHumanizer();
  }

  _connectHumanizer() {
    this.humanizer.on('decisionFinal', (decision) => {
      if (decision.approved) {
        this.emit('señalMultiCanal', decision.signal); // Propagar al Operator
      }
    });
  }

  _createChannel(asset) {
    // ... (misma lógica de _createChannel)
    const channel = new TradingChannel(asset);

    // Escuchar señales técnicas del canal y pasarlas al Humanizer
    channel.on('señalTecnicaCanal', (signal) => {
      this.humanizer.analyzeSignal(signal);
    });

    this.channels.set(asset, channel);
    return channel;
  }

  // ... (resto de los métodos sin cambios significativos)
}

export default ChannelManager;
