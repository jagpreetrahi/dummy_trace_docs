import type { z } from 'zod';
import { BadRequestError } from './errors.js';

/**
 * Parses `input` with `schema`, raising a 400 `BadRequestError` with a
 * readable message on failure. Typed as `ZodType<T, ZodTypeDef, any>`
 * rather than the `ZodSchema<T>` alias (which pins Input = Output = T) —
 * our query schemas have `.default()`s, so their Input (optional fields)
 * and Output (defaults applied) genuinely differ.
 */
export function parseOrThrow<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestError(result.error.issues.map((issue) => issue.message).join('; '));
  }
  return result.data;
}
