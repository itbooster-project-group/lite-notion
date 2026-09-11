export interface CollaborationLogger {
  error(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
}

export const consoleLogger: CollaborationLogger = {
  error(message, context) {
    console.error(JSON.stringify({ level: 'error', message, ...context }));
  },
  info(message, context) {
    console.log(JSON.stringify({ level: 'info', message, ...context }));
  },
  warn(message, context) {
    console.warn(JSON.stringify({ level: 'warn', message, ...context }));
  },
};
