import { useEffect, useState } from 'react';
import type { GraphNode } from '@tracedocs/core';
import { searchNodes } from '../api';

export interface SearchPanelProps {
  repositoryId: number;
  onSelectNode: (nodeId: number) => void;
}

export function SearchPanel({ repositoryId, onSelectNode }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GraphNode[]>([]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(() => {
      searchNodes(repositoryId, query.trim())
        .then((res) => setResults(res.results))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timeout);
  }, [repositoryId, query]);

  return (
    <section className="panel" aria-label="Search">
      <h2>Search</h2>
      <label htmlFor="search-input">Symbol, file, or document</label>
      <input
        id="search-input"
        type="search"
        placeholder="e.g. refreshAccessToken"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.length > 0 && (
        <ul className="result-list">
          {results.map((node) => (
            <li key={node.id}>
              <button type="button" onClick={() => onSelectNode(node.id)}>
                <strong>{node.name}</strong> <span className="muted">({node.type})</span>
                {node.filePath && <div className="muted">{node.filePath}</div>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
