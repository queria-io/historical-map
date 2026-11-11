// クリックした当時の市町村の情報欄。Queria の公開データセットに、ブラウザから SQL を実行して組み立てる
import { lineChart, type Point } from "./chart";
import { query, reportUrl } from "./db";

export type Picked = { id: string; code?: string; name: string; date: string };

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const lit = (s: string) => `'${s.replaceAll("'", "''")}'`;
const year = (d: unknown) => (d == null ? "" : new Date(Number(d)).getUTCFullYear().toString());
const period = (from: unknown, to: unknown) => (to == null ? `${year(from)}年〜` : `${year(from)}〜${year(to)}年`);
const fmt = (v: number | null | undefined, digits = 0) =>
  v == null ? "—" : v.toLocaleString("ja-JP", { maximumFractionDigits: digits });
const shortName = (name: string | undefined) => name?.split(" ").pop() ?? "";

/** SQL と、queria.io でそのままレポートにするリンク */
const sqlBox = (sql: string) => `
  <details class="sql"><summary>SQL</summary><pre>${esc(sql.trim())}</pre>
  <a href="${esc(reportUrl(sql.trim()))}" target="_blank" rel="noopener">Queria でレポートにする</a></details>`;

// --- 当時の市町村と、今の市区町村との重なり ---
type City = {
  full_name: string;
  address: string;
  valid_from: number;
  valid_to: number | null;
  city_code: string | null;
  area_km2: number | null;
  current: { code: string; share: number; current_share: number }[] | null;
};
const citySql = (id: string) => `
SELECT m.full_name, m.address, m.valid_from, m.valid_to, m.city_code,
  sum(o.overlap_area_km2) AS area_km2,
  list({'code': o.current_city_code, 'share': o.past_share, 'current_share': o.current_share}
    ORDER BY o.past_share DESC) FILTER (WHERE o.past_share >= 0.1) AS current
FROM codh.city.municipality AS m
LEFT JOIN codh.city.current_overlap AS o USING (geoshape_city_id)
WHERE m.geoshape_city_id = ${lit(id)}
GROUP BY ALL`;

// --- 移り変わり (codh.city.succession) ---
type Step = { step: number; full_name: string; valid_from: number; valid_to: number | null; with_names: string[] | null };
const chainSql = (id: string) => `
WITH RECURSIVE chain AS (
  SELECT ${lit(id)} AS id, 0 AS step, NULL::DATE AS day
  UNION ALL
  SELECT s.successor_geoshape_city_id, c.step + 1, s.change_date
  FROM chain AS c JOIN codh.city.succession AS s ON s.geoshape_city_id = c.id
  WHERE c.step < 12
)
SELECT c.step, m.full_name, m.valid_from, m.valid_to,
  (SELECT list(p.full_name ORDER BY p.full_name)
   FROM codh.city.succession AS x JOIN codh.city.municipality AS p USING (geoshape_city_id)
   WHERE x.successor_geoshape_city_id = c.id AND x.change_date = c.day
     AND x.geoshape_city_id NOT IN (SELECT id FROM chain)) AS with_names
FROM chain AS c JOIN codh.city.municipality AS m ON m.geoshape_city_id = c.id
ORDER BY c.step, m.full_name`;
type Before = { full_name: string; change_date: number };
const beforeSql = (id: string) => `
SELECT p.full_name, s.change_date
FROM codh.city.succession AS s JOIN codh.city.municipality AS p USING (geoshape_city_id)
WHERE s.successor_geoshape_city_id = ${lit(id)}
ORDER BY s.change_date, p.full_name`;

// --- 今の市区町村 (令和7年国勢調査) ---
type Now = { area: string; name: string; population: number; households: number; area_km2: number; population_density: number };
const nowSql = (codes: string[]) => `
SELECT c.area, concat_ws(' ', m.pref_name, m.district_name, m.municipality_name) AS name,
  c.population, c.households, c.area_km2, c.population_density
FROM e_stat.census.census_municipality_2025 AS c
JOIN e_stat.code.municipality AS m ON m.area_code = c.area
WHERE c.area IN (${codes.map(lit).join(", ")}) AND c.area_level IN ('city', 'ward', 'town_village')`;

// --- 当時の区域の人口 (住民基本台帳。1995 年から、その年の市町村コード) ---
type Registry = { year: number; population: number; households: number };
const registrySql = (code: string) => `
SELECT year, population_total AS population, households
FROM e_stat.resident_registry.population
WHERE area_level = 'municipality' AND resident_kind = 'japanese' AND area_code = ${lit(code)}
ORDER BY year
LIMIT 1`;

// --- 今の市区町村の推移 (社会・人口統計体系。今の区域に組み替えた値) ---
type Series = { indicator: string; points: [number, number][] };
const seriesSql = (code: string) => `
SELECT CASE cat01 WHEN 'A1101' THEN '人口' WHEN 'A7101' THEN '世帯数' END AS indicator,
  list([year::DOUBLE, value] ORDER BY year) AS points
FROM e_stat.ssds.a_municipal_population
WHERE area = ${lit(code)} AND cat01 IN ('A1101', 'A7101') AND value IS NOT NULL
GROUP BY ALL
ORDER BY any_value(cat01)`;

/** 移り変わりのテーブルがまだ無いときなどは、その欄だけを出さない */
const safe = <T>(p: Promise<T[]>): Promise<T[]> => p.catch(() => []);

