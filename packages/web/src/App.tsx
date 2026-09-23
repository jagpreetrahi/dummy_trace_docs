import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GraphEdge, GraphEdgeType, GraphNode, GraphNodeType } from '@tracedocs/core';
import {
  ApiError,
  findPath,
  getGraph,
  getNeighbors,
  getNode,
  getRepository,
  indexRepository,
  listRepositories,
  type RepositoryDetailDto,
  type RepositorySummaryDto,
} from './api';
import { EDGE_TYPES, FiltersPanel, NODE_TYPES } from './components/FiltersPanel';
import { GraphCanvas } from './components/GraphCanvas';
import { NodeDetails } from './components/NodeDetails';
import { NodeTable } from './components/NodeTable';
import { PathPanel } from './components/PathPanel';
import { RepositoryPanel } from './components/RepositoryPanel';
import { SearchPanel } from './components/SearchPanel';

function mergeNodes(existing: GraphNode[], incoming: GraphNode[]): GraphNode[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const node of incoming) byId.set(node.id, node);
  return [...byId.values()];
}

function mergeEdges(existing: GraphEdge[], incoming: GraphEdge[]): GraphEdge[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const edge of incoming) byId.set(edge.id, edge);
  return [...byId.values()];
}

export function App() {
  const [repositories, setRepositories] = useState<RepositorySummaryDto[]>([]);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<number | null>(null);
  const [repoDetail, setRepoDetail] = useState<RepositoryDetailDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [view, setView] = useState<'graph' | 'table'>('graph');

  const [nodeTypeFilter, setNodeTypeFilter] = useState<Set<GraphNodeType>>(new Set(NODE_TYPES));
  const [edgeTypeFilter, setEdgeTypeFilter] = useState<Set<GraphEdgeType>>(new Set(EDGE_TYPES));
  const [limit, setLimit] = useState(300);
  const [depth, setDepth] = useState(1);

  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [selectedOutgoing, setSelectedOutgoing] = useState<GraphEdge[]>([]);
  const [selectedIncoming, setSelectedIncoming] = useState<GraphEdge[]>([]);
  const [expanding, setExpanding] = useState(false);

  const [indexing, setIndexing] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);

  const [pathFrom, setPathFrom] = useState<number | null>(null);
  const [pathTo, setPathTo] = useState<number | null>(null);
  const [pathError, setPathError] = useState<string | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<number>>(new Set());
  const [highlightedEdgeIds, setHighlightedEdgeIds] = useState<Set<number>>(new Set());

  const loadRepositories = useCallback(async () => {
    try {
      const res = await listRepositories();
      setRepositories(res.repositories);
      return res.repositories;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
      return [];
    }
  }, []);

  useEffect(() => {
    void loadRepositories();
  }, [loadRepositories]);

  const reloadGraph = useCallback(
    async (repositoryId: number) => {
      try {
        const res = await getGraph(repositoryId, {
          types: [...nodeTypeFilter],
          edgeTypes: [...edgeTypeFilter],
          limit,
        });
        setNodes(res.nodes);
        setEdges(res.edges);
        setHighlightedNodeIds(new Set());
        setHighlightedEdgeIds(new Set());
        setLoadError(null);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : String(error));
      }
    },
    [nodeTypeFilter, edgeTypeFilter, limit],
  );

  const selectRepository = useCallback(
    async (id: number) => {
      setSelectedRepositoryId(id);
      setSelectedNodeId(null);
      try {
        setRepoDetail(await getRepository(id));
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : String(error));
      }
      await reloadGraph(id);
    },
    [reloadGraph],
  );

  const handleIndex = useCallback(
    async (path: string) => {
      setIndexing(true);
      setIndexError(null);
      try {
        const result = await indexRepository(path);
        await loadRepositories();
        await selectRepository(result.repositoryId);
      } catch (error) {
        setIndexError(error instanceof ApiError ? error.message : String(error));
      } finally {
        setIndexing(false);
      }
    },
    [loadRepositories, selectRepository],
  );

  const selectNode = useCallback(
    async (nodeId: number) => {
      if (selectedRepositoryId === null) return;
      setSelectedNodeId(nodeId);
      try {
        const detail = await getNode(selectedRepositoryId, nodeId);
        setSelectedOutgoing(detail.outgoing);
        setSelectedIncoming(detail.incoming);

        const alreadyVisible = nodes.some((n) => n.id === nodeId);
        if (!alreadyVisible) {
          const neighbors = await getNeighbors(selectedRepositoryId, nodeId, { direction: 'both', depth: 1 });
          setNodes((prev) => mergeNodes(prev, neighbors.steps.map((s) => s.node)));
          setEdges((prev) =>
            mergeEdges(
              prev,
              neighbors.steps.flatMap((s) => (s.viaEdge ? [s.viaEdge] : [])),
            ),
          );
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : String(error));
      }
    },
    [selectedRepositoryId, nodes],
  );

  const expandNeighbors = useCallback(async () => {
    if (selectedRepositoryId === null || selectedNodeId === null) return;
    setExpanding(true);
    try {
      const res = await getNeighbors(selectedRepositoryId, selectedNodeId, {
        direction: 'both',
        depth,
        types: [...edgeTypeFilter],
      });
      setNodes((prev) => mergeNodes(prev, res.steps.map((s) => s.node)));
      setEdges((prev) =>
        mergeEdges(
          prev,
          res.steps.flatMap((s) => (s.viaEdge ? [s.viaEdge] : [])),
        ),
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setExpanding(false);
    }
  }, [selectedRepositoryId, selectedNodeId, depth, edgeTypeFilter]);

  const handleFindPath = useCallback(
    async (from: number, to: number) => {
      if (selectedRepositoryId === null) return;
      setPathError(null);
      try {
        const res = await findPath(selectedRepositoryId, from, to);
        setNodes((prev) => mergeNodes(prev, res.path.map((s) => s.node)));
        setEdges((prev) =>
          mergeEdges(
            prev,
            res.path.flatMap((s) => (s.viaEdge ? [s.viaEdge] : [])),
          ),
        );
        setHighlightedNodeIds(new Set(res.path.map((s) => s.node.id)));
        setHighlightedEdgeIds(new Set(res.path.flatMap((s) => (s.viaEdge ? [s.viaEdge.id] : []))));
      } catch (error) {
        setPathError(error instanceof ApiError ? error.message : String(error));
      }
    },
    [selectedRepositoryId],
  );

  const toggleNodeType = (type: GraphNodeType) => {
    setNodeTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleEdgeType = (type: GraphEdgeType) => {
    setEdgeTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  return (
    <div className="app">
      <header>
        <h1>TraceDocs — Dependency Graph Explorer</h1>
        <p className="tagline">
          Explore how your code and documentation are connected — which files import which, which
          functions call which, and which docs describe which code.
        </p>
      </header>

      {loadError && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}

      <div className="layout">
        <aside className="sidebar">
          <RepositoryPanel
            repositories={repositories}
            selectedRepositoryId={selectedRepositoryId}
            detail={repoDetail}
            onSelect={(id) => void selectRepository(id)}
            onIndex={handleIndex}
            indexing={indexing}
            error={indexError}
          />

          {selectedRepositoryId !== null && (
            <>
              <FiltersPanel
                nodeTypes={nodeTypeFilter}
                edgeTypes={edgeTypeFilter}
                limit={limit}
                depth={depth}
                onToggleNodeType={toggleNodeType}
                onToggleEdgeType={toggleEdgeType}
                onLimitChange={setLimit}
                onDepthChange={setDepth}
                onReload={() => void reloadGraph(selectedRepositoryId)}
              />
              <SearchPanel repositoryId={selectedRepositoryId} onSelectNode={(id) => void selectNode(id)} />
              <PathPanel
                from={pathFrom}
                to={pathTo}
                onSetFrom={setPathFrom}
                onSetTo={setPathTo}
                onFindPath={(from, to) => void handleFindPath(from, to)}
                onClear={() => {
                  setPathFrom(null);
                  setPathTo(null);
                  setHighlightedNodeIds(new Set());
                  setHighlightedEdgeIds(new Set());
                  setPathError(null);
                }}
                error={pathError}
              />
            </>
          )}
        </aside>

        <main className="main-view">
          {selectedRepositoryId === null ? (
            <div className="onboarding">
              <h2>Getting started</h2>
              <ol>
                <li>
                  On the left, either pick an already-indexed repository from the dropdown, or type
                  a local folder path and click <strong>Index</strong> to analyze a new one.
                </li>
                <li>
                  Once a repository is selected, its graph appears here. Each dot is a file,
                  function, class, method, or doc section — see the legend below the graph for what
                  each color means.
                </li>
                <li>
                  Click any dot to see its details on the right, including what it calls, imports,
                  or documents.
                </li>
                <li>
                  Use <strong>Expand neighbors</strong> in the details panel to reveal more of the
                  graph around a node, or <strong>Search</strong> to jump straight to something by
                  name.
                </li>
                <li>
                  To see how two things are connected, set one node as path "From" and another as
                  "To", then click <strong>Find path</strong> — the connecting route lights up
                  orange.
                </li>
              </ol>
              {repositories.length === 0 && (
                <p className="muted">No repositories are indexed yet — start with step 1 above.</p>
              )}
            </div>
          ) : (
            <>
              <div className="view-toggle">
                <button type="button" disabled={view === 'graph'} onClick={() => setView('graph')}>
                  Graph
                </button>
                <button type="button" disabled={view === 'table'} onClick={() => setView('table')}>
                  Table
                </button>
                <span className="muted">
                  {nodes.length} nodes / {edges.length} edges loaded
                </span>
              </div>
              {view === 'graph' ? (
                <GraphCanvas
                  nodes={nodes}
                  edges={edges}
                  selectedNodeId={selectedNodeId}
                  highlightedNodeIds={highlightedNodeIds}
                  highlightedEdgeIds={highlightedEdgeIds}
                  onSelectNode={(id) => void selectNode(id)}
                />
              ) : (
                <NodeTable nodes={nodes} selectedNodeId={selectedNodeId} onSelectNode={(id) => void selectNode(id)} />
              )}
            </>
          )}
        </main>

        <aside className="sidebar">
          <NodeDetails
            node={selectedNode}
            outgoing={selectedOutgoing}
            incoming={selectedIncoming}
            nodesById={nodesById}
            onSelectNode={(id) => void selectNode(id)}
            onExpand={() => void expandNeighbors()}
            onSetAsFrom={() => selectedNodeId !== null && setPathFrom(selectedNodeId)}
            onSetAsTo={() => selectedNodeId !== null && setPathTo(selectedNodeId)}
            expanding={expanding}
          />
        </aside>
      </div>
    </div>
  );
}
