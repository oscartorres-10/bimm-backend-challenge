/** The part of the Nest application this module needs. */
export interface ClosableApp {
  close(signal?: string): Promise<void>;
}

/** The subset of a logger this module needs (Pino-compatible). */
export interface ShutdownLogger {
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

export function registerShutdownSignals(
  app: ClosableApp,
  logger: ShutdownLogger,
  target: Pick<NodeJS.Process, 'on'> = process,
  exit: (code: number) => void = (code) => process.exit(code),
): void {
  let shuttingDown = false;

  const onSignal = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      logger.warn({ signal }, 'Second stop signal received; forcing exit');
      exit(1);
      return;
    }
    shuttingDown = true;
    app.close(signal).then(
      () => exit(0),
      (error: unknown) => {
        logger.error({ err: error, signal }, 'Graceful shutdown failed');
        exit(1);
      },
    );
  };

  for (const signal of SHUTDOWN_SIGNALS) {
    target.on(signal, onSignal);
  }
}
