import { z } from 'zod';

/**
 * These literal lists must stay in sync with `GraphNodeType`/`GraphEdgeType`
 * in `@tracedocs/core` — TS unions don't exist at runtime, so there's
 * nowhere to derive them from automatically without a codegen step, which
 * would be more machinery than four short arrays justify.
 */
const NODE_TYPES = [
  'file',
  'documentation_page',
  'documentation_section',
  'class',
  'function',
  'method',
] as const;

const EDGE_TYPES = ['CONTAINS', 'IMPORTS', 'CALLS', 'DOCUMENTS'] as const;

const nodeTypeSchema = z.enum(NODE_TYPES);
const edgeTypeSchema = z.enum(EDGE_TYPES);

/** Parses a comma-separated list of node types from a query string, e.g. `?types=function,class`. */
export const nodeTypesQuerySchema = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(',').map((v) => v.trim()) : undefined))
  .pipe(z.array(nodeTypeSchema).optional());

export const edgeTypesQuerySchema = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(',').map((v) => v.trim()) : undefined))
  .pipe(z.array(edgeTypeSchema).optional());

export const repositoryIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const nodeIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  nodeId: z.coerce.number().int().positive(),
});

export const indexBodySchema = z.object({
  path: z.string().min(1, 'path is required'),
});

export const graphQuerySchema = z.object({
  types: nodeTypesQuerySchema,
  edgeTypes: edgeTypesQuerySchema,
  limit: z.coerce.number().int().positive().max(2000).optional().default(300),
});

export const neighborsQuerySchema = z.object({
  direction: z.enum(['out', 'in', 'both']).optional().default('both'),
  depth: z.coerce.number().int().min(0).max(5).optional().default(1),
  types: edgeTypesQuerySchema,
});

export const pathQuerySchema = z.object({
  from: z.coerce.number().int().positive(),
  to: z.coerce.number().int().positive(),
  maxDepth: z.coerce.number().int().min(1).max(10).optional().default(6),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'q is required'),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});
