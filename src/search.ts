// 地名の検索。当時の市町村名は codh.city.municipality から、今の住所は Queria のジオコーダーから引く
import { query } from "./db";
import { ERAS } from "./eras";

export type Hit = {
  label: string;
  note: string;
  lng: number;
  lat: number;
  /** 当時の市町村 (geoshape_city_id)。住所の結果には無い */
  id?: string;
  validFrom?: string;
  validTo?: string | null;
};

const GEOCODER = "https://geocoder.queria.io/v1/forward";

const sqlString = (s: string) => `'${s.replaceAll("'", "''")}'`;
const year = (d: string | null | undefined) => (d ? d.slice(0, 4) : "");

/** 名前に q を含む当時の市町村。date に存在したものを先に並べる */
const cities = async (q: string, date: string): Promise<Hit[]> => {
  const rows = await query<{
    id: string;
    full_name: string;
    address: string;
    lng: number;
    lat: number;
    valid_from: string;
    valid_to: string | null;
  }>(`
    SELECT geoshape_city_id AS id, full_name, address, lng, lat,
           CAST(valid_from AS VARCHAR) AS valid_from, CAST(valid_to AS VARCHAR) AS valid_to
    FROM codh.city.municipality
    WHERE lng IS NOT NULL AND (full_name LIKE ${sqlString(`%${q}%`)} OR address LIKE ${sqlString(`%${q}%`)})
    ORDER BY (valid_from <= DATE ${sqlString(date)} AND coalesce(valid_to > DATE ${sqlString(date)}, true)) DESC,
             full_name <> ${sqlString(q)}, valid_from DESC
    LIMIT 12`);
  return rows.map((r) => ({
    label: r.full_name,
    note: `${r.address.split("/")[0]}（${year(r.valid_from)}〜${year(r.valid_to)}）`,
    lng: r.lng,
    lat: r.lat,
    id: r.id,
    validFrom: r.valid_from,
    validTo: r.valid_to,
  }));
};

/** 今の住所。曖昧なものや一部しか一致しないものは出さない */
const address = async (q: string): Promise<Hit[]> => {
  const res = await fetch(`${GEOCODER}?address=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const body = (await res.json()) as {
    results: { matched_address: string; unmatched_address: string[] | null; lat: number | null; lng: number | null; ambiguous: boolean }[];
  };
  return body.results
    .flatMap((r) =>
      // 都道府県だけ一致したものは座標が null
      !r.ambiguous && !r.unmatched_address?.length && r.lng != null && r.lat != null
        ? [{ label: r.matched_address, note: "今の住所", lng: r.lng, lat: r.lat }]
        : [],
    );
};

/** 当時の市町村名と今の住所を並べて返す。片方が失敗しても、もう片方は返す */
export const search = async (q: string, date: string): Promise<Hit[]> => {
  const [a, b] = await Promise.allSettled([
    // どの年代の境界にも無い市町村 (1950年より前に消えたものなど) は、選んでも地図に出せないので除く
    cities(q, date).then((hits) => hits.filter((h) => ERAS.some((e) => existsAt(h, e.boundaryDate)))),
    address(q),
  ]);
  return [a, b].flatMap((r) => (r.status === "fulfilled" ? r.value : []));
};

/** その市町村が date の境界にあるか */
export const existsAt = (h: Hit, date: string) =>
  h.id !== undefined && h.validFrom !== undefined && h.validFrom <= date && (h.validTo == null || h.validTo > date);
