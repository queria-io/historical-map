// クリックした当時の市町村の情報欄。Queria の公開データセットに、ブラウザから SQL を実行して組み立てる
import { ageShare, lineChart, type Point, pyramid } from "./chart";
import { query } from "./db";

export type Picked = { id: string; name: string; date: string };

export const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const lit = (s: string) => `'${s.replaceAll("'", "''")}'`;
const year = (d: unknown) => (d == null ? "" : new Date(Number(d)).getUTCFullYear().toString());
const period = (from: unknown, to: unknown) => (to == null ? `${year(from)}年〜` : `${year(from)}〜${year(to)}年`);
const fmt = (v: number | null | undefined, digits = 0) =>
  v == null ? "—" : v.toLocaleString("ja-JP", { maximumFractionDigits: digits });
const shortName = (name: string | undefined) => name?.split(" ").pop() ?? "";

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
  -- 分割した先がまた合わさると同じ行が 2 回出るので、UNION で重ねない
  UNION
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

// --- 今の市区町村の推移と年齢 3 区分 (社会・人口統計体系。今の区域に組み替えた値) ---
type Yearly = { year: number; population: number | null; young: number | null; working: number | null; old: number | null };
const yearlySql = (code: string) => `
PIVOT (
  SELECT year, cat01, value FROM e_stat.ssds.a_municipal_population
  WHERE area = ${lit(code)} AND cat01 IN ('A1101', 'A1301', 'A1302', 'A1303') AND value IS NOT NULL
) ON cat01 IN ('A1101' AS population, 'A1301' AS young, 'A1302' AS working, 'A1303' AS old)
USING any_value(value) GROUP BY year ORDER BY year`;

// --- 今の市区町村の人口ピラミッド (令和7年国勢調査) ---
type Age = { age: number; male: number; female: number };
const ageSql = (code: string) => `
SELECT age_from AS age, population_male AS male, population_female AS female
FROM e_stat.census.census_municipality_age_2025
WHERE area = ${lit(code)} AND area_level IN ('city', 'ward', 'town_village') AND age_from IS NOT NULL
ORDER BY age_from`;

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

/** X での共有とリンクのコピー。URL には年代・位置・選んだ市町村が入る */
const xIntent = (text: string) =>
  `https://x.com/intent/post?${new URLSearchParams({ text, url: location.href, hashtags: "過去の地図と統計" })}`;
const shareBar = (text: string) => `<div class="share">
    <a class="x" href="${esc(xIntent(text))}" data-text="${esc(text)}" target="_blank" rel="noopener">X でシェア</a>
    <button class="copy" type="button">リンクをコピー</button></div>`;

const row = (label: string, then: string, now: string) => `<tr><th>${label}</th><td>${then}</td><td>${now}</td></tr>`;

