/**
 * Professional Logger for Kollab API
 * 
 * Features:
 * - Structured logging with levels (debug, info, warn, error)
 * - Environment-aware (dev vs production)
 * - Colorized output in development
 * - JSON output in production for log aggregation
 * - Context support for better tracing
 * - Performance timing utilities
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

class Logger {
  private isDevelopment: boolean;
  private minLevel: LogLevel;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== 'production';
    this.minLevel = this.getMinLevel();
  }

  private getMinLevel(): LogLevel {
    const level = process.env.LOG_LEVEL?.toLowerCase();
    switch (level) {
      case 'debug':
        return LogLevel.DEBUG;
      case 'info':
        return LogLevel.INFO;
      case 'warn':
        return LogLevel.WARN;
      case 'error':
        return LogLevel.ERROR;
      default:
        return this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentIndex = levels.indexOf(level);
    const minIndex = levels.indexOf(this.minLevel);
    return currentIndex >= minIndex;
  }

  private formatDevelopment(entry: LogEntry): string {
    const colors = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m',  // Green
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m', // Red
      reset: '\x1b[0m'
    };

    const color = colors[entry.level];
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    let output = `${color}[${entry.level.toUpperCase()}]${colors.reset} ${timestamp} - ${entry.message}`;

    if (entry.context && Object.keys(entry.context).length > 0) {
      output += `\n  Context: ${JSON.stringify(entry.context, null, 2)}`;
    }

    if (entry.error) {
      output += `\n  Error: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\n  Stack: ${entry.error.stack}`;
      }
    }

    return output;
  }

  private formatProduction(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  private write(level: LogLevel, message: string, context?: LogContext, error?: Error) {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    };

    if (error) {
      const errorWithCode = error as Error & { code?: string | number };
      entry.error = {
        message: error.message,
        stack: error.stack,
        code: errorWithCode.code !== undefined ? String(errorWithCode.code) : undefined
      };
    }

    const formatted = this.isDevelopment
      ? this.formatDevelopment(entry)
      : this.formatProduction(entry);

    // Use appropriate console method
    // Note: In development, use console.log for warnings to avoid PowerShell treating them as errors
    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(formatted);
        break;
      case LogLevel.WARN:
        // Use console.log in development to avoid PowerShell error interpretation
        // In production, warnings are still important and can use console.warn
        if (this.isDevelopment) {
          console.log(formatted);
        } else {
          console.warn(formatted);
        }
        break;
      case LogLevel.ERROR:
        console.error(formatted);
        break;
    }
  }

  /**
   * Log debug message (verbose, only in development)
   */
  debug(message: string, context?: LogContext) {
    this.write(LogLevel.DEBUG, message, context);
  }

  /**
   * Log info message (general information)
   */
  info(message: string, context?: LogContext) {
    this.write(LogLevel.INFO, message, context);
  }

  /**
   * Log warning message (potential issues)
   */
  warn(message: string, context?: LogContext) {
    this.write(LogLevel.WARN, message, context);
  }

  /**
   * Log error message (errors and exceptions)
   */
  error(message: string, error?: Error, context?: LogContext) {
    this.write(LogLevel.ERROR, message, context, error);
  }

  /**
   * Time a function execution
   */
  async time<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.debug(`${label} completed`, { duration: `${duration}ms` });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(`${label} failed`, error as Error, { duration: `${duration}ms` });
      throw error;
    }
  }

  /**
   * Create a child logger with persistent context
   */
  child(context: LogContext): ChildLogger {
    return new ChildLogger(this, context);
  }
}

/**
 * Child logger with persistent context
 */
class ChildLogger {
  constructor(
    private parent: Logger,
    private baseContext: LogContext
  ) {}

  private mergeContext(context?: LogContext): LogContext {
    return { ...this.baseContext, ...context };
  }

  debug(message: string, context?: LogContext) {
    this.parent.debug(message, this.mergeContext(context));
  }

  info(message: string, context?: LogContext) {
    this.parent.info(message, this.mergeContext(context));
  }

  warn(message: string, context?: LogContext) {
    this.parent.warn(message, this.mergeContext(context));
  }

  error(message: string, error?: Error, context?: LogContext) {
    this.parent.error(message, error, this.mergeContext(context));
  }

  async time<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
    return this.parent.time(label, fn);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions
export const log = {
  debug: (message: string, context?: LogContext) => logger.debug(message, context),
  info: (message: string, context?: LogContext) => logger.info(message, context),
  warn: (message: string, context?: LogContext) => logger.warn(message, context),
  error: (message: string, error?: Error, context?: LogContext) => logger.error(message, error, context),
  time: <T>(label: string, fn: () => Promise<T> | T) => logger.time(label, fn),
  child: (context: LogContext) => logger.child(context)
};

