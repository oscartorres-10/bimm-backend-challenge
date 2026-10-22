/** Unit tests for startup/shutdown logging and last-resort error handlers. */
import { EventEmitter } from 'node:events';
import { createMockLogger } from '../../../test/helpers/test-doubles';
import { LifecycleLoggerService } from './lifecycle-logger.service';
import { registerProcessErrorHandlers } from './process-error-handlers';
import { registerShutdownSignals } from './shutdown-signals';
import { jest } from '../../../test/helpers/jest';

describe('LifecycleLoggerService', () => {
  it('logs the beginning and the end of shutdown with the signal', () => {
    const logger = createMockLogger();
    const service = new LifecycleLoggerService(logger);

    service.beforeApplicationShutdown('SIGTERM');
    service.onApplicationShutdown('SIGTERM');

    expect(logger.info).toHaveBeenNthCalledWith(
      1,
      { signal: 'SIGTERM' },
      'Application shutting down',
    );
    expect(logger.info).toHaveBeenNthCalledWith(
      2,
      { signal: 'SIGTERM' },
      'Application shut down',
    );
  });
});

describe('registerProcessErrorHandlers', () => {
  it('logs unhandled promise rejections without exiting', () => {
    const logger = createMockLogger();
    const fakeProcess = new EventEmitter();
    const exit = jest.fn();
    registerProcessErrorHandlers(logger, fakeProcess as never, exit);

    const reason = new Error('forgotten promise');
    fakeProcess.emit('unhandledRejection', reason);

    expect(logger.error).toHaveBeenCalledWith(
      { err: reason },
      'Unhandled promise rejection',
    );
    expect(exit).not.toHaveBeenCalled();
  });

  it('logs uncaught exceptions as fatal and exits with code 1', () => {
    const logger = createMockLogger();
    const fakeProcess = new EventEmitter();
    const exit = jest.fn();
    registerProcessErrorHandlers(logger, fakeProcess as never, exit);

    const error = new Error('boom');
    fakeProcess.emit('uncaughtException', error);

    expect(logger.fatal).toHaveBeenCalledWith(
      { err: error },
      'Uncaught exception; exiting',
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('registerShutdownSignals', () => {
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it.each(['SIGTERM', 'SIGINT'])(
    'closes the app with the signal on %s, then exits with code 0',
    async (signal) => {
      const app = { close: jest.fn().mockResolvedValue(undefined) };
      const fakeProcess = new EventEmitter();
      const exit = jest.fn();
      registerShutdownSignals(
        app,
        createMockLogger(),
        fakeProcess as never,
        exit,
      );

      fakeProcess.emit(signal, signal);
      expect(exit).not.toHaveBeenCalled();
      await flush();

      expect(app.close).toHaveBeenCalledWith(signal);
      expect(exit).toHaveBeenCalledWith(0);
    },
  );

  it('logs and exits with code 1 when closing fails', async () => {
    const error = new Error('db close failed');
    const app = { close: jest.fn().mockRejectedValue(error) };
    const logger = createMockLogger();
    const fakeProcess = new EventEmitter();
    const exit = jest.fn();
    registerShutdownSignals(app, logger, fakeProcess as never, exit);

    fakeProcess.emit('SIGTERM', 'SIGTERM');
    await flush();

    expect(logger.error).toHaveBeenCalledWith(
      { err: error, signal: 'SIGTERM' },
      'Graceful shutdown failed',
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('forces an exit with code 1 on a second signal', () => {
    const app = { close: jest.fn(() => new Promise<void>(() => undefined)) };
    const fakeProcess = new EventEmitter();
    const exit = jest.fn();
    registerShutdownSignals(
      app,
      createMockLogger(),
      fakeProcess as never,
      exit,
    );

    fakeProcess.emit('SIGINT', 'SIGINT');
    fakeProcess.emit('SIGINT', 'SIGINT');

    expect(app.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
