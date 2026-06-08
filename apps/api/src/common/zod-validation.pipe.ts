import { ErrorCode } from '@brain-dock/shared';
import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { type ZodType, z } from 'zod';

/** Validates request payloads against a Zod schema (project uses Zod, not class-validator). */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION,
        message: 'Validation failed',
        details: z.treeifyError(result.error),
      });
    }
    return result.data;
  }
}
