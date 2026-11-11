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

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 人口ピラミッド。左が男、右が女。age は 5 歳階級の下限 */
export function pyramid(rows: { age: number; male: number; female: number }[]): string {
  const sorted = [...rows].sort((a, b) => b.age - a.age);
  const total = rows.reduce((s, r) => s + r.male + r.female, 0) || 1;
  const max = Math.max(...rows.flatMap((r) => [r.male, r.female]), 1);
  const [w, rowH, mid] = [280, 9, 140];
  const half = mid - 18;
  const bars = sorted
    .map((r, i) => {
      const y = 14 + i * rowH;
      const [lm, lf] = [(r.male / max) * half, (r.female / max) * half];
      return (
        `<rect class="male" x="${mid - 16 - lm}" y="${y}" width="${lm}" height="${rowH - 1.5}"><title>男 ${r.age}歳〜 ${r.male.toLocaleString("ja-JP")}</title></rect>` +
        `<rect class="female" x="${mid + 16}" y="${y}" width="${lf}" height="${rowH - 1.5}"><title>女 ${r.age}歳〜 ${r.female.toLocaleString("ja-JP")}</title></rect>` +
        (r.age % 10 === 0 ? `<text x="${mid}" y="${y + rowH - 2}" text-anchor="middle">${r.age}</text>` : "")
      );
    })
    .join("");
  const h = 14 + sorted.length * rowH + 4;
  const sum = (k: "male" | "female") => pct(rows.reduce((s, r) => s + r[k], 0) / total);
  const head = `<text x="4" y="10">男 ${sum("male")}</text><text x="${w - 4}" y="10" text-anchor="end">女 ${sum("female")}</text>`;
  return `<svg class="pyramid" viewBox="0 0 ${w} ${h}" role="img">${head}${bars}</svg>`;
}

/** 年齢 3 区分の割合を年ごとに 100% の横棒で並べる */
export function ageShare(rows: { year: number; young: number; working: number; old: number }[]): string {
  const [w, rowH, left] = [280, 22, 34];
  const bars = rows
    .map((r, i) => {
      const t = r.young + r.working + r.old || 1;
      const parts = [r.young / t, r.working / t, r.old / t];
      const y = i * rowH;
      let x = left;
      const segs = parts
        .map((p, j) => {
          const width = p * (w - left);
          const seg =
            `<rect class="share-${j}" x="${x}" y="${y}" width="${width}" height="${rowH - 4}"/>` +
            (p >= 0.08 ? `<text class="in" x="${x + width / 2}" y="${y + rowH - 9}" text-anchor="middle">${pct(p)}</text>` : "");
          x += width;
          return seg;
        })
        .join("");
      return `<text x="0" y="${y + rowH - 9}">${r.year}</text>${segs}`;
    })
    .join("");
  const legend = `<div class="legend"><span class="key share-0">0〜14歳</span><span class="key share-1">15〜64歳</span><span class="key share-2">65歳以上</span></div>`;
  return `<svg viewBox="0 0 ${w} ${rows.length * rowH}" role="img">${bars}</svg>${legend}`;
}
