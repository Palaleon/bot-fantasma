import winston from 'winston';
import config from '../config/index.js';
import { EventEmitter } from 'events';

class LogEmitter extends EventEmitter {}
const logEmitter = new LogEmitter();

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp }) => {
  logEmitter.emit('log', { level, message, timestamp }); // Emitir el log como un evento
  return `${timestamp} ${level}: ${message}`;
});

const logger = winston.createLogger({
  level: config.logLevel,
  format: combine(
    colorize(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    logFormat
  ),
  transports: [
    new winston.transports.Console()
  ],
});

export { logEmitter };
export default logger;