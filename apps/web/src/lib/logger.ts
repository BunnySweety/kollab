/**
 * Frontend Logger
 * Simple logger that respects environment and can be extended for production logging
 */

const isProduction = import.meta.env.PROD;

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    // In production, only log errors and warnings
    if (isProduction) {
      return level === 'error' || level === 'warn';
    }
    // In development, log everything
    return true;
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      console.debug(`[DEBUG] ${message}`, context || '');
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.info(`[INFO] ${message}`, context || '');
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, context || '');
    }
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (this.shouldLog('error')) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error(`[ERROR] ${message}`, {
        error: errorMessage,
        stack: errorStack,
        ...context
      });
    }
  }
}

export const log = new Logger();

