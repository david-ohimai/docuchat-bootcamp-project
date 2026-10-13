import winston from 'winston';
import { config } from './config';

const isProduction = config.NODE_ENV === 'production';

// JSON in production (for log aggregators), colourised text in development.
export const logger = winston.createLogger({
  level: isProduction ? 'info' : config.NODE_ENV === 'test' ? 'error' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    isProduction
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} ${level}: ${message}${metaStr}`;
          }),
        ),
  ),
  defaultMeta: { service: 'docuchat' },
  transports: [new winston.transports.Console()],
});
