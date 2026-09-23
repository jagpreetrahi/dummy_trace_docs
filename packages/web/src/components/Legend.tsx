import { EDGE_TYPE_INFO, NODE_TYPE_INFO } from '../labels';

export function Legend() {
  return (
    <div className="legend">
      <div className="legend-row">
        {Object.values(NODE_TYPE_INFO).map((info) => (
          <span key={info.label} className="legend-item" title={info.description}>
            <span className="legend-swatch" style={{ background: info.color }} />
            {info.label}
          </span>
        ))}
      </div>
      <p className="muted">
        Arrows show direction — hover a relationship name below for what it means:{' '}
        {Object.values(EDGE_TYPE_INFO).map((info, i) => (
          <span key={info.label}>
            {i > 0 && ', '}
            <span className="legend-term" title={info.description}>
              {info.label}
            </span>
          </span>
        ))}
        .
      </p>
    </div>
  );
}
