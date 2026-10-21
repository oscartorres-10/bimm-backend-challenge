/**
 * Typed, grouped access to configuration.
 *
 * Instead of every class reading raw strings like `process.env.PORT`, they
 * ask this service for a ready-made, validated settings object, e.g.
 * `config.http.timeoutMs`. Benefits:
 *   - one place to look for "where does this setting come from?";
 *   - TypeScript knows the exact type of every value;
 *   - tests can supply a fake config without touching `process.env`.
 *
 * In NestJS, a class marked with `@Injectable()` is a "provider": Nest creates
 * one instance and hands it to any class that lists it in its constructor.
 * This is called dependency injection (DI).
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

@Injectable()
export class AppConfigService {
  /**
   * `ConfigService<Env, true>` means "the config has the shape of Env and has
   * already been validated", so `get` never returns `undefined`.
   */
  constructor(private readonly config: ConfigService<Env, true>) { }

  /** Reads one validated variable. */
  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get port(): number {
    return this.get('PORT');
  }

  get host(): string {
    return this.get('HOST');
  }
}
