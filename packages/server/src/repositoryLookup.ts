import type { GraphNode } from '@tracedocs/core';
import type { GraphStore, RepositorySummary } from '@tracedocs/graph';
import { NotFoundError } from './errors.js';

export function getRepositoryOrThrow(store: GraphStore, repositoryId: number): RepositorySummary {
  const repo = store.getRepository(repositoryId);
  if (!repo) throw new NotFoundError(`Repository ${repositoryId} not found`);
  return repo;
}

export function getNodeInRepoOrThrow(store: GraphStore, repositoryId: number, nodeId: number): GraphNode {
  const node = store.getNodeById(nodeId);
  if (!node || node.repositoryId !== repositoryId) {
    throw new NotFoundError(`Node ${nodeId} not found in repository ${repositoryId}`);
  }
  return node;
}
