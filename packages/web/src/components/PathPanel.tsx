import { useState } from 'react';

export interface PathPanelProps {
  from: number | null;
  to: number | null;
  onSetFrom: (id: number | null) => void;
  onSetTo: (id: number | null) => void;
  onFindPath: (from: number, to: number) => void;
  onClear: () => void;
  error: string | null;
}

export function PathPanel({ from, to, onSetFrom, onSetTo, onFindPath, onClear, error }: PathPanelProps) {
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');

  const fromValue = from ?? (fromInput ? Number(fromInput) : null);
  const toValue = to ?? (toInput ? Number(toInput) : null);

  return (
    <section className="panel" aria-label="Path highlighting">
      <h2>Highlight a path</h2>
      <p className="muted">
        Select a node and use its details panel to set From/To, or type node ids directly.
      </p>

      <label htmlFor="from-input">From node id</label>
      <input
        id="from-input"
        type="number"
        value={from ?? fromInput}
        onChange={(e) => {
          setFromInput(e.target.value);
          onSetFrom(null);
        }}
      />

      <label htmlFor="to-input">To node id</label>
      <input
        id="to-input"
        type="number"
        value={to ?? toInput}
        onChange={(e) => {
          setToInput(e.target.value);
          onSetTo(null);
        }}
      />

      <div className="button-row">
        <button
          type="button"
          disabled={!fromValue || !toValue}
          onClick={() => fromValue && toValue && onFindPath(fromValue, toValue)}
        >
          Find path
        </button>
        <button type="button" onClick={onClear}>
          Clear
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
