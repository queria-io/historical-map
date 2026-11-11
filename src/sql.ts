// 統計の欄が Queria に実行する SQL
import { lit } from "./kit/db";

// --- 当時の市町村と、今の市区町村との重なり ---
export type City = {
  full_name: string;
  address: string;
  valid_from: number;
  valid_to: number | null;
  city_code: string | null;
  area_km2: number | null;
  current: { code: string; share: number; current_share: number }[] | null;
};
export const citySql = (id: string) => `
SELECT m.full_name, m.address, m.valid_from, m.valid_to, m.city_code,
  sum(o.overlap_area_km2) AS area_km2,
  list({'code': o.current_city_code, 'share': o.past_share, 'current_share': o.current_share}
    ORDER BY o.past_share DESC) FILTER (WHERE o.past_share >= 0.1) AS current
FROM codh.city.municipality AS m
LEFT JOIN codh.city.current_overlap AS o USING (geoshape_city_id)
WHERE m.geoshape_city_id = ${lit(id)}
GROUP BY ALL`;

// --- 移り変わり (codh.city.succession) ---
export type Step = { step: number; full_name: string; valid_from: number; valid_to: number | null; with_names: string[] | null };
export const chainSql = (id: string) => `
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
export type Before = { full_name: string; change_date: number };
export const beforeSql = (id: string) => `
SELECT p.full_name, s.change_date
FROM codh.city.succession AS s JOIN codh.city.municipality AS p USING (geoshape_city_id)
WHERE s.successor_geoshape_city_id = ${lit(id)}
ORDER BY s.change_date, p.full_name`;

// --- 今の市区町村 (令和7年国勢調査) ---
export type Now = { area: string; name: string; population: number; households: number; area_km2: number; population_density: number };
export const nowSql = (codes: string[]) => `
SELECT c.area, concat_ws(' ', m.pref_name, m.district_name, m.municipality_name) AS name,
  c.population, c.households, c.area_km2, c.population_density
FROM e_stat.census.census_municipality_2025 AS c
JOIN e_stat.code.municipality AS m ON m.area_code = c.area
WHERE c.area IN (${codes.map(lit).join(", ")}) AND c.area_level IN ('city', 'ward', 'town_village')`;

// --- 当時の区域の人口 (住民基本台帳。1995 年から、その年の市町村コード) ---
export type Registry = { year: number; population: number; households: number };
export const registrySql = (code: string) => `
SELECT year, population_total AS population, households
FROM e_stat.resident_registry.population
WHERE area_level = 'municipality' AND resident_kind = 'japanese' AND area_code = ${lit(code)}
ORDER BY year
LIMIT 1`;


// --- 今の市区町村の住宅地の地価 (地価公示・地価調査。1995 年から) ---
// 地点の市区町村コードはその年のものなので、今の市区町村に入った昔の市区町村のコードも含める
export type LandPrice = { year: number; price: number };
export const landPriceSql = (code: string) => `
SELECT year, median(current_price) AS price
FROM reinfolib.main.mart_land_prices
WHERE use_category = '住宅地' AND city_code IN (
  SELECT DISTINCT city_code FROM codh.city.municipality WHERE current_city_code = ${lit(code)} AND city_code IS NOT NULL
)
GROUP BY year ORDER BY year`;

// --- 今の市区町村の昔の数字 (社会・人口統計体系。1980 年から、今の区域に組み替えた値) ---
export type Stat = { year: number; item: string; value: number };
const ssds = (table: string, items: string[], code: string) => `
  SELECT year, cat01 AS item, value FROM e_stat.ssds.${table}
  WHERE area = ${lit(code)} AND cat01 IN (${items.map(lit).join(", ")}) AND value IS NOT NULL`;
export const statsSql = (code: string) =>
  [
    ssds("a_municipal_population", ["A1101", "A1301", "A1302", "A1303"], code),
    ssds("e_municipal_education", ["E2101", "E2501"], code),
    ssds("f_municipal_labor", ["F1102", "F2201", "F2211", "F2221", "F2705"], code),
    ssds("c_municipal_economy", ["C3401"], code),
  ].join(" UNION ALL ") + " ORDER BY year";
