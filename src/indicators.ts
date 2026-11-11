// 昔の数字の欄に並べる指標。統計の行から組み立てる純関数
import type { Point, ShareRow } from "./kit/charts";
import type { LandPrice, Stat } from "./sql";

export type Indicator =
  | { kind: "num"; label: string; points: Point[]; format: (v: number) => string }
  | { kind: "share"; label: string; labels: string[]; rows: ShareRow[] };

const num = (unit: string, digits = 0) => (v: number) =>
  `${v.toLocaleString("ja-JP", { maximumFractionDigits: digits })}${unit}`;
const percent = (v: number) => `${Math.round(v * 100)}%`;

const series = (stats: Stat[], item: string): Point[] =>
  stats.filter((s) => s.item === item).map((s) => [s.year, s.value]);

const ratio = (a: Point[], b: Point[]): Point[] =>
  a.flatMap(([year, v]) => {
    const d = b.find((q) => q[0] === year)?.[1];
    return d ? [[year, v / d] as Point] : [];
  });

const shares = (stats: Stat[], items: string[]): ShareRow[] => {
  const each = items.map((i) => new Map(series(stats, i)));
  return [...each[0].keys()].flatMap((year) => {
    const parts = each.map((m) => m.get(year));
    return parts.every((p) => p != null) ? [{ year, parts: parts as number[] }] : [];
  });
};

export const indicators = (stats: Stat[], prices: LandPrice[]): Indicator[] =>
  ([
    { kind: "num", label: "人口", points: series(stats, "A1101"), format: num("人") },
    {
      kind: "share",
      label: "年齢構成",
      labels: ["0〜14歳", "15〜64歳", "65歳以上"],
      rows: shares(stats, ["A1301", "A1302", "A1303"]),
    },
    { kind: "num", label: "小学校の児童数", points: series(stats, "E2501"), format: num("人") },
    { kind: "num", label: "小学校の数", points: series(stats, "E2101"), format: num("校") },
    {
      kind: "num",
      label: "市外へ通勤する人",
      points: ratio(series(stats, "F2705"), series(stats, "F1102")),
      format: percent,
    },
    {
      kind: "share",
      label: "働く人の産業",
      labels: ["第1次", "第2次", "第3次"],
      rows: shares(stats, ["F2201", "F2211", "F2221"]),
    },
    {
      kind: "num",
      label: "製造品出荷額",
      points: series(stats, "C3401").map(([y, v]): Point => [y, v / 100]),
      format: num("億円"),
    },
    {
      kind: "num",
      label: "住宅地の地価",
      points: prices.map((p): Point => [p.year, p.price]),
      format: num("円/m²"),
    },
  ] satisfies Indicator[]).filter((i: Indicator) => (i.kind === "num" ? i.points.length > 0 : i.rows.length > 0));

/** target に一番近い年。同じ近さなら古い方 */
export const nearest = <T extends { year: number }>(rows: T[], target: number): T | undefined =>
  rows.reduce<T | undefined>(
    (best, r) => (best && Math.abs(best.year - target) <= Math.abs(r.year - target) ? best : r),
    undefined,
  );
