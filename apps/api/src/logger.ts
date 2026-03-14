import pino from 'pino';
import { config } from './config.js';

const isDev = config.nodeEnv !== 'production';

export const logger = pino({
  level: isDev ? 'debug' : 'info',
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
});

/**
 * Create a child logger with a module context.
 * Usage: `const log = createLogger('matchingJob');`
 */
export function createLogger(module: string) {
  return logger.child({ module });
}
