import maplibregl, { type StyleSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { boundaryLayer, type Era, ERAS, PALE_TILES, PHOTO_MAXZOOM, PHOTO_MINZOOM } from "./eras";
import { renderPanel } from "./panel";

/** 当時の市区町村の境界 (dataset-codh の scripts/build-tiles.sh) */
const BOUNDARY_TILES = import.meta.env.VITE_BOUNDARY_TILES as string;

const GSI = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>';
const CODH =
  '<a href="https://geoshape.ex.nii.ac.jp/city/" target="_blank">『歴史的行政区域データセットβ版』（CODH作成）</a>';
const ESTAT = '<a href="https://www.e-stat.go.jp/" target="_blank">e-Stat</a>';

maplibregl.addProtocol("pmtiles", new Protocol().tile);

const style = (era: Era): StyleSpecification => ({
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
    boundary: {
      type: "vector",
      url: `pmtiles://${BOUNDARY_TILES}`,
      promoteId: "id", attribution: `${CODH}・${ESTAT}を加工` },
  },
  layers: [
    { id: "pale", type: "raster", source: "pale" },
    { id: "photo", type: "raster", source: "photo", paint: { "raster-opacity": 1 } },
    {
      id: "city-fill",
      type: "fill",
      source: "boundary",
      "source-layer": boundaryLayer(era),
      paint: {
        "fill-color": "#f59e0b",
        "fill-opacity": ["case", ["boolean", ["feature-state", "picked"], false], 0.35, 0],
      },
    },
    {
      id: "city-line",
      type: "line",
      source: "boundary",
      "source-layer": boundaryLayer(era),
      paint: { "line-color": "#fbbf24", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.6, 12, 2] },
    },
  ],
});

const select = document.querySelector<HTMLSelectElement>("#era")!;
const opacity = document.querySelector<HTMLInputElement>("#opacity")!;
const panel = document.querySelector<HTMLElement>("#panel")!;
select.innerHTML = ERAS.map((e) => `<option value="${e.id}">${e.label}</option>`).join("");
const eraOf = (id: string) => ERAS.find((e) => e.id === id) ?? ERAS[0];

const map = new maplibregl.Map({
  container: "map",
  style: style(eraOf(select.value)),
  center: [136.5, 35.1],
  zoom: 10,
  hash: true,
});
map.addControl(new maplibregl.NavigationControl(), "top-right");

let picked: string | number | undefined;
const setPicked = (id: string | number | undefined) => {
  if (picked !== undefined) map.setFeatureState({ source: "boundary", sourceLayer: boundaryLayer(eraOf(select.value)), id: picked }, { picked: false });
  picked = id;
  if (id !== undefined) map.setFeatureState({ source: "boundary", sourceLayer: boundaryLayer(eraOf(select.value)), id }, { picked: true });
};

select.addEventListener("change", () => {
  picked = undefined;
  map.setStyle(style(eraOf(select.value)));
  map.once("styledata", () => map.setPaintProperty("photo", "raster-opacity", Number(opacity.value)));
});
opacity.addEventListener("input", () => map.setPaintProperty("photo", "raster-opacity", Number(opacity.value)));

map.on("mousemove", "city-fill", () => (map.getCanvas().style.cursor = "pointer"));
map.on("mouseleave", "city-fill", () => (map.getCanvas().style.cursor = ""));
map.on("click", "city-fill", (e) => {
  const f = e.features?.[0];
  const props = f?.properties as { id?: string; code?: string; name?: string } | undefined;
  if (!f || !props?.id) return;
  setPicked(props.id);
  panel.hidden = false;
  renderPanel(panel, { id: props.id, code: props.code, name: props.name ?? props.id, date: eraOf(select.value).boundaryDate }).catch(
    (err: unknown) => (panel.innerHTML = `<p class="note">統計を読み込めませんでした（${String(err)}）。</p>`),
  );
});
