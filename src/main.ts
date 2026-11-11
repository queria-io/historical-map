import maplibregl, { type StyleSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import "./nodata";
import { boundaryLayer, CURRENT_MAPS, type Era, ERAS, PALE_TILES, PHOTO_MAXZOOM, PHOTO_MINZOOM } from "./eras";
import { getDB } from "./db";
import { esc, renderPanel } from "./panel";
import { existsAt, type Hit, search } from "./search";
import logo from "./queria-logo.svg?raw";

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
  nowBoundary: true,
};

/** 左で選んだ当時の市町村 (geoshape_city_id) */
let picked: string | undefined;

const saveUrl = () => {
  const q = new URLSearchParams({ era: state.era.id, screens: String(state.screens), now: state.current.id });
  if (picked) q.set("city", picked);
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

// 右の地図: 今の地理院地図に今の市区町村の境界 (Queria の境界タイル) と当時の境界を重ね、
// 境界の変化を見比べられるようにする。左で選んだ当時の市町村は太い破線で示す
const NOW_BOUNDARY_TILES = "https://assets.queria.io/boundaries/boundaries-20261103.pmtiles";
const MLIT =
  '<a href="https://nlftp.mlit.go.jp/ksj/" target="_blank">「国土数値情報（行政区域データ）」（国土交通省）</a>を加工';
const lineWidth = (a: number, b: number) => ["interpolate", ["linear"], ["zoom"], 6, a, 12, b] as ["interpolate", ["linear"], ["zoom"], number, number, number, number];
const nowStyle = (c: (typeof CURRENT_MAPS)[number], era: Era): StyleSpecification => {
  const visibility = state.nowBoundary ? "visible" : "none";
  return {
    version: 8,
    sources: {
      now: { type: "raster", tiles: [c.tiles], tileSize: 256, maxzoom: c.maxzoom, attribution: GSI },
      // 市区町村のレイヤーはズーム 12 まで。それより寄ったら 12 のタイルを拡大して使う
      city: { type: "vector", url: `pmtiles://${NOW_BOUNDARY_TILES}`, maxzoom: 12, attribution: MLIT },
      boundary: { type: "vector", url: `pmtiles://${BOUNDARY_TILES}` },
    },
    layers: [
      { id: "now", type: "raster", source: "now" },
      { id: "now-casing", type: "line", source: "city", "source-layer": "city", layout: { visibility }, paint: { "line-color": "#ffffff", "line-opacity": 0.8, "line-width": lineWidth(2, 4.5) } },
      { id: "now-line", type: "line", source: "city", "source-layer": "city", layout: { visibility }, paint: { "line-color": "#7846be", "line-width": lineWidth(0.8, 2) } },
      // クリックで当時の市町村を選ぶための見えない塗り
      { id: "old-fill", type: "fill", source: "boundary", "source-layer": boundaryLayer(era), paint: { "fill-opacity": 0 } },
      {
        id: "old-line",
        type: "line",
        source: "boundary",
        "source-layer": boundaryLayer(era),
        layout: { visibility: state.boundary ? "visible" : "none" },
        paint: { "line-color": "#d97706", "line-width": lineWidth(0.8, 1.8), "line-dasharray": [3, 2] },
      },
      {
        id: "picked-line",
        type: "line",
        source: "boundary",
        "source-layer": boundaryLayer(era),
        filter: ["==", ["get", "id"], picked ?? ""],
        paint: { "line-color": "#b45309", "line-width": lineWidth(3, 5), "line-dasharray": [2, 1] },
      },
    ],
  };
};

const map = new maplibregl.Map({ container: "map", style: oldStyle(state.era), center: [139.6, 35.7], zoom: 10, hash: true });
const now = new maplibregl.Map({ container: "map-now", style: nowStyle(state.current, state.era), center: map.getCenter(), zoom: map.getZoom() });
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
// どちらが当時でどちらが現在かを、地図の左上に出す
const badge = (target: maplibregl.Map, kind: "old" | "now") => {
  const el = document.createElement("div");
  el.className = `badge badge-${kind}`;
  target.getContainer().append(el);
  return el;
};
const oldBadge = badge(map, "old");
const nowBadge = badge(now, "now");

const showOnNow = cross(now);
const showOnOld = cross(map);
map.on("mousemove", (e) => showOnNow(e.lngLat));
map.on("mouseout", () => showOnNow(null));
now.on("mousemove", (e) => showOnOld(e.lngLat));
now.on("mouseout", () => showOnOld(null));

// 選んだ市町村の塗り
const panel = $<HTMLElement>("#panel");
const setPicked = (id: string | undefined) => {
  const target = (i: string) => ({ source: "boundary", sourceLayer: boundaryLayer(state.era), id: i });
  if (picked !== undefined) map.setFeatureState(target(picked), { picked: false });
  picked = id;
  if (id !== undefined) map.setFeatureState(target(id), { picked: true });
  if (now.getLayer("picked-line")) now.setFilter("picked-line", ["==", ["get", "id"], id ?? ""]);
};

// 左の当時の地図でも、右の今の地図でも、当時の市町村をクリックで選べる
const show = (id: string, name?: string) => {
  setPicked(id);
  saveUrl();
  panel.hidden = false;
  resize();
  renderPanel(panel, { id, name: name ?? id, date: state.era.boundaryDate }).catch((err: unknown) => {
    // 別の市町村を選び直した後や年代を変えた後に届いた失敗は書かない
    if (picked === id) panel.innerHTML = `<p class="note">統計を読み込めませんでした（${esc(String(err))}）。</p>`;
  });
};
const pick = (e: maplibregl.MapLayerMouseEvent) => {
  const props = e.features?.[0]?.properties as { id?: string; name?: string } | undefined;
  if (props?.id) show(props.id, props.name);
};
for (const [target, layer] of [[map, "city-fill"], [now, "old-fill"]] as const) {
  target.on("mousemove", layer, () => (target.getCanvas().style.cursor = "pointer"));
  target.on("mouseleave", layer, () => (target.getCanvas().style.cursor = ""));
  target.on("click", layer, pick);
}

const resize = () => {
  map.resize();
  now.resize();
};

// 操作パネル
$<HTMLElement>("#logo").innerHTML = logo;
const erasEl = $<HTMLElement>("#eras");
erasEl.innerHTML = ERAS.map(
  (e) => `<label><input type="radio" name="era" value="${e.id}" /> ${e.label}</label>`,
).join("");
const currentSelect = $<HTMLSelectElement>("#current");
currentSelect.innerHTML = CURRENT_MAPS.map((c) => `<option value="${c.id}">${c.label}</option>`).join("");

const render = () => {
  oldBadge.innerHTML = `<b>${state.era.label}</b><span>空中写真・当時の境界</span>`;
  nowBadge.innerHTML = `<b>現在</b><span>${state.current.label}・今の境界</span>`;
  erasEl.querySelectorAll<HTMLInputElement>("input").forEach((r) => (r.checked = r.value === state.era.id));
  document.querySelectorAll<HTMLInputElement>('input[name="screens"]').forEach((r) => (r.checked = r.value === String(state.screens)));
  currentSelect.value = state.current.id;
  $<HTMLElement>("#map-now").hidden = state.screens === 1;
  $<HTMLElement>("#current-field").hidden = state.screens === 1;
  $<HTMLElement>("#now-boundary-field").hidden = state.screens === 1;
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
  now.setStyle(nowStyle(state.current, era));
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
  now.setStyle(nowStyle(state.current, state.era));
  render();
});
$<HTMLSelectElement>("#opacity").addEventListener("change", (e) => {
  state.opacity = Number((e.target as HTMLSelectElement).value);
  map.setPaintProperty("photo", "raster-opacity", state.opacity);
});
$<HTMLInputElement>("#boundary").addEventListener("change", (e) => {
  state.boundary = (e.target as HTMLInputElement).checked;
  const v = state.boundary ? "visible" : "none";
  for (const id of ["city-casing", "city-line"]) map.setLayoutProperty(id, "visibility", v);
  now.setLayoutProperty("old-line", "visibility", v);
});
$<HTMLInputElement>("#now-boundary").addEventListener("change", (e) => {
  state.nowBoundary = (e.target as HTMLInputElement).checked;
  for (const id of ["now-casing", "now-line"]) now.setLayoutProperty(id, "visibility", state.nowBoundary ? "visible" : "none");
});

