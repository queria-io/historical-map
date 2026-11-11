// Queria のジオコーダー (geocoder.queria.io) で住所から座標を引く
const GEOCODER = "https://geocoder.queria.io/v1/forward";

export type Place = { label: string; lng: number; lat: number };

type Result = { matched_address: string; unmatched_address: string[] | null; lat: number | null; lng: number | null; ambiguous: boolean };

/** 住所全体が 1 か所に決まったものだけ返す。都道府県だけ一致したものは座標が null */
export const geocode = async (address: string, signal?: AbortSignal): Promise<Place[]> => {
  const res = await fetch(`${GEOCODER}?address=${encodeURIComponent(address)}`, { signal });
  if (!res.ok) return [];
  const body = (await res.json()) as { results: Result[] };
  return body.results.flatMap((r) =>
    !r.ambiguous && !r.unmatched_address?.length && r.lng != null && r.lat != null
      ? [{ label: r.matched_address, lng: r.lng, lat: r.lat }]
      : [],
  );
};
