import { useState } from 'react';
import type { GraphEdgeType, GraphNodeType } from '@tracedocs/core';
import type { RepositoryDetailDto, RepositorySummaryDto } from '../api';
import { edgeTypeLabel, nodeTypeLabel } from '../labels';

export interface RepositoryPanelProps {
  repositories: RepositorySummaryDto[];
  selectedRepositoryId: number | null;
  detail: RepositoryDetailDto | null;
  onSelect: (id: number) => void;
  onIndex: (path: string) => Promise<void>;
  indexing: boolean;
  error: string | null;
}

function formatBreakdown<T extends string>(
  counts: Partial<Record<T, number>>,
  labelFor: (type: T) => string,
): string {
  return Object.entries(counts)
    .map(([type, count]) => `${labelFor(type as T)}: ${count}`)
    .join(', ');
}

export function RepositoryPanel({
  repositories,
  selectedRepositoryId,
  detail,
  onSelect,
  onIndex,
  indexing,
  error,
}: RepositoryPanelProps) {
  const [path, setPath] = useState('');

  return (
    <section className="panel" aria-label="Repository">
      <h2>Repository</h2>

      <label htmlFor="repo-select">Already-analyzed repositories</label>
      <select
        id="repo-select"
        value={selectedRepositoryId ?? ''}
        onChange={(e) => onSelect(Number(e.target.value))}
      >
        <option value="" disabled>
          Select a repository…
        </option>
        {repositories.map((repo) => (
          <option key={repo.id} value={repo.id}>
            {repo.repositoryRoot}
          </option>
        ))}
      </select>

      <form
        className="index-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (path.trim()) void onIndex(path.trim());
        }}
      >
        <label htmlFor="index-path">Or analyze a new folder on this computer</label>
        <input
          id="index-path"
          type="text"
          placeholder="C:\path\to\repo"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
        <button type="submit" disabled={indexing || !path.trim()}>
          {indexing ? 'Analyzing…' : 'Analyze'}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {detail && (
        <dl className="stats">
          <dt>Git revision</dt>
          <dd>{detail.currentRevision ?? '(no commits yet)'}</dd>
          <dt>Last analyzed</dt>
          <dd>{detail.indexedAt ?? '—'}</dd>
          <dt>Files</dt>
          <dd>{detail.fileCount}</dd>
          <dt>Things found</dt>
          <dd>
            {detail.nodeCount} total ({formatBreakdown<GraphNodeType>(detail.nodesByType, nodeTypeLabel)})
          </dd>
          <dt>Relationships found</dt>
          <dd>
            {detail.edgeCount} total ({formatBreakdown<GraphEdgeType>(detail.edgesByType, edgeTypeLabel)})
          </dd>
        </dl>
      )}
    </section>
  );
}
