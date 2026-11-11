import maplibregl, { type StyleSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { boundaryLayer, CURRENT_MAPS, type Era, ERAS, PALE_TILES, PHOTO_MAXZOOM, PHOTO_MINZOOM } from "./eras";
import { renderPanel } from "./panel";

/** 当時の市区町村の境界 (dataset-codh の scripts/build-tiles.sh) */
const BOUNDARY_TILES = import.meta.env.VITE_BOUNDARY_TILES as string;

const GSI = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>';
const CODH =
  '<a href="https://geoshape.ex.nii.ac.jp/city/" target="_blank">『歴史的行政区域データセットβ版』（CODH作成）</a>';
const ESTAT = '<a href="https://www.e-stat.go.jp/" target="_blank">e-Stat</a>';

maplibregl.addProtocol("pmtiles", new Protocol().tile);

const $ = <T extends Element>(q: string) => document.querySelector<T>(q)!;
const params = new URLSearchParams(location.search);
const eraOf = (id: string | null) => ERAS.find((e) => e.id === id) ?? ERAS[1];
const currentOf = (id: string | null) => CURRENT_MAPS.find((c) => c.id === id) ?? CURRENT_MAPS[0];

const state = {
  era: eraOf(params.get("era")),
  screens: params.get("screens") === "1" ? 1 : 2,
  current: currentOf(params.get("now")),
  opacity: 1,
  boundary: true,
};

const saveUrl = () => {
  const q = new URLSearchParams({ era: state.era.id, screens: String(state.screens), now: state.current.id });
  history.replaceState(null, "", `?${q}${location.hash}`);
};

// 左の地図: 当時の写真と境界
const oldStyle = (era: Era): StyleSpecification => {
  const layer = boundaryLayer(era);
  const visibility = state.boundary ? "visible" : "none";
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
      { id: "photo", type: "raster", source: "photo", paint: { "raster-opacity": state.opacity } },
      {
        id: "city-fill",
        type: "fill",
        source: "boundary",
        "source-layer": layer,
        paint: {
          "fill-color": "#f59e0b",
          "fill-opacity": ["case", ["boolean", ["feature-state", "picked"], false], 0.35, 0],
        },
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

// 右の地図: 今の地理院地図
const nowStyle = (c: (typeof CURRENT_MAPS)[number]): StyleSpecification => ({
  version: 8,
  sources: { now: { type: "raster", tiles: [c.tiles], tileSize: 256, maxzoom: c.maxzoom, attribution: GSI } },
  layers: [{ id: "now", type: "raster", source: "now" }],
});

const map = new maplibregl.Map({ container: "map", style: oldStyle(state.era), center: [139.6, 35.7], zoom: 10, hash: true });
const now = new maplibregl.Map({ container: "map-now", style: nowStyle(state.current), center: map.getCenter(), zoom: map.getZoom() });
map.addControl(new maplibregl.NavigationControl(), "top-right");
now.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

// 2 つの地図の位置をそろえる。動かした側だけを元にし、受けた側の move では返さない
let syncing = false;
const follow = (from: maplibregl.Map, to: maplibregl.Map) =>
  from.on("move", () => {
    if (syncing) return;
    syncing = true;
    to.jumpTo({ center: from.getCenter(), zoom: from.getZoom(), bearing: from.getBearing(), pitch: from.getPitch() });
    syncing = false;
  });
follow(map, now);
follow(now, map);

// 片方の地図のマウスの位置を、もう片方に十字で示す
const cross = (target: maplibregl.Map) => {
  const el = document.createElement("div");
  el.className = "cross";
  el.hidden = true;
  target.getContainer().append(el);
  return (lngLat: maplibregl.LngLat | null) => {
    el.hidden = lngLat === null;
    if (lngLat) {
      const p = target.project(lngLat);
      el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    }
  };
};
const showOnNow = cross(now);
const showOnOld = cross(map);
map.on("mousemove", (e) => showOnNow(e.lngLat));
map.on("mouseout", () => showOnNow(null));
now.on("mousemove", (e) => showOnOld(e.lngLat));
now.on("mouseout", () => showOnOld(null));

// 選んだ市町村の塗り
const panel = $<HTMLElement>("#panel");
let picked: string | undefined;
const setPicked = (id: string | undefined) => {
  const target = (i: string) => ({ source: "boundary", sourceLayer: boundaryLayer(state.era), id: i });
  if (picked !== undefined) map.setFeatureState(target(picked), { picked: false });
  picked = id;
  if (id !== undefined) map.setFeatureState(target(id), { picked: true });
};

map.on("mousemove", "city-fill", () => (map.getCanvas().style.cursor = "pointer"));
map.on("mouseleave", "city-fill", () => (map.getCanvas().style.cursor = ""));
map.on("click", "city-fill", (e) => {
  const f = e.features?.[0];
  const props = f?.properties as { id?: string; code?: string; name?: string } | undefined;
  if (!f || !props?.id) return;
  setPicked(props.id);
  panel.hidden = false;
  resize();
  renderPanel(panel, { id: props.id, code: props.code, name: props.name ?? props.id, date: state.era.boundaryDate }).catch(
    (err: unknown) => (panel.innerHTML = `<p class="note">統計を読み込めませんでした（${String(err)}）。</p>`),
  );
});

const resize = () => {
  map.resize();
  now.resize();
};

// 操作パネル
const erasEl = $<HTMLElement>("#eras");
erasEl.innerHTML = ERAS.map(
  (e) => `<label><input type="radio" name="era" value="${e.id}" /> ${e.label}</label>`,
).join("");
const currentSelect = $<HTMLSelectElement>("#current");
currentSelect.innerHTML = CURRENT_MAPS.map((c) => `<option value="${c.id}">${c.label}</option>`).join("");

const render = () => {
  erasEl.querySelectorAll<HTMLInputElement>("input").forEach((r) => (r.checked = r.value === state.era.id));
  document.querySelectorAll<HTMLInputElement>('input[name="screens"]').forEach((r) => (r.checked = r.value === String(state.screens)));
  currentSelect.value = state.current.id;
  $<HTMLElement>("#map-now").hidden = state.screens === 1;
  $<HTMLElement>("#current-field").hidden = state.screens === 1;
  $<HTMLButtonElement>("#prev").disabled = state.era === ERAS[0];
  $<HTMLButtonElement>("#next").disabled = state.era === ERAS[ERAS.length - 1];
  saveUrl();
  resize();
};

const setEra = (era: Era) => {
  if (era === state.era) return;
  setPicked(undefined);
  state.era = era;
  panel.hidden = true;
  map.setStyle(oldStyle(era));
  render();
};
const stepEra = (d: number) => setEra(ERAS[Math.min(Math.max(ERAS.indexOf(state.era) + d, 0), ERAS.length - 1)]);

erasEl.addEventListener("change", (e) => setEra(eraOf((e.target as HTMLInputElement).value)));
$("#prev").addEventListener("click", () => stepEra(-1));
$("#next").addEventListener("click", () => stepEra(1));
document.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.name !== "screens") return;
  state.screens = t.value === "1" ? 1 : 2;
  render();
});
currentSelect.addEventListener("change", () => {
  state.current = currentOf(currentSelect.value);
  now.setStyle(nowStyle(state.current));
  render();
});
$<HTMLSelectElement>("#opacity").addEventListener("change", (e) => {
  state.opacity = Number((e.target as HTMLSelectElement).value);
  map.setPaintProperty("photo", "raster-opacity", state.opacity);
});
$<HTMLInputElement>("#boundary").addEventListener("change", (e) => {
  state.boundary = (e.target as HTMLInputElement).checked;
  for (const id of ["city-casing", "city-line"]) map.setLayoutProperty(id, "visibility", state.boundary ? "visible" : "none");
});

render();
