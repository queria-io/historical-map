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

export type AgeRow = { age: number; male: number; female: number };

/** 人口ピラミッド。左が男、右が女。age は 5 歳階級の下限 */
export const Pyramid = ({ rows }: { rows: AgeRow[] }) => {
  const sorted = [...rows].sort((a, b) => b.age - a.age);
  const sum = (k: "male" | "female") => rows.reduce((s, r) => s + r[k], 0);
  const total = sum("male") + sum("female") || 1;
  const max = Math.max(...rows.flatMap((r) => [r.male, r.female]), 1);
  const [w, rowH, mid] = [280, 9, 140];
  const half = mid - 18;
  const h = 14 + sorted.length * rowH + 4;
  return (
    <svg className="pyramid" viewBox={`0 0 ${w} ${h}`} role="img">
      <text x={4} y={10}>男 {pct(sum("male") / total)}</text>
      <text x={w - 4} y={10} textAnchor="end">女 {pct(sum("female") / total)}</text>
      {sorted.map((r, i) => {
        const y = 14 + i * rowH;
        const [lm, lf] = [(r.male / max) * half, (r.female / max) * half];
        return (
          <g key={r.age}>
            <rect className="male" x={mid - 16 - lm} y={y} width={lm} height={rowH - 1.5}>
              <title>{`男 ${r.age}歳〜 ${num(r.male)}`}</title>
            </rect>
            <rect className="female" x={mid + 16} y={y} width={lf} height={rowH - 1.5}>
              <title>{`女 ${r.age}歳〜 ${num(r.female)}`}</title>
            </rect>
            {r.age % 10 === 0 && <text x={mid} y={y + rowH - 2} textAnchor="middle">{r.age}</text>}
          </g>
        );
      })}
    </svg>
  );
};

export type ShareRow = { year: number; young: number; working: number; old: number };

/** 年齢 3 区分の割合を年ごとに 100% の横棒で並べる */
export const AgeShare = ({ rows }: { rows: ShareRow[] }) => {
  const [w, rowH, left] = [280, 22, 34];
  return (
    <>
      <svg viewBox={`0 0 ${w} ${rows.length * rowH}`} role="img">
        {rows.map((r, i) => {
          const t = r.young + r.working + r.old || 1;
          const parts = [r.young / t, r.working / t, r.old / t];
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
      <div className="legend">
        <span className="key share-0">0〜14歳</span>
        <span className="key share-1">15〜64歳</span>
        <span className="key share-2">65歳以上</span>
      </div>
    </>
  );
};
