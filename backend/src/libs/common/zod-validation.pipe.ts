import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { ApiException } from './api-exception';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const details = result.error.issues.reduce<Record<string, string>>((acc, issue) => {
        acc[issue.path.join('.') || '(root)'] = issue.message;
        return acc;
      }, {});
      throw new ApiException('VALIDATION_FAILED', 'Request validation failed', { fields: details });
    }
    return result.data;
  }
}

export function zodBody(schema: ZodSchema) {
  return new ZodValidationPipe(schema);
}

/** Same validation semantics as zodBody, named explicitly for query params. */
export function zodQuery(schema: ZodSchema) {
  return new ZodValidationPipe(schema);
}
