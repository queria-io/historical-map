// 年ごとの値の折れ線。ライブラリを使わず SVG を組み立てる
export type Point = [number, number];

const W = 280;
const H = 96;
const PAD = { left: 44, right: 8, top: 8, bottom: 18 };

const fmt = new Intl.NumberFormat("ja-JP", { notation: "compact", maximumFractionDigits: 1 });

export function lineChart(series: { label: string; points: Point[] }[]): string {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return "";
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const y1 = Math.max(...ys) * 1.05;
  const x = (v: number) => PAD.left + ((v - x0) / Math.max(x1 - x0, 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (v / (y1 || 1)) * (H - PAD.top - PAD.bottom);
  const paths = series
    .map(
      (s, i) =>
        `<polyline class="line line-${i}" points="${s.points.map(([a, b]) => `${x(a)},${y(b)}`).join(" ")}"/>` +
        s.points.map(([a, b]) => `<circle class="dot line-${i}" cx="${x(a)}" cy="${y(b)}" r="2"><title>${s.label} ${a}年: ${b.toLocaleString("ja-JP")}</title></circle>`).join(""),
    )
    .join("");
  const axis =
    `<text x="${PAD.left - 4}" y="${y(y1 / 1.05) + 4}" text-anchor="end">${fmt.format(y1 / 1.05)}</text>` +
    `<text x="${PAD.left - 4}" y="${y(0)}" text-anchor="end">0</text>` +
    `<text x="${x(x0)}" y="${H - 4}">${x0}</text>` +
    `<text x="${x(x1)}" y="${H - 4}" text-anchor="end">${x1}</text>` +
    `<line class="axis" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(0)}" y2="${y(0)}"/>`;
  const legend =
    series.length > 1
      ? `<div class="legend">${series.map((s, i) => `<span class="key line-${i}">${s.label}</span>`).join("")}</div>`
      : "";
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${axis}${paths}</svg>${legend}`;
}
