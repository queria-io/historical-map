// 画面の状態を 1 か所に持ち、地図のスタイル・統計の欄・URL をそこから作る
import type maplibregl from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { About } from "./About";
import { Controls, type Settings } from "./Controls";
import { boundaryLayer, CURRENT_MAPS, ERAS } from "./eras";
import { featureBounds, focusFeature } from "./kit/bounds";
import { MapView } from "./kit/MapView";
import { onPhotoTile } from "./kit/photoTiles";
import { crosshair, syncMaps } from "./kit/sync";
import { nowStyle, oldStyle } from "./mapStyles";
import { Panel } from "./Panel";
import { preload } from "./queria";
import { existsAt, type Hit, search } from "./search";

type Picked = { id: string; name: string };

const params = new URLSearchParams(location.search);
const initial: Settings = {
  era: ERAS.find((e) => e.id === params.get("era")) ?? ERAS[1],
  screens: params.get("screens") === "1" ? 1 : 2,
  current: CURRENT_MAPS.find((c) => c.id === params.get("now")) ?? CURRENT_MAPS[0],
  opacity: 1,
  boundary: true,
  nowBoundary: true,
};
const shared = params.get("city");

/** 写真のタイルを読んだ数。動かすたびに数え直し、止まったときに 1 枚も無ければ知らせる */
const usePhotoMissing = (map: maplibregl.Map | null, era: Settings["era"]) => {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!map) return;
    const count = { found: 0, missing: 0 };
    const reset = () => Object.assign(count, { found: 0, missing: 0 });
    const off = onPhotoTile((found) => (found ? count.found++ : count.missing++));
    const idle = () => {
      // 前に読んだタイルだけで描けたときは、数えるものが無いので前の表示のままにする
      if (count.found > 0) setMissing(false);
      else if (count.missing > 0) setMissing(true);
    };
    reset();
    setMissing(false);
    map.on("movestart", reset);
    map.on("idle", idle);
    return () => {
      off();
      map.off("movestart", reset);
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
  const { era, screens, current, opacity, boundary, nowBoundary } = settings;

  // 年代を変えると、選んでいた市町村はその年代の境界に無いことがあるので外す
  const set = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    if (patch.era) setPicked(undefined);
  }, []);

  const view = { era, current, opacity, boundary, nowBoundary, picked: picked?.id };
  const oldMap = useMemo(() => oldStyle(view), [era, opacity, boundary, picked?.id]);
  const nowMap = useMemo(() => nowStyle(view), [era, current, boundary, nowBoundary, picked?.id]);

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

  // 選んだ市町村に寄せる
  const pickedId = useRef<string | undefined>(undefined);
  pickedId.current = picked?.id;
  useEffect(() => {
    const id = picked?.id;
    if (!left || !id) return;
    const filter: maplibregl.FilterSpecification = ["==", ["get", "id"], id];
    focusFeature(left, () => featureBounds(left, "boundary", boundaryLayer(era), filter), () => pickedId.current === id);
  }, [left, picked?.id, era]);

  // どちらの地図でも、当時の市町村をクリックで選べる
  const clickable = (layer: string, onMap: (m: maplibregl.Map) => void) => (m: maplibregl.Map) => {
    onMap(m);
    m.on("mousemove", layer, () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
    m.on("click", layer, (e) => {
      const props = e.features?.[0]?.properties;
      const id: unknown = props?.id;
      const name: unknown = props?.name;
      if (typeof id === "string") setPicked({ id, name: typeof name === "string" ? name : id });
    });
  };

  const onPick = (hit: Hit) => {
    left?.jumpTo({ center: [hit.lng, hit.lat], zoom: Math.max(left.getZoom(), hit.id ? 12 : 14) });
    const id = hit.id;
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
    preload(["codh.city.municipality"]).catch(() => undefined);
  }, []);

  return (
    <>
      <Controls settings={settings} set={set} search={searchAt} onPick={onPick} onAbout={() => setAbout(true)} />
      <main>
        <div className="maps">
          <MapView
            style={oldMap}
            options={{ center: [139.6, 35.7], zoom: 10, hash: true }}
            onReady={clickable("city-fill", setLeft)}
          >
            <div className="badge badge-old">
              <b>{era.label}</b>
              <span>空中写真・当時の境界</span>
            </div>
            {missing && <div className="no-photo">この年代の空中写真は、この範囲にありません</div>}
          </MapView>
          <MapView
            style={nowMap}
            options={{ center: [139.6, 35.7], zoom: 10 }}
            onReady={clickable("old-fill", setRight)}
            hidden={screens === 1}
          >
            <div className="badge badge-now">
              <b>現在</b>
              <span>{current.label}・今の境界</span>
            </div>
          </MapView>
        </div>
        {picked && (
          <aside className="panel">
            <Panel key={picked.id} id={picked.id} name={picked.name} date={era.boundaryDate} />
          </aside>
        )}
      </main>
      <About open={about} onClose={() => setAbout(false)} />
    </>
  );
};
