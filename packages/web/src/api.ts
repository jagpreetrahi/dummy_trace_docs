import type { GraphEdge, GraphEdgeType, GraphNode, GraphNodeType } from '@tracedocs/core';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:4000';

export interface RepositorySummaryDto {
  id: number;
  repositoryRoot: string;
  currentRevision: string | null;
  indexedAt: string | null;
  fileCount: number;
  nodeCount: number;
  edgeCount: number;
}

export interface RepositoryDetailDto extends RepositorySummaryDto {
  nodesByType: Partial<Record<GraphNodeType, number>>;
  edgesByType: Partial<Record<GraphEdgeType, number>>;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
}

export interface TraverseStepDto {
  node: GraphNode;
  depth: number;
  viaEdge: GraphEdge | null;
}

export interface PathStepDto {
  node: GraphNode;
  viaEdge: GraphEdge | null;
}

export interface IndexResultDto {
  repositoryId: number;
  revision: string | null;
  filesAdded: number;
  filesModified: number;
  filesRemoved: number;
  filesUnchanged: number;
  totalNodes: number;
  totalEdges: number;
  unresolvedImports: { filePath: string; specifier: string }[];
  unresolvedAnnotations: { filePath: string; target: string; reason: string }[];
  danglingReferences: { sourceStableId: string; targetStableId: string; edgeType: GraphEdgeType }[];
}

class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, body?.error?.message ?? response.statusText);
  }
  return response.json() as Promise<T>;
}

export function listRepositories(): Promise<{ repositories: RepositorySummaryDto[] }> {
  return request('/api/repositories');
}

export function getRepository(id: number): Promise<RepositoryDetailDto> {
  return request(`/api/repositories/${id}`);
}

export function indexRepository(path: string): Promise<IndexResultDto> {
  return request('/api/repositories/index', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export function getGraph(
  repositoryId: number,
  options: { types?: GraphNodeType[]; edgeTypes?: GraphEdgeType[]; limit?: number } = {},
): Promise<GraphResponse> {
  const params = new URLSearchParams();
  if (options.types?.length) params.set('types', options.types.join(','));
  if (options.edgeTypes?.length) params.set('edgeTypes', options.edgeTypes.join(','));
  if (options.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  return request(`/api/repositories/${repositoryId}/graph${qs ? `?${qs}` : ''}`);
}

export function getNode(
  repositoryId: number,
  nodeId: number,
): Promise<{ node: GraphNode; outgoing: GraphEdge[]; incoming: GraphEdge[] }> {
  return request(`/api/repositories/${repositoryId}/nodes/${nodeId}`);
}

export function getNeighbors(
  repositoryId: number,
  nodeId: number,
  options: { direction?: 'in' | 'out' | 'both'; depth?: number; types?: GraphEdgeType[] } = {},
): Promise<{ steps: TraverseStepDto[] }> {
  const params = new URLSearchParams();
  if (options.direction) params.set('direction', options.direction);
  if (options.depth !== undefined) params.set('depth', String(options.depth));
  if (options.types?.length) params.set('types', options.types.join(','));
  const qs = params.toString();
  return request(`/api/repositories/${repositoryId}/nodes/${nodeId}/neighbors${qs ? `?${qs}` : ''}`);
}

export function searchNodes(
  repositoryId: number,
  query: string,
  limit = 50,
): Promise<{ results: GraphNode[] }> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return request(`/api/repositories/${repositoryId}/search?${params.toString()}`);
}

export function findPath(
  repositoryId: number,
  from: number,
  to: number,
  maxDepth = 6,
): Promise<{ path: PathStepDto[] }> {
  const params = new URLSearchParams({ from: String(from), to: String(to), maxDepth: String(maxDepth) });
  return request(`/api/repositories/${repositoryId}/path?${params.toString()}`);
}

export { ApiError };
