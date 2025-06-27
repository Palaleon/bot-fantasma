import { parentPort } from 'worker_threads';
import ChannelManager from '../modules/ChannelManager.js';

let channelManager;

// Este worker aloja toda la lógica de análisis para mantener el hilo principal libre.

parentPort.on('message', (message) => {
  const { type, data } = message;

  if (type === 'start') {
    // Al iniciar, creamos el gestor de canales, que es el cerebro del bot.
    channelManager = new ChannelManager();
    // Escuchamos el evento final, cuando se aprueba una operación.
    channelManager.on('señalMultiCanal', (finalSignal) => {
      // Enviamos la señal de vuelta al hilo principal para su ejecución.
      parentPort.postMessage({ type: 'signal', data: finalSignal });
    });
  } else if (type === 'candle') {
    if (channelManager) channelManager.processCandle(data);
  } else if (type === 'getState') {
    // Responde al hilo principal con el estado actual del Humanizer.
    // Esto es vital para guardar el aprendizaje del bot al cerrar.
    if (channelManager && channelManager.humanizer) {
      parentPort.postMessage({ type: 'humanizerState', data: channelManager.humanizer.state });
    }
  }
});