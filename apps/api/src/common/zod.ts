import { applyDecorators, ArgumentMetadata, Body, Injectable, PipeTransform, Query } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AppError } from './errors';

@Injectable()
export class ZodPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown, _meta: ArgumentMetadata): any {
    const parsed = this.schema.safeParse(value ?? {}) as { success: boolean; data?: unknown; error?: { issues: { path: (string | number)[]; message: string }[] } };
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_FAILED',
        400,
        parsed.error!.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    return parsed.data;
  }
}

function jsonSchema(schema: ZodTypeAny) {
  return (zodToJsonSchema as (s: unknown, o: unknown) => any)(schema, { target: 'openApi3', $refStrategy: 'none' });
}

/** Validated request body + OpenAPI documentation from a zod schema. */
export function ZBody(schema: ZodTypeAny): ParameterDecorator {
  return (target, key, index) => {
    Body(new ZodPipe(schema))(target, key, index);
    if (key) applyDecorators(ApiBody({ schema: jsonSchema(schema) }))(target, key, Object.getOwnPropertyDescriptor(target, key)!);
  };
}

/** Validated query string. */
export function ZQuery(schema: ZodTypeAny): ParameterDecorator {
  return (target, key, index) => {
    Query(new ZodPipe(schema))(target, key, index);
    const js = jsonSchema(schema);
    const props = js.properties ?? js.allOf?.[0]?.properties ?? {};
    if (key) {
      for (const name of Object.keys(props)) {
        applyDecorators(ApiQuery({ name, required: false, schema: props[name] }))(
          target,
          key,
          Object.getOwnPropertyDescriptor(target, key)!,
        );
      }
    }
  };
}