const chainBlock = (before: Before[], steps: Step[]) => {
  const names = before.map((b) => esc(b.full_name));
  const prev = names.length
    ? `<li class="prev">${names.slice(0, 8).join("・")}${names.length > 8 ? ` ほか ${names.length - 8}` : ""} から</li>`
    : "";
  const items = steps.map(
    (s) => `<li${s.step === 0 ? ' class="self"' : ""}><b>${esc(s.full_name)}</b> <span class="meta">${period(s.valid_from, s.valid_to)}</span>
      ${s.with_names?.length ? `<br /><span class="meta">${s.with_names.map(esc).join("・")}と合わさる</span>` : ""}</li>`,
  );
  return items.length > 1 || prev ? `<h3>移り変わり</h3><ol class="chain">${prev}${items.join("")}</ol>` : "";
};

const row = (label: string, then: string, now: string) => `<tr><th>${label}</th><td>${then}</td><td>${now}</td></tr>`;

const compareBlock = (city: City, reg: Registry | undefined, now: Now | undefined, share: number, currentShare: number) => {
  const thenDensity = reg && city.area_km2 ? reg.population / city.area_km2 : null;
  const nowName = esc(shortName(now?.name) || "今");
  return `
    <h3>当時と今</h3>
    <table class="compare">
      <thead><tr><th></th><th>${esc(city.full_name)}</th><th>${nowName}</th></tr></thead>
      <tbody>
        ${row("期間", period(city.valid_from, city.valid_to), "現在")}
        ${row("面積", `${fmt(city.area_km2, 1)} km²`, `${fmt(now?.area_km2, 1)} km²`)}
        ${row("人口", reg ? `${fmt(reg.population)}<span class="meta">（${reg.year}年）</span>` : "—", now ? `${fmt(now.population)}<span class="meta">（2025年）</span>` : "—")}
        ${row("世帯数", reg ? fmt(reg.households) : "—", fmt(now?.households))}
        ${row("人口密度", thenDensity ? `${fmt(thenDensity)} 人/km²` : "—", now ? `${fmt(now.population_density)} 人/km²` : "—")}
      </tbody>
    </table>
    <p class="note">当時の面積の ${Math.round(share * 100)}% が今の${nowName}に入り、${nowName}の面積の ${Math.round(currentShare * 100)}% にあたります。${reg ? "当時の人口は住民基本台帳の最初の年（日本人住民）の値です。" : "1995 年より前に消えた市町村は、当時の人口がありません。"}</p>`;
};

export async function renderPanel(el: HTMLElement, picked: Picked): Promise<void> {
  el.innerHTML = `<h2>${esc(picked.name)}</h2><p class="note">Queria から読み込み中…</p>`;
  const started = performance.now();
  const [city] = await query<City>(citySql(picked.id));
  if (!city) throw new Error(`${picked.id} がありません`);
  const current = city.current ?? [];
  const main = current[0];
  const codes = current.map((c) => c.code);
  const [steps, before, nows, registry] = await Promise.all([
    safe(query<Step>(chainSql(picked.id))),
    safe(query<Before>(beforeSql(picked.id))),
    codes.length ? query<Now>(nowSql(codes)) : Promise.resolve([]),
    city.city_code ? query<Registry>(registrySql(city.city_code)) : Promise.resolve([]),
  ]);
  const nowOf = (code: string | undefined) => nows.find((n) => n.area === code);
  const others = current.slice(1);
  const mainName = esc(shortName(nowOf(main?.code)?.name) || "市区町村");
  const compareSql = [citySql(picked.id), codes.length ? nowSql(codes) : "", city.city_code ? registrySql(city.city_code) : ""]
    .filter(Boolean)
    .join(";\n");
  el.innerHTML = `
    <h2>${esc(city.full_name)}</h2>
    <p class="meta">${esc(city.address.split("/")[0])}・${picked.date.slice(0, 4)}年の境界</p>
    ${main ? compareBlock(city, registry[0], nowOf(main.code), main.share, main.current_share) : `<p class="note">今の市区町村との対応がありません。</p>`}
    ${others.length ? `<p class="note">ほかに ${others.map((o) => `${esc(shortName(nowOf(o.code)?.name) || o.code)}（${Math.round(o.share * 100)}%）`).join("・")}に入っています。</p>` : ""}
    ${sqlBox(compareSql)}
    ${chainBlock(before, steps)}
    ${steps.length ? sqlBox(chainSql(picked.id)) : ""}
    ${main ? `<details class="trend"><summary>今の${mainName}の推移</summary><div class="charts"><p class="note">読み込み中…</p></div></details>` : ""}
    <p class="source">
      データ: Queria の <a href="https://queria.io/datasets/queria/codh" target="_blank" rel="noopener">codh</a>・<a href="https://queria.io/datasets/queria/e_stat" target="_blank" rel="noopener">e_stat</a>（${((performance.now() - started) / 1000).toFixed(1)} 秒）<br />
      <a href="https://geoshape.ex.nii.ac.jp/city/resource/${esc(picked.id)}.html" target="_blank" rel="noopener">CODH の市区町村のページ</a>
    </p>`;
  // 推移は開いたときに読む (統計の表を広く読むので数秒かかる)
  const trend = el.querySelector<HTMLDetailsElement>("details.trend");
  if (main && trend) trend.addEventListener("toggle", () => trend.open && renderTrend(trend, main.code), { once: true });
}

async function renderTrend(el: HTMLElement, code: string): Promise<void> {
  const box = el.querySelector<HTMLElement>(".charts");
  if (!box) return;
  const series = await query<Series>(seriesSql(code)).catch((e: unknown) => {
    box.innerHTML = `<p class="note">読み込めませんでした（${esc(String(e))}）。</p>`;
    return null;
  });
  if (!series) return;
  box.innerHTML =
    series
      .flatMap((s) => (s.points.length ? [`<h4>${esc(s.indicator)}</h4>${lineChart([{ label: s.indicator, points: s.points as Point[] }])}`] : []))
      .join("") + `<p class="note">今の区域に組み替えた値です（社会・人口統計体系）。</p>${sqlBox(seriesSql(code))}`;
}
