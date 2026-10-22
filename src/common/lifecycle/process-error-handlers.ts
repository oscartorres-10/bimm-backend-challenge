/** The subset of a logger these handlers need (Pino-compatible). */
export interface ProcessLogger {
  error(obj: object, msg: string): void;
  fatal(obj: object, msg: string): void;
}

export function registerProcessErrorHandlers(
  logger: ProcessLogger,
  target: Pick<NodeJS.Process, 'on'> = process,
  exit: (code: number) => void = (code) => process.exit(code),
): void {
  target.on('unhandledRejection', (reason: unknown) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });
  target.on('uncaughtException', (error: Error) => {
    logger.fatal({ err: error }, 'Uncaught exception; exiting');
    exit(1);
  });
}
