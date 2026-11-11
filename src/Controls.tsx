// 左の操作パネル
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
  nowBoundary: boolean;
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
  const index = ERAS.indexOf(s.era);
  const two = s.screens === 2;
  return (
    <nav className="controls">
      <h1>まちの昔と今</h1>
      <PlaceSearch search={search} onPick={onPick} placeholder="地名・住所で検索（例: 田無町）" />
      <fieldset className="row">
        <legend>画面</legend>
        {([1, 2] as const).map((n) => (
          <label key={n}>
            <input type="radio" name="screens" checked={s.screens === n} onChange={() => set({ screens: n })} /> {n}画面
          </label>
        ))}
      </fieldset>
      <label className="check">
        <input type="checkbox" checked={s.boundary} onChange={(e) => set({ boundary: e.target.checked })} /> <i className="key-old" />
        当時の行政区域の境界
      </label>
      {two && (
        <label className="check">
          <input type="checkbox" checked={s.nowBoundary} onChange={(e) => set({ nowBoundary: e.target.checked })} />{" "}
          <i className="key-now" />
          現在の行政区域の境界（右）
        </label>
      )}
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
          右の地図
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
      <fieldset className="eras">
        <legend>
          年代
          <span className="step">
            <button type="button" title="前の年代" disabled={index === 0} onClick={() => set({ era: ERAS[index - 1] })}>▲</button>
            <button type="button" title="次の年代" disabled={index === ERAS.length - 1} onClick={() => set({ era: ERAS[index + 1] })}>▼</button>
          </span>
        </legend>
        {ERAS.map((e) => (
          <label key={e.id}>
            <input type="radio" name="era" checked={e === s.era} onChange={() => set({ era: e })} /> {e.label}
          </label>
        ))}
      </fieldset>
      <p className="hint">
        空中写真が無い地域があります。右の地図には現在と当時の行政区域の境界を重ねて表示します。どちらかの地図で当時の市町村をクリックすると統計を表示し、右の地図にその区域を太い破線で示します。
      </p>
      <button className="about-link" type="button" onClick={onAbout}>このサイトについて</button>
      <PoweredBy />
    </nav>
  );
};
