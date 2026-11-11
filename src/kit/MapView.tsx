// MapLibre の地図。style を渡し直すと、差分だけを当てる (setStyle の diff)
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { type ReactNode, useEffect, useRef } from "react";

maplibregl.addProtocol("pmtiles", new Protocol().tile);

type Props = {
  style: StyleSpecification;
  /** 地図を作ったときに 1 回呼ぶ。クリックなどの操作はここで付ける */
  onReady?: (map: maplibregl.Map) => void | (() => void);
  options?: Omit<maplibregl.MapOptions, "container" | "style">;
  hidden?: boolean;
  children?: ReactNode;
};

export const MapView = ({ style, onReady, options, hidden, children }: Props) => {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  /** 地図に当てたスタイル。同じものを setStyle すると、読み込み前は差分を取れずに作り直しになる */
  const applied = useRef(style);

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({ container: container.current, style: applied.current, ...options });
    map.current = m;
    const cleanup = onReady?.(m);
    return () => {
      cleanup?.();
      m.remove();
      map.current = null;
    };
    // 地図は 1 回だけ作る。style の変化は下の effect で当てる
  }, []);

  useEffect(() => {
    if (!map.current || applied.current === style) return;
    applied.current = style;
    map.current.setStyle(style);
  }, [style]);

  return (
    <div className="map" ref={container} hidden={hidden}>
      {children}
    </div>
  );
};