// 地名の検索
const qInput = $<HTMLInputElement>("#q");
const hitsEl = $<HTMLUListElement>("#hits");
let hits: Hit[] = [];
let ticket = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const listHits = (items: Hit[], empty = "見つかりませんでした") => {
  hits = items;
  hitsEl.hidden = false;
  hitsEl.innerHTML = items.length
    ? items.map((h, i) => `<li data-i="${i}">${esc(h.label)}<small>${esc(h.note)}</small></li>`).join("")
    : `<li class="empty">${empty}</li>`;
};
const go = (h: Hit) => {
  // 待っている検索の結果で、選んだ後に一覧が開き直らないようにする
  clearTimeout(timer);
  ticket++;
  hitsEl.hidden = true;
  qInput.value = h.label;
  // 統計の欄を開くと地図の大きさが変わってアニメーションが止まるので、動かさずに移す
  map.jumpTo({ center: [h.lng, h.lat], zoom: Math.max(map.getZoom(), h.id ? 12 : 14) });
  // 今の年代に無い市町村は、あった年代のうち一番新しいものに切り替える
  const id = h.id;
  const era = id && (existsAt(h, state.era.boundaryDate) ? state.era : [...ERAS].reverse().find((e) => existsAt(h, e.boundaryDate)));
  if (!id || !era) return;
  if (era === state.era) return show(id, h.label);
  // 移った先で新しい年代のタイルを読んでから塗る
  setEra(era);
  map.once("idle", () => show(id, h.label));
};
qInput.addEventListener("input", () => {
  clearTimeout(timer);
  // 前の語の結果を Enter で選ばないようにする
  hits = [];
  const q = qInput.value.trim();
  if (!q) {
    hitsEl.hidden = true;
    return;
  }
  timer = setTimeout(() => {
    const mine = ++ticket;
    listHits([], "検索しています…");
    search(q, state.era.boundaryDate)
      .then((items) => mine === ticket && listHits(items))
      .catch(() => mine === ticket && listHits([], "検索できませんでした"));
  }, 300);
});
qInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && hits[0]) go(hits[0]);
  if (e.key === "Escape") hitsEl.hidden = true;
});
hitsEl.addEventListener("click", (e) => {
  const h = hits[Number((e.target as HTMLElement).closest<HTMLElement>("li[data-i]")?.dataset.i)];
  if (h) go(h);
});

const about = $<HTMLDialogElement>("#about");
$("#about-open").addEventListener("click", () => about.showModal());

render();
// 共有された URL (?city=) の市町村を開く。塗りは境界のタイルを読んでから付ける
const shared = params.get("city");
// 境界を読み終える前に別の市町村を選んでいたら、そちらを残す
if (shared) map.once("idle", () => picked === undefined && show(shared));
// クリックを待たずに DuckDB を起こしておく
getDB().catch(() => undefined);
