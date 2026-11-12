// 地名の検索。当時の市町村名は codh.city.municipality から、今の住所は Queria のジオコーダーから引く
import { lit } from "queria";
import { geocode } from "./kit/geocoder";
import { query } from "./queria";
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
    WHERE lng IS NOT NULL AND (full_name LIKE ${lit(`%${q}%`)} OR address LIKE ${lit(`%${q}%`)})
    ORDER BY (valid_from <= DATE ${lit(date)} AND coalesce(valid_to > DATE ${lit(date)}, true)) DESC,
             full_name <> ${lit(q)}, valid_from DESC
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

/** 当時の市町村名と今の住所を並べて返す。片方が失敗しても、もう片方は返す */
export const search = async (q: string, date: string): Promise<Hit[]> => {
  const [a, b] = await Promise.allSettled([
    // どの年代の境界にも無い市町村 (1950年より前に消えたものなど) は、選んでも地図に出せないので除く
    cities(q, date).then((hits) => hits.filter((h) => ERAS.some((e) => existsAt(h, e.boundaryDate)))),
    geocode(q).then((places) => places.map((p): Hit => ({ ...p, note: "現在の住所" }))),
  ]);
  return [a, b].flatMap((r) => (r.status === "fulfilled" ? r.value : []));
};

/** その市町村が date の境界にあるか */
export const existsAt = (h: Hit, date: string) =>
  h.id !== undefined && h.validFrom !== undefined && h.validFrom <= date && (h.validTo == null || h.validTo > date);
