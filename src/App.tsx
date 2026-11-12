// 画面の状態を 1 か所に持ち、地図のスタイル・統計の欄・URL をそこから作る
import maplibregl from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { About } from "./About";
import { Controls, type Settings } from "./Controls";
import { boundaryLayer, CURRENT_MAPS, ERAS, PHOTO_MAXZOOM, PHOTO_MINZOOM } from "./eras";
import { CollapsedAttribution } from "./kit/attribution";
import { featureBounds, focusFeature } from "./kit/bounds";
import { MapView } from "./kit/MapView";
import { photoCoverage } from "./kit/photoTiles";
import { crosshair, syncMaps } from "./kit/sync";
import { nowStyle, oldStyle } from "./mapStyles";
import { Panel } from "./Panel";
import { preload } from "./queria";
import { existsAt, type Hit, search } from "./search";

/** fit: false は住所から選んだとき。住所に寄せたまま、市町村の全体には引かない */
type Picked = { id: string; name: string; fit?: boolean };
type LngLat = [number, number];

const params = new URLSearchParams(location.search);
const initial: Settings = {
  era: ERAS.find((e) => e.id === params.get("era")) ?? ERAS[1],
  screens: params.get("screens") === "1" ? 1 : 2,
  // 以前の ?now=pale (淡色地図) は、選択肢に残した地図のうち近い標準地図で開く
  current: CURRENT_MAPS.find((c) => c.id === (params.get("now") === "pale" ? "std" : params.get("now"))) ?? CURRENT_MAPS[0],
  opacity: 1,
  boundary: true,
};
const shared = params.get("city");

/** 地図が止まったときに、表示している範囲にその年代の写真が 1 枚も無ければ知らせる */
const usePhotoMissing = (map: maplibregl.Map | null, era: Settings["era"]) => {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!map) return;
    const idle = () => setMissing(photoCoverage(map, era.tiles, PHOTO_MINZOOM, PHOTO_MAXZOOM) === false);
    setMissing(false);
    map.on("idle", idle);
    return () => {
      map.off("idle", idle);
    };
  }, [map, era]);
  return missing;
};

