// 2 つの地図のスタイル。画面の状態 (View) から作り、変わったら MapView が差分だけを当てる
import type { StyleSpecification } from "maplibre-gl";
import { boundaryLayer, CURRENT_MAPS, type Era, PALE_TILES, PHOTO_MAXZOOM, PHOTO_MINZOOM } from "./eras";

export type View = {
  era: Era;
  current: (typeof CURRENT_MAPS)[number];
  opacity: number;
  boundary: boolean;
  /** 選んだ当時の市町村 (geoshape_city_id) */
  picked?: string;
};

const GSI = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>';
const CODH =
  '<a href="https://geoshape.ex.nii.ac.jp/city/" target="_blank">『歴史的行政区域データセットβ版』（CODH作成）</a>';
const ESTAT = '<a href="https://www.e-stat.go.jp/" target="_blank">e-Stat</a>';

/** 当時の市区町村の境界 (dataset-codh の scripts/build-tiles.sh) */
const BOUNDARY_TILES = import.meta.env.VITE_BOUNDARY_TILES as string;

// 左の地図: 当時の写真と境界
export const oldStyle = (v: View): StyleSpecification => {
  const { era } = v;
  const layer = boundaryLayer(era);
  const visibility = v.boundary ? "visible" : "none";
  return {
    version: 8,
    sources: {
      pale: { type: "raster", tiles: [PALE_TILES], tileSize: 256, maxzoom: 18, attribution: GSI },
      photo: {
        type: "raster",
        tiles: [era.tiles],
        tileSize: 256,
        minzoom: PHOTO_MINZOOM,
        maxzoom: PHOTO_MAXZOOM,
        attribution: `${GSI}（${era.label}の空中写真）`,
      },
      boundary: { type: "vector", url: `pmtiles://${BOUNDARY_TILES}`, promoteId: "id", attribution: `${CODH}・${ESTAT}を加工` },
    },
    layers: [
      { id: "pale", type: "raster", source: "pale" },
      { id: "photo", type: "raster", source: "photo", paint: { "raster-opacity": v.opacity } },
      // クリックで当時の市町村を選ぶための見えない塗りと、選んだ市町村の塗り
      { id: "city-fill", type: "fill", source: "boundary", "source-layer": layer, paint: { "fill-opacity": 0 } },
      {
        id: "picked-fill",
        type: "fill",
        source: "boundary",
        "source-layer": layer,
        filter: ["==", ["get", "id"], v.picked ?? ""],
        paint: { "fill-color": "#f59e0b", "fill-opacity": 0.35 },
      },
      {
        id: "city-casing",
        type: "line",
        source: "boundary",
        "source-layer": layer,
        layout: { visibility },
        paint: { "line-color": "#111827", "line-opacity": 0.7, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.6, 12, 4] },
      },
      {
        id: "city-line",
        type: "line",
        source: "boundary",
        "source-layer": layer,
        layout: { visibility },
        paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.6, 12, 1.6] },
      },
    ],
  };
};

// 右の地図: 今の地理院地図に今の市区町村の境界 (Queria の境界タイル) と当時の境界を重ね、
// 境界の変化を見比べられるようにする。左で選んだ当時の市町村は太い破線で示す
const NOW_BOUNDARY_TILES = "https://assets.queria.io/boundaries/boundaries-20261103.pmtiles";
const MLIT =
  '<a href="https://nlftp.mlit.go.jp/ksj/" target="_blank">「国土数値情報（行政区域データ）」（国土交通省）</a>を加工';
const lineWidth = (a: number, b: number) => ["interpolate", ["linear"], ["zoom"], 6, a, 12, b] as ["interpolate", ["linear"], ["zoom"], number, number, number, number];
export const nowStyle = (v: View): StyleSpecification => {
  const { era, current: c } = v;
  const visibility = v.boundary ? "visible" : "none";
  return {
    version: 8,
    sources: {
      pale: { type: "raster", tiles: [PALE_TILES], tileSize: 256, maxzoom: 18 },
      now: { type: "raster", tiles: [c.tiles], tileSize: 256, maxzoom: c.maxzoom, attribution: GSI },
      // 市区町村のレイヤーはズーム 12 まで。それより寄ったら 12 のタイルを拡大して使う
      city: { type: "vector", url: `pmtiles://${NOW_BOUNDARY_TILES}`, maxzoom: 12, attribution: MLIT },
      boundary: { type: "vector", url: `pmtiles://${BOUNDARY_TILES}` },
    },
    layers: [
      // 写真の不透明度は左右の写真にそろえて掛け、下に淡色地図を透かす
      { id: "pale", type: "raster", source: "pale" },
      { id: "now", type: "raster", source: "now", paint: { "raster-opacity": c.id === "photo" ? v.opacity : 1 } },
      { id: "now-casing", type: "line", source: "city", "source-layer": "city", layout: { visibility }, paint: { "line-color": "#ffffff", "line-opacity": 0.8, "line-width": lineWidth(2, 4.5) } },
      { id: "now-line", type: "line", source: "city", "source-layer": "city", layout: { visibility }, paint: { "line-color": "#7846be", "line-width": lineWidth(0.8, 2) } },
      // クリックで当時の市町村を選ぶための見えない塗り
      { id: "old-fill", type: "fill", source: "boundary", "source-layer": boundaryLayer(era), paint: { "fill-opacity": 0 } },
      {
        id: "old-line",
        type: "line",
        source: "boundary",
        "source-layer": boundaryLayer(era),
        layout: { visibility },
        paint: { "line-color": "#d97706", "line-width": lineWidth(0.8, 1.8), "line-dasharray": [3, 2] },
      },
      {
        id: "picked-line",
        type: "line",
        source: "boundary",
        "source-layer": boundaryLayer(era),
        filter: ["==", ["get", "id"], v.picked ?? ""],
        paint: { "line-color": "#b45309", "line-width": lineWidth(3, 5), "line-dasharray": [2, 1] },
      },
    ],
  };
};

