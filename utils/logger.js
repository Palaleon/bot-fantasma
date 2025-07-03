import winston from 'winston';
import config from '../config/index.js';
import { EventEmitter } from 'events';

const resetAnsi = '\x1b[0m';

// Paleta de colores ampliada para los activos
const assetAnsiColors = [
  '\x1b[32m', // Verde
  '\x1b[34m', // Azul
  '\x1b[35m', // Magenta
  '\x1b[36m', // Cian
  '\x1b[91m', // Rojo claro
  '\x1b[92m', // Verde claro
  '\x1b[93m', // Amarillo claro
  '\x1b[94m', // Azul claro
  '\x1b[95m', // Magenta claro
  '\x1b[96m', // Cian claro
];

const levelColors = {
    info: '\x1b[37m', // Blanco
    warn: '\x1b[33m', // Amarillo
    error: '\x1b[31m', // Rojo
    debug: '\x1b[90m', // Gris
};

const assetInfo = new Map();
let colorIndex = 0;
let letterCode = 65; // Código ASCII para 'A'

function getAssetDetails(asset) {
  if (!asset) {
    return null;
  }
  if (!assetInfo.has(asset)) {
    const details = {
        color: assetAnsiColors[colorIndex % assetAnsiColors.length],
        letter: String.fromCharCode(letterCode)
    };
    assetInfo.set(asset, details);
    colorIndex++;
    letterCode++;
  }
  return assetInfo.get(asset);
}

class LogEmitter extends EventEmitter {}
const logEmitter = new LogEmitter();

const { combine, timestamp, printf } = winston.format;

const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  logEmitter.emit('log', { level, message, timestamp, meta });

  const asset = meta.asset;
  const details = getAssetDetails(asset);
  
  const color = details ? details.color : (levelColors[level] || levelColors['info']);
  const prefix = details ? `[${details.letter}]` : `[${level.toUpperCase()}]`;

  // Para los logs de DEBUG, mantenemos el nivel para no perder información
  const levelDisplay = level === 'debug' ? ` [${level.toUpperCase()}]` : '';

  return `${color}${timestamp} ${prefix}${levelDisplay}: ${message}${resetAnsi}`;
});

const logger = winston.createLogger({
  level: config.logLevel,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    logFormat
  ),
  transports: [
    new winston.transports.Console()
  ],
});

export { logEmitter };
export default logger;