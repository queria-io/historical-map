// クリックした市町村の情報欄。都道府県ごとの JSON (scripts/build_data.py) から組み立てる
import { lineChart, type Point } from "./chart";

type Series = Record<string, Point[]>;
type PrefData = {
  cities: Record<string, { name: string; from: string | null; to: string | null; current: { code: string; share: number }[] }>;
  current: Record<string, { name: string; series: Series }>;
  registry: Record<string, { names: Record<string, string>; series: Series }>;
};

export type Picked = { id: string; code?: string; name: string; date: string };

const cache = new Map<string, Promise<PrefData>>();
const loadPref = (pref: string): Promise<PrefData> => {
  const hit = cache.get(pref);
  if (hit) return hit;
  const p = fetch(`${import.meta.env.BASE_URL}data/${pref}.json`).then((r) => {
    if (!r.ok) throw new Error(`${pref}.json: ${r.status}`);
    return r.json() as Promise<PrefData>;
  });
  p.catch(() => cache.delete(pref));
  cache.set(pref, p);
  return p;
};

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

const year = (d: string | null) => (d ? d.slice(0, 4) : "");
const period = (from: string | null, to: string | null) =>
  to ? `${year(from)}年〜${year(to)}年` : `${year(from)}年〜現在`;

const chartBlock = (title: string, series: { label: string; points: Point[] | undefined }[]) => {
  const present = series.flatMap((s) => (s.points?.length ? [{ label: s.label, points: s.points }] : []));
  return present.length ? `<h4>${title}</h4>${lineChart(present)}` : "";
};

const currentBlock = (entry: PrefData["current"][string] | undefined, share: number) =>
  entry
    ? `<section class="city">
        <h3>${esc(entry.name)}<span class="share">面積の ${Math.round(share * 100)}% がこの市区町村</span></h3>
        <p class="note">今の${esc(entry.name.split(" ").pop() ?? "")}全体の値です（今の区域に組み替えた値）。</p>
        ${chartBlock("人口", [{ label: "人口", points: entry.series.population }])}
        ${chartBlock("年齢 3 区分", [
          { label: "0〜14歳", points: entry.series.age_0_14 },
          { label: "15〜64歳", points: entry.series.age_15_64 },
          { label: "65歳以上", points: entry.series.age_65_over },
        ])}
        ${chartBlock("世帯数", [{ label: "世帯数", points: entry.series.households }])}
      </section>`
    : "";

const registryBlock = (entry: PrefData["registry"][string] | undefined) =>
  entry
    ? `<section class="city">
        <h3>当時の区域の値（住民基本台帳）</h3>
        <p class="note">${esc(Object.values(entry.names)[0] ?? "")} のコードで続く年の値です。日本人住民。</p>
        ${chartBlock("人口", [{ label: "人口", points: entry.series.population }])}
        ${chartBlock("出生・死亡", [
          { label: "出生", points: entry.series.births },
          { label: "死亡", points: entry.series.deaths },
        ])}
        ${chartBlock("転入・転出", [
          { label: "転入", points: entry.series.moved_in },
          { label: "転出", points: entry.series.moved_out },
        ])}
      </section>`
    : "";

export async function renderPanel(el: HTMLElement, picked: Picked): Promise<void> {
  el.innerHTML = `<h2>${esc(picked.name)}</h2><p class="note">読み込み中…</p>`;
  const data = await loadPref(picked.id.slice(0, 2));
  const city = data.cities[picked.id];
  const links = city?.current ?? [];
  const currents = await Promise.all(
    links.map(async (l) => ({ share: l.share, entry: (await loadPref(l.code.slice(0, 2))).current[l.code] })),
  );
  el.innerHTML = `
    <h2>${esc(city?.name ?? picked.name)}</h2>
    <p class="meta">${city ? period(city.from, city.to) : ""}・${picked.date.slice(0, 4)}年の境界</p>
    ${links.length > 1 ? `<p class="note">今は ${links.length} つの市区町村に分かれています。</p>` : ""}
    ${picked.code ? registryBlock(data.registry[picked.code]) : ""}
    ${currents.map((c) => currentBlock(c.entry, c.share)).join("")}
    ${links.length === 0 ? `<p class="note">今の市区町村との対応がありません。</p>` : ""}
    <p class="source"><a href="https://geoshape.ex.nii.ac.jp/city/resource/${esc(picked.id)}.html" target="_blank" rel="noopener">CODH の市区町村のページ</a></p>`;
}
