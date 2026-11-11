// ライブラリを使わない SVG のグラフ
const num = (v: number) => v.toLocaleString("ja-JP");
const compact = new Intl.NumberFormat("ja-JP", { notation: "compact", maximumFractionDigits: 1 });
const pct = (v: number) => `${Math.round(v * 100)}%`;

export type Point = [number, number];

/** 年ごとの値の折れ線 */
export const LineChart = ({ series }: { series: { label: string; points: Point[] }[] }) => {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;
  const [W, H] = [280, 96];
  const pad = { left: 44, right: 8, top: 8, bottom: 18 };
  const xs = all.map((p) => p[0]);
  const top = Math.max(...all.map((p) => p[1]));
  const [x0, x1, y1] = [Math.min(...xs), Math.max(...xs), top * 1.05];
  const x = (v: number) => pad.left + ((v - x0) / Math.max(x1 - x0, 1)) * (W - pad.left - pad.right);
  const y = (v: number) => H - pad.bottom - (v / (y1 || 1)) * (H - pad.top - pad.bottom);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        <text x={pad.left - 4} y={y(top) + 4} textAnchor="end">{compact.format(top)}</text>
        <text x={pad.left - 4} y={y(0)} textAnchor="end">0</text>
        <text x={x(x0)} y={H - 4}>{x0}</text>
        <text x={x(x1)} y={H - 4} textAnchor="end">{x1}</text>
        <line className="axis" x1={pad.left} x2={W - pad.right} y1={y(0)} y2={y(0)} />
        {series.map((s, i) => (
          <g key={s.label} className={`line-${i}`}>
            <polyline className="line" points={s.points.map(([a, b]) => `${x(a)},${y(b)}`).join(" ")} />
            {s.points.map(([a, b]) => (
              <circle key={a} className="dot" cx={x(a)} cy={y(b)} r={2}>
                <title>{`${s.label} ${a}年: ${num(b)}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s, i) => (
            <span key={s.label} className={`key line-${i}`}>{s.label}</span>
          ))}
        </div>
      )}
    </>
  );
};

export type ShareRow = { year: number; parts: number[] };

const fractions = (parts: number[]) => {
  const t = parts.reduce((a, b) => a + b, 0) || 1;
  return parts.map((p) => p / t);
};

/** 割合を年ごとに 100% の横棒で並べる。parts は labels と同じ順 */
export const ShareBars = ({ rows, labels }: { rows: ShareRow[]; labels: string[] }) => {
  const [w, rowH, left] = [280, 22, 34];
  return (
    <>
      <svg viewBox={`0 0 ${w} ${rows.length * rowH}`} role="img">
        {rows.map((r, i) => {
          const parts = fractions(r.parts);
          const starts = parts.map((_, j) => left + parts.slice(0, j).reduce((s, p) => s + p, 0) * (w - left));
          const y = i * rowH;
          return (
            <g key={r.year}>
              <text x={0} y={y + rowH - 9}>{r.year}</text>
              {parts.map((p, j) => (
                <g key={j}>
                  <rect className={`share-${j}`} x={starts[j]} y={y} width={p * (w - left)} height={rowH - 4} />
                  {p >= 0.08 && (
                    <text className="in" x={starts[j] + (p * (w - left)) / 2} y={y + rowH - 9} textAnchor="middle">{pct(p)}</text>
                  )}
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <Legend labels={labels} />
    </>
  );
};

export const Legend = ({ labels }: { labels: string[] }) => (
  <div className="legend">
    {labels.map((l, j) => (
      <span key={l} className={`key share-${j}`}>{l}</span>
    ))}
  </div>
);

/** 1 本だけの細い 100% の横棒 */
export const ShareBar = ({ parts, labels }: { parts: number[]; labels: string[] }) => {
  const f = fractions(parts);
  return (
    <span className="sharebar">
      {f.map((p, j) => (
        <span key={j} className={`share-${j}`} style={{ width: pct(p) }} title={`${labels[j]} ${pct(p)}`} />
      ))}
    </span>
  );
};

/** 小さな折れ線。mark の年に点を打つ */
export const Sparkline = ({ points, mark }: { points: Point[]; mark?: number }) => {
  if (points.length < 2) return <span className="spark" />;
  const [W, H, p] = [72, 20, 2];
  const xs = points.map((q) => q[0]);
  const ys = points.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const x = (v: number) => p + ((v - x0) / Math.max(x1 - x0, 1)) * (W - 2 * p);
  const y = (v: number) => H - p - ((v - y0) / Math.max(y1 - y0, 1e-9)) * (H - 2 * p);
  const m = points.find((q) => q[0] === mark);
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline points={points.map(([a, b]) => `${x(a)},${y(b)}`).join(" ")} />
      {m && <circle cx={x(m[0])} cy={y(m[1])} r={2.5} />}
    </svg>
  );
};