const compareBlock = (city: City, reg: Registry | undefined, now: Now | undefined, share: number, currentShare: number) => {
  const thenDensity = reg && city.area_km2 ? reg.population / city.area_km2 : null;
  const nowName = esc(shortName(now?.name) || "今");
  return `
    <h3>当時と今</h3>
    <table class="compare">
      <thead><tr><th></th><th class="then"><small>当時</small>${esc(city.full_name)}</th><th class="now"><small>現在</small>${nowName}</th></tr></thead>
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

/** 最後に始めた renderPanel の番号。先に始めた方の結果が後から届いても書かない */
let latest = 0;

export async function renderPanel(el: HTMLElement, picked: Picked): Promise<void> {
  const ticket = ++latest;
  el.innerHTML = `<h2>${esc(picked.name)}</h2><p class="note">Queria から読み込み中…</p>`;
  const started = performance.now();
  const [city] = await query<City>(citySql(picked.id));
  if (ticket !== latest) return;
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
  if (ticket !== latest) return;
  const nowOf = (code: string | undefined) => nows.find((n) => n.area === code);
  const others = current.slice(1);
  const mainName = esc(shortName(nowOf(main?.code)?.name) || "市区町村");
  el.innerHTML = `
    <h2>${esc(city.full_name)}</h2>
    <p class="meta">${esc(city.address.split("/")[0])}・${picked.date.slice(0, 4)}年の境界</p>
    ${shareBar(`${city.full_name}（${period(city.valid_from, city.valid_to)}）と今の${shortName(nowOf(main?.code)?.name) || "市区町村"}を、空中写真と統計で比べる`)}
    ${main ? compareBlock(city, registry[0], nowOf(main.code), main.share, main.current_share) : `<p class="note">今の市区町村との対応がありません。</p>`}
    ${others.length ? `<p class="note">ほかに ${others.map((o) => `${esc(shortName(nowOf(o.code)?.name) || o.code)}（${Math.round(o.share * 100)}%）`).join("・")}に入っています。</p>` : ""}
    ${chainBlock(before, steps)}
    ${main ? `<section class="charts"><h3>今の${mainName}の人口ピラミッド<span class="meta">2025年 国勢調査</span></h3><div id="pyramid"><p class="note">読み込み中…</p></div>
      <h3>年齢構成の移り変わり<span class="meta">今の${mainName}の区域</span></h3><div id="ages"><p class="note">読み込み中…</p></div>
      <h3>人口の推移<span class="meta">今の${mainName}の区域</span></h3><div id="trend"><p class="note">読み込み中…</p></div></section>` : ""}
    <p class="source">
      データ: Queria の <a href="https://queria.io/datasets/queria/codh" target="_blank" rel="noopener">codh</a>・<a href="https://queria.io/datasets/queria/e_stat" target="_blank" rel="noopener">e_stat</a>（${((performance.now() - started) / 1000).toFixed(1)} 秒）<br />
      <a href="https://geoshape.ex.nii.ac.jp/city/resource/${esc(picked.id)}.html" target="_blank" rel="noopener">CODH の市区町村のページ</a>
    </p>`;
  // 欄を出した後に地図を動かしても、押したときの位置で共有する
  el.querySelector<HTMLAnchorElement>(".share .x")?.addEventListener("click", (e) => {
    const a = e.currentTarget as HTMLAnchorElement;
    a.href = xIntent(a.dataset.text ?? "");
  });
  el.querySelector<HTMLButtonElement>(".share .copy")?.addEventListener("click", (e) => {
    const button = e.currentTarget as HTMLButtonElement;
    navigator.clipboard.writeText(location.href).then(
      () => (button.textContent = "コピーしました"),
      () => (button.textContent = "コピーできませんでした"),
    );
  });
  if (main) await renderCharts(el, main.code, () => ticket === latest);
}

/** グラフは表の後から読む。統計の表を広く読むので数秒かかる */
async function renderCharts(el: HTMLElement, code: string, alive: () => boolean): Promise<void> {
  const put = (sel: string, html: string) => {
    const box = el.querySelector<HTMLElement>(sel);
    if (box && alive()) box.innerHTML = html;
  };
  const failed = (e: unknown) => `<p class="note">読み込めませんでした（${esc(String(e))}）。</p>`;
  await Promise.all([
    query<Age>(ageSql(code)).then(
      (rows) => put("#pyramid", rows.length ? pyramid(rows) : `<p class="note">値がありません。</p>`),
      (e: unknown) => put("#pyramid", failed(e)),
    ),
    query<Yearly>(yearlySql(code)).then(
      (rows) => {
        const ages = rows.flatMap((r) =>
          r.young != null && r.working != null && r.old != null && r.year % 10 === 0
            ? [{ year: r.year, young: r.young, working: r.working, old: r.old }]
            : [],
        );
        const points = rows.flatMap((r): Point[] => (r.population != null ? [[r.year, r.population]] : []));
        put("#ages", ages.length ? ageShare(ages) : `<p class="note">値がありません。</p>`);
        put("#trend", points.length ? lineChart([{ label: "人口", points }]) : `<p class="note">値がありません。</p>`);
      },
      (e: unknown) => {
        put("#ages", failed(e));
        put("#trend", failed(e));
      },
    ),
  ]);
}
