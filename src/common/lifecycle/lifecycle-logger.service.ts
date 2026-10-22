import {
  BeforeApplicationShutdown,
  Injectable,
  OnApplicationShutdown,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class LifecycleLoggerService
  implements BeforeApplicationShutdown, OnApplicationShutdown
{
  constructor(
    @InjectPinoLogger('Lifecycle') private readonly logger: PinoLogger,
  ) {}

  beforeApplicationShutdown(signal?: string): void {
    this.logger.info({ signal }, 'Application shutting down');
  }

  onApplicationShutdown(signal?: string): void {
    this.logger.info({ signal }, 'Application shut down');
  }
}
