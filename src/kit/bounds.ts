// ベクトルタイルの地物の範囲。タイルの境で切れているので、読み込み済みの断片を全部合わせる
import maplibregl from "maplibre-gl";

type Coords = number | Coords[];
const isPoint = (c: Coords[]): c is [number, number] => typeof c[0] === "number";
const extend = (b: maplibregl.LngLatBounds, c: Coords): maplibregl.LngLatBounds =>
  typeof c === "number" ? b : isPoint(c) ? b.extend(c) : c.reduce(extend, b);

export const featureBounds = (map: maplibregl.Map, source: string, sourceLayer: string, filter: maplibregl.FilterSpecification) =>
  map
    .querySourceFeatures(source, { sourceLayer, filter })
    .flatMap((f) => ("coordinates" in f.geometry ? [f.geometry.coordinates] : []))
    .reduce(extend, new maplibregl.LngLatBounds());

const contains = (outer: maplibregl.LngLatBounds, inner: maplibregl.LngLatBounds) =>
  outer.contains(inner.getSouthWest()) && outer.contains(inner.getNorthEast());

/**
 * 地物が地図いっぱいに入るように寄せる。タイルがまだ無ければ読み終えてから、
 * 画面の外にはみ出していた部分は寄せた後に読めたタイルで範囲が広がるので、そのときだけもう一度合わせる。
 * alive が false になったら (別の地物を選んだら) やめる
 */
export const focusFeature = (map: maplibregl.Map, bounds: () => maplibregl.LngLatBounds, alive: () => boolean) => {
  const fit = (b: maplibregl.LngLatBounds) => map.fitBounds(b, { padding: 40, maxZoom: 14, duration: 600 });
  const run = (retry: boolean) => {
    if (!alive()) return;
    const first = bounds();
    if (first.isEmpty()) {
      if (retry) map.once("idle", () => run(false));
      return;
    }
    fit(first);
    map.once("idle", () => {
      const next = bounds();
      if (alive() && !next.isEmpty() && !contains(first, next)) fit(next);
    });
  };
  // 横の欄が開いて地図の幅が変わるとアニメーションが止まるので、描き終えてから寄せる
  requestAnimationFrame(() => requestAnimationFrame(() => run(true)));
};
