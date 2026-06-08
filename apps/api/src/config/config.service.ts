import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { type Env, envSchema } from './env.schema';

/** Holds the validated environment. Fails fast at construction on invalid config. */
@Injectable()
export class ConfigService {
  readonly env: Env;

  constructor() {
    this.env = ConfigService.parse(process.env);
  }

  /** Validate an env source. Exposed for tests; throws with a readable message. */
  static parse(source: NodeJS.ProcessEnv): Env {
    const parsed = envSchema.safeParse(source);
    if (!parsed.success) {
      throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
    }
    return parsed.data;
  }
}
