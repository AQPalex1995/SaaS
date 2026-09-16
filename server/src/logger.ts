import pino from 'pino';
import { serverConfig } from './config.js';

/**
 * Structured logger with correlation ID support.
 *
 * Usage:
 *   logger.info({ propertyId, requestId }, 'Property created');
 *   logger.error({ err, jobId }, 'Scraping failed');
 */
export const logger = pino({
  level: serverConfig.logLevel,
  transport:
    serverConfig.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
  serializers: {
    err: pino.stdSerializers.err,
  },
  // Never log sensitive data (top-level and nested paths).
  redact: {
    paths: [
      'password',
      '*.password',
      'token',
      '*.token',
      'accessToken',
      'access_token',
      'refreshToken',
      'refresh_token',
      'apiKey',
      'api_key',
      'secret',
      '*.secret',
      'authorization',
      'cookie',
      '*.privateKey',
      '*.private_key',
      '*.credentials',
    ],
    censor: '[redacted]',
  },
});

/**
 * Create a child logger with correlation context.
 */
export function childLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
