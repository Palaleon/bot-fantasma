import winston from 'winston';
import config from '../config/index.js';
import { EventEmitter } from 'events';

// --- INICIO DE LA ACTUALIZACIÓN ---

// 1. LÓGICA DE GESTIÓN DE COLORES POR ACTIVO
// Se mantiene la misma lógica de asignación de colores que en la propuesta anterior.

const resetAnsi = '\x1b[0m';

// Paleta de colores para los activos
const assetAnsiColors = [
  '\x1b[32m', // Verde
  '\x1b[33m', // Amarillo
  '\x1b[34m', // Azul
  '\x1b[35m', // Magenta
  '\x1b[36m', // Cian
];

// Colores específicos para los niveles de log cuando no hay un activo
const levelColors = {
    info: '\x1b[37m', // Blanco
    warn: '\x1b[33m', // Amarillo
    error: '\x1b[31m', // Rojo
};

const assetColorMap = new Map();
let colorIndex = 0;

/**
 * Asigna y recupera un color consistente para un activo.
 * @param {string} [asset] - El nombre del activo.
 * @returns {string|null} El código de color ANSI para el activo o null si no se proporciona.
 */
function getAssetColor(asset) {
  if (!asset) {
    return null;
  }
  if (!assetColorMap.has(asset)) {
    assetColorMap.set(asset, assetAnsiColors[colorIndex]);
    colorIndex = (colorIndex + 1) % assetAnsiColors.length;
  }
  return assetColorMap.get(asset);
}


// --- FIN DE LA ACTUALIZACIÓN ---


// La funcionalidad del Emitter se mantiene intacta.
class LogEmitter extends EventEmitter {}
const logEmitter = new LogEmitter();

const { combine, timestamp, printf } = winston.format;


// --- INICIO DE LA ACTUALIZACIÓN ---

// 2. FORMATO DE LOG ACTUALIZADO
// Se modifica la función `printf` para que maneje la lógica de colores.
// Ya no usamos el `colorize()` genérico de winston, sino que aplicamos
// nuestros colores manualmente para tener control total.

const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  // Se mantiene el emisor de eventos, es una parte crítica de tu arquitectura.
  logEmitter.emit('log', { level, message, timestamp, meta });

  const asset = meta.asset; // El activo ahora vendrá en los metadatos.
  
  // Se obtiene el color del activo. Si no hay activo, se usa el color del nivel.
  const color = getAssetColor(asset) || levelColors[level] || levelColors['info'];

  // Se construye el mensaje final aplicando el color y el reset ANSI.
  return `${color}${timestamp} [${level.toUpperCase()}]: ${message}${resetAnsi}`;
});


// --- FIN DE LA ACTUALIZACIÓN ---


const logger = winston.createLogger({
  level: config.logLevel,
  format: combine(
    // Se elimina `colorize()` para evitar conflictos con nuestra lógica manual.
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    logFormat // Se usa nuestro nuevo formato personalizado.
  ),
  transports: [
    new winston.transports.Console()
  ],
});

// Se exportan los mismos módulos para no romper la compatibilidad.
export { logEmitter };
export default logger;