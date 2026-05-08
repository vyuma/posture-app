export function MetricTile({
  label,
  value,
  valueSuffix,
}: {
  label: string;
  value: string;
  /** 例: 良い姿勢率の「%」を小さく横に並べる */
  valueSuffix?: string;
}) {
  return (
    <div
      className={`metric-tile ${valueSuffix ? "metric-tile--with-suffix" : ""}`}
    >
      <span>{label}</span>
      <div className="metric-tile-value-row">
        <strong>{value}</strong>
        {valueSuffix ? (
          <span className="metric-tile-value-suffix" aria-hidden="true">
            {valueSuffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}
