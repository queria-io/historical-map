// 昔の数字の欄。選んだ年代に近い年の値を大きく、今の値は小さく添える。行を開くと推移のグラフ
import { LineChart, ShareBar, ShareBars, Sparkline } from "./kit/charts";
import { AsyncNote, useAsync } from "./kit/useAsync";
import { type Indicator, indicators, nearest } from "./indicators";
import { query } from "./queria";
import { type LandPrice, landPriceSql, type Stat, statsSql } from "./sql";

export const Then = ({ code, name, target }: { code: string; name: string; target: number }) => {
  // 地価は別のデータセットを読むので、統計の行を待たせずに読めた時点で足す。読めなければ地価の行だけを出さない
  const stats = useAsync(() => query<Stat>(statsSql(code)), [code]);
  const land = useAsync(() => query<LandPrice>(landPriceSql(code)), [code]);
  const rows =
    stats.status === "done" ? indicators(stats.value, land.status === "done" ? land.value : []) : [];
  return (
    <section className="then-stats">
      <h3>
        昔の数字<span className="meta">今の{name}の区域・{target}年に近い年</span>
      </h3>
      {rows.length ? (
        rows.map((i) => <Row key={i.label} indicator={i} target={target} />)
      ) : (
        <AsyncNote state={stats} empty />
      )}
    </section>
  );
};

const Row = ({ indicator: i, target }: { indicator: Indicator; target: number }) => {
  if (i.kind === "num") {
    const rows = i.points.map(([year, value]) => ({ year, value }));
    const then = nearest(rows, target);
    const now = rows.at(-1);
    if (!then || !now) return null;
    return (
      <details className="stat">
        <summary>
          <span className="label">{i.label}</span>
          <span className="value">
            {i.format(then.value)}
            <small>{then.year}年</small>
          </span>
          <Sparkline points={i.points} mark={then.year} />
          <span className="now">{now.year !== then.year && <>今 {i.format(now.value)}</>}</span>
        </summary>
        <LineChart series={[{ label: i.label, points: i.points }]} />
      </details>
    );
  }
  const then = nearest(i.rows, target);
  const now = i.rows.at(-1);
  if (!then || !now) return null;
  return (
    <details className="stat">
      <summary>
        <span className="label">{i.label}</span>
        <span className="value">
          <ShareBar parts={then.parts} labels={i.labels} />
          <small>{then.year}年</small>
        </span>
        <span />
        <span className="now">
          {now.year !== then.year && (
            <>
              今<ShareBar parts={now.parts} labels={i.labels} />
            </>
          )}
        </span>
      </summary>
      <ShareBars rows={i.rows.filter((r) => r.year % 10 === 0 || r === now)} labels={i.labels} />
    </details>
  );
};

