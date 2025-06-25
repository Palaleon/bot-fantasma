import { parentPort, workerData } from 'worker_threads';
import ChannelManager from './ChannelManager.js';

// ⚡ Este worker ejecuta un canal de trading independiente

// workerData trae la configuración específica para este canal
const channelManager = new ChannelManager(workerData);

parentPort.on('message', (msg) => {
  if (msg.type === 'start') {
    channelManager.start();
  } else if (msg.type === 'stop') {
    channelManager.stop();
  }
  // Aquí puedes agregar más comandos si quieres
});

// Puedes enviar mensajes de vuelta al proceso principal así:
channelManager.on('status', (status) => {
  parentPort.postMessage({ type: 'status', status });
});