export const App = () => {
  const [settings, setSettings] = useState(initial);
  const [picked, setPicked] = useState<Picked | undefined>(shared ? { id: shared, name: shared } : undefined);
  const [about, setAbout] = useState(false);
  const [left, setLeft] = useState<maplibregl.Map | null>(null);
  const [right, setRight] = useState<maplibregl.Map | null>(null);
  const { era, screens, current, opacity, boundary } = settings;

  // 年代を変えると、選んでいた市町村はその年代の境界に無いことがあるので外す
  const set = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    if (patch.era) setPicked(undefined);
  }, []);

  const view = { era, current, opacity, boundary, picked: picked?.id };
  const oldMap = useMemo(() => oldStyle(view), [era, opacity, boundary, picked?.id]);
  const nowMap = useMemo(() => nowStyle(view), [era, current, opacity, boundary, picked?.id]);

  // URL に年代・画面・選んだ市町村を書く (位置は地図が #ズーム/緯度/経度 で書く)
  useEffect(() => {
    const q = new URLSearchParams({ era: era.id, screens: String(screens), now: current.id });
    if (picked) q.set("city", picked.id);
    history.replaceState(null, "", `?${q}${location.hash}`);
  }, [era, screens, current, picked]);

  // 2 つの地図の位置と、マウスの位置の十字をそろえる
  useEffect(() => {
    if (!left || !right) return;
    const offs = [syncMaps(left, right), crosshair(left, right), crosshair(right, left)];
    return () => offs.forEach((off) => off());
  }, [left, right]);

  // 選んだ市町村に寄せる。同じ市町村を選び直したときも寄せ直す
  const pickedNow = useRef(picked);
  pickedNow.current = picked;
  useEffect(() => {
    if (!left || !picked || picked.fit === false) return;
    const filter: maplibregl.FilterSpecification = ["==", ["get", "id"], picked.id];
    focusFeature(left, () => featureBounds(left, "boundary", boundaryLayer(era), filter), () => pickedNow.current === picked);
  }, [left, picked, era]);

  // どちらの地図でも、当時の市町村をクリックで選べる。ズームのボタンも付ける
  type Nav = maplibregl.NavigationControlOptions;
  const clickable = (layer: string, onMap: (m: maplibregl.Map) => void, nav?: Nav) => (m: maplibregl.Map) => {
    onMap(m);
    m.addControl(new maplibregl.NavigationControl(nav), "top-right");
    m.addControl(new CollapsedAttribution(), "bottom-right");
    m.on("mousemove", layer, () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
    m.on("click", layer, (e) => {
      const props = e.features?.[0]?.properties;
      const id: unknown = props?.id;
      const name: unknown = props?.name;
      // 選んでいる市町村の中のクリック (ダブルクリックのズームなど) では寄せ直さない
      if (typeof id === "string") setPicked((p) => (p?.id === id ? p : { id, name: typeof name === "string" ? name : id }));
    });
  };

  // 検索した住所。両方の地図に印を付け、その地点を含む当時の市町村を選ぶ (年代を変えても選び直す)
  const [home, setHome] = useState<LngLat>();
  useEffect(() => {
    if (!home) return;
    const markers = [left, right].flatMap((m) => (m ? [new maplibregl.Marker({ color: "#dc2626" }).setLngLat(home).addTo(m)] : []));
    return () => markers.forEach((m) => m.remove());
  }, [home, left, right]);
  useEffect(() => {
    if (!left || !home) return;
    const pick = () => {
      const f = left.queryRenderedFeatures(left.project(home), { layers: ["city-fill"] })[0];
      const id: unknown = f?.properties?.id;
      const name: unknown = f?.properties?.name;
      if (typeof id === "string") setPicked({ id, name: typeof name === "string" ? name : id, fit: false });
    };
    left.once("idle", pick);
    return () => {
      left.off("idle", pick);
    };
  }, [left, home, era]);

  const onPick = (hit: Hit) => {
    left?.jumpTo({ center: [hit.lng, hit.lat], zoom: Math.max(left.getZoom(), hit.id ? 12 : 15) });
    const id = hit.id;
    setHome(id ? undefined : [hit.lng, hit.lat]);
    if (!id) return;
    // 今の年代に無い市町村は、あった年代のうち一番新しいものに切り替える
    const target = existsAt(hit, era.boundaryDate) ? era : [...ERAS].reverse().find((e) => existsAt(hit, e.boundaryDate));
    if (!target) return;
    setSettings((s) => ({ ...s, era: target }));
    setPicked({ id, name: hit.label });
  };
  const searchAt = useCallback((q: string) => search(q, era.boundaryDate), [era]);

  const missing = usePhotoMissing(left, era);

  // クリックを待たずに DuckDB を起こして、最初に使うデータセットを読んでおく
  useEffect(() => {
    preload(["codh"]).catch(() => undefined);
  }, []);

  return (
    <>
      <Controls settings={settings} set={set} search={searchAt} onPick={onPick} onAbout={() => setAbout(true)} />
      <main>
        <div className="maps">
          <MapView
            style={oldMap}
            options={{ center: [139.6, 35.7], zoom: 10, hash: true, attributionControl: false }}
            onReady={clickable("city-fill", setLeft)}
          >
            <div className="badge badge-old">
              <b>{era.label}</b>
              <span>空中写真・当時の行政区域</span>
            </div>
            {missing && <div className="no-photo">この範囲には、この年代の空中写真がありません</div>}
          </MapView>
          <MapView
            style={nowMap}
            options={{ center: [139.6, 35.7], zoom: 10, attributionControl: false }}
            onReady={clickable("old-fill", setRight, { showCompass: false })}
            hidden={screens === 1}
          >
            <div className="badge badge-now">
              <b>現在</b>
              <span>{current.label}・現在の行政区域</span>
            </div>
          </MapView>
        </div>
        {picked && (
          <aside className="panel">
            <Panel key={picked.id} id={picked.id} name={picked.name} date={era.boundaryDate} year={era.year} />
          </aside>
        )}
      </main>
      <About open={about} onClose={() => setAbout(false)} />
    </>
  );
};
