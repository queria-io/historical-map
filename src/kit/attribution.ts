// 出典の表示。(i) を押したときだけ広げる。MapLibre の AttributionControl は最初に広げて表示するので、公開 API だけで作る
import type maplibregl from "maplibre-gl";

/** スタイルの各ソースの attribution を重複なしで並べる */
const attributions = (map: maplibregl.Map) =>
  [...new Set(Object.values(map.getStyle()?.sources ?? {}).flatMap((s) => ("attribution" in s && s.attribution ? [s.attribution] : [])))];

export class CollapsedAttribution implements maplibregl.IControl {
  private el = document.createElement("details");
  private body = document.createElement("div");
  private map?: maplibregl.Map;
  private update = () => {
    if (this.map) this.body.innerHTML = ["MapLibre", ...attributions(this.map)].join(" | ");
  };

  onAdd(map: maplibregl.Map) {
    this.map = map;
    this.el.className = "maplibregl-ctrl attribution";
    const summary = document.createElement("summary");
    summary.setAttribute("aria-label", "出典");
    summary.textContent = "i";
    this.el.append(summary, this.body);
    map.on("styledata", this.update);
    this.update();
    return this.el;
  }

  onRemove() {
    this.map?.off("styledata", this.update);
    this.el.remove();
  }
}
