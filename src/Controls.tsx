// 左の操作パネル。年代は ◀ 一覧 ▶ で選ぶ。狭い画面では検索と年代だけを出し、ほかの設定は「設定」で開く
import { useState } from "react";
import { CURRENT_MAPS, type Era, ERAS } from "./eras";
import { PlaceSearch } from "./kit/PlaceSearch";
import { PoweredBy } from "./kit/PoweredBy";
import type { Hit } from "./search";

export type Settings = {
  era: Era;
  screens: 1 | 2;
  current: (typeof CURRENT_MAPS)[number];
  opacity: number;
  boundary: boolean;
};

type Props = {
  settings: Settings;
  set: (patch: Partial<Settings>) => void;
  search: (q: string) => Promise<Hit[]>;
  onPick: (hit: Hit) => void;
  onAbout: () => void;
};

const OPACITIES = [1, 0.8, 0.6, 0.4, 0.2, 0];

export const Controls = ({ settings: s, set, search, onPick, onAbout }: Props) => {
  const [open, setOpen] = useState(false);
  const index = ERAS.indexOf(s.era);
  const two = s.screens === 2;
  const step = (d: number) => set({ era: ERAS[index + d] });
  return (
    <nav className={open ? "controls open" : "controls"}>
      <h1>まちの昔と今</h1>
      <PlaceSearch search={search} onPick={onPick} placeholder="地名・住所で検索（例: 田無町）" />
      <div className="era-picker">
        <button type="button" disabled={index === 0} onClick={() => step(-1)} aria-label="前の年代">◀</button>
        <select value={s.era.id} onChange={(e) => set({ era: ERAS.find((x) => x.id === e.target.value) ?? s.era })} aria-label="年代">
          {ERAS.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>
        <button type="button" disabled={index === ERAS.length - 1} onClick={() => step(1)} aria-label="次の年代">▶</button>
        <button type="button" className="toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>設定</button>
      </div>
      <div className="more">
        <fieldset className="row">
          <legend>画面</legend>
          {([1, 2] as const).map((n) => (
            <label key={n}>
              <input type="radio" name="screens" checked={s.screens === n} onChange={() => set({ screens: n })} /> {n}画面
            </label>
          ))}
        </fieldset>
        <label className="check">
          <input type="checkbox" checked={s.boundary} onChange={(e) => set({ boundary: e.target.checked })} /> 行政区域の境界を表示
        </label>
        <label className="field">
          写真の不透明度
          <select value={s.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })}>
            {OPACITIES.map((o) => (
              <option key={o} value={o}>{Math.round(o * 100)}%</option>
            ))}
          </select>
        </label>
        {two && (
          <label className="field">
            現在の地図
            <select
              value={s.current.id}
              onChange={(e) => set({ current: CURRENT_MAPS.find((c) => c.id === e.target.value) ?? CURRENT_MAPS[0] })}
            >
              {CURRENT_MAPS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
        )}
        <p className="hint">
          空中写真が無い地域があります。地図で当時の市町村をクリックすると統計を表示し、現在の地図にその区域を太い破線で示します。現在の地図には、現在の行政区域の境界を紫の線で、当時の行政区域の境界を橙の破線で重ねます。
        </p>
        <button className="about-link" type="button" onClick={onAbout}>このサイトについて</button>
        <PoweredBy />
      </div>
    </nav>
  );
};
