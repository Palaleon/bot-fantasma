import winston from 'winston';
import config from '../../config/index.js';

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp }) => {
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

export default logger;