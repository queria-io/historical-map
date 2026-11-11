// 2 つの地図をそろえる道具
import type maplibregl from "maplibre-gl";

/** 動かした側だけを元にし、受けた側の move では返さない */
export const syncMaps = (a: maplibregl.Map, b: maplibregl.Map) => {
  let syncing = false;
  const follow = (from: maplibregl.Map, to: maplibregl.Map) => () => {
    if (syncing) return;
    syncing = true;
    to.jumpTo({ center: from.getCenter(), zoom: from.getZoom(), bearing: from.getBearing(), pitch: from.getPitch() });
    syncing = false;
  };
  const [ab, ba] = [follow(a, b), follow(b, a)];
  ab();
  a.on("move", ab);
  b.on("move", ba);
  return () => {
    a.off("move", ab);
    b.off("move", ba);
  };
};

/** 片方の地図のマウスの位置を、もう片方に十字で示す */
export const crosshair = (from: maplibregl.Map, to: maplibregl.Map) => {
  const el = document.createElement("div");
  el.className = "cross";
  el.hidden = true;
  to.getContainer().append(el);
  const move = (e: maplibregl.MapMouseEvent) => {
    const p = to.project(e.lngLat);
    el.hidden = false;
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
  };
  const out = () => (el.hidden = true);
  from.on("mousemove", move);
  from.on("mouseout", out);
  return () => {
    from.off("mousemove", move);
    from.off("mouseout", out);
    el.remove();
  };
};
