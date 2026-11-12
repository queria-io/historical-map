// Queria のジオコーダー (geocoder.queria.io) で住所から座標を引く
const GEOCODER = "https://geocoder.queria.io/v1/forward";

export type Place = { label: string; lng: number; lat: number };

type Result = { matched_address: string; unmatched_address: string[] | null; lat: number | null; lng: number | null };

/** 住所全体が一致した候補を最大 10 件返す。都道府県や市区町村を省いた住所は複数の候補になる */
export const geocode = async (address: string, signal?: AbortSignal): Promise<Place[]> => {
  const res = await fetch(`${GEOCODER}?limit=10&address=${encodeURIComponent(address)}`, { signal });
  if (!res.ok) return [];
  const body = (await res.json()) as { results: Result[] };
  return body.results.flatMap((r) =>
    !r.unmatched_address?.length && r.lng != null && r.lat != null
      ? [{ label: r.matched_address, lng: r.lng, lat: r.lat }]
      : [],
  );
};
