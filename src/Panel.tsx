// 選んだ当時の市町村の統計の欄。Queria の公開データセットに、ブラウザから SQL を実行して組み立てる
import type { ReactNode } from "react";
import { ShareButtons } from "./kit/ShareButtons";
import { AsyncNote, useAsync } from "./kit/useAsync";
import { query } from "./queria";
import { Then } from "./Then";
import {
  beforeSql,
  chainSql,
  type Before,
  type City,
  citySql,
  type Now,
  nowSql,
  type Registry,
  registrySql,
  type Step,
} from "./sql";

const year = (d: unknown) => (d == null ? "" : new Date(Number(d)).getUTCFullYear().toString());
const period = (from: unknown, to: unknown) => (to == null ? `${year(from)}年〜` : `${year(from)}〜${year(to)}年`);
const fmt = (v: number | null | undefined, digits = 0) =>
  v == null ? "—" : v.toLocaleString("ja-JP", { maximumFractionDigits: digits });
const shortName = (name: string | undefined) => name?.split(" ").pop() ?? "";
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 移り変わりのテーブルがまだ無いときなどは、その欄だけを出さない */
const safe = <T,>(p: Promise<T[]>): Promise<T[]> => p.catch(() => []);

type Data = { city: City; steps: Step[]; before: Before[]; nows: Now[]; registry?: Registry };

const load = async (id: string): Promise<Data> => {
  const [city] = await query<City>(citySql(id));
  if (!city) throw new Error(`${id} がありません`);
  const codes = (city.current ?? []).map((c) => c.code);
  const [steps, before, nows, registry] = await Promise.all([
    safe(query<Step>(chainSql(id))),
    safe(query<Before>(beforeSql(id))),
    codes.length ? query<Now>(nowSql(codes)) : Promise.resolve([]),
    city.city_code ? query<Registry>(registrySql(city.city_code)) : Promise.resolve([]),
  ]);
  return { city, steps, before, nows, registry: registry[0] };
};

export const Panel = ({ id, name, date }: { id: string; name: string; date: string }) => {
  const state = useAsync(() => load(id), [id]);
  if (state.status !== "done")
    return (
      <>
        <h2>{name}</h2>
        <AsyncNote state={state} />
      </>
    );
  const { city, steps, before, nows, registry } = state.value;
  const current = city.current ?? [];
  const [main, ...others] = current;
  const nowOf = (code: string | undefined) => nows.find((n) => n.area === code);
  const mainName = shortName(nowOf(main?.code)?.name) || "市区町村";
  return (
    <>
      <h2>{city.full_name}</h2>
      <p className="meta">
        {city.address.split("/")[0]}・{date.slice(0, 4)}年の境界
      </p>
      <ShareButtons
        text={`${city.full_name}（${period(city.valid_from, city.valid_to)}）と今の${mainName}を、空中写真と統計で比べる`}
        hashtag="まちの昔と今"
      />
      {main ? (
        <Compare city={city} registry={registry} now={nowOf(main.code)} share={main.share} currentShare={main.current_share} />
      ) : (
        <p className="note">今の市区町村との対応がありません。</p>
      )}
      {others.length > 0 && (
        <p className="note">
          ほかに {others.map((o) => `${shortName(nowOf(o.code)?.name) || o.code}（${pct(o.share)}）`).join("・")}に入っています。
        </p>
      )}
      <Chain before={before} steps={steps} />
      {main && <Then code={main.code} name={mainName} target={Number(date.slice(0, 4))} />}
      <p className="source">
        データ: Queria の <a href="https://queria.io/datasets/queria/codh" target="_blank" rel="noopener">codh</a>・
        <a href="https://queria.io/datasets/queria/e_stat" target="_blank" rel="noopener">e_stat</a>・
        <a href="https://queria.io/datasets/queria/reinfolib" target="_blank" rel="noopener">reinfolib</a>
        <br />
        <a href={`https://geoshape.ex.nii.ac.jp/city/resource/${id}.html`} target="_blank" rel="noopener">
          CODH の市区町村のページ
        </a>
      </p>
    </>
  );
};

type CompareProps = { city: City; registry?: Registry; now?: Now; share: number; currentShare: number };

const Compare = ({ city, registry, now, share, currentShare }: CompareProps) => {
  const thenDensity = registry && city.area_km2 ? registry.population / city.area_km2 : null;
  const nowName = shortName(now?.name) || "今";
  const rows: [string, ReactNode, ReactNode][] = [
    ["期間", period(city.valid_from, city.valid_to), "現在"],
    ["面積", `${fmt(city.area_km2, 1)} km²`, `${fmt(now?.area_km2, 1)} km²`],
    [
      "人口",
      registry ? <>{fmt(registry.population)}<span className="meta">（{registry.year}年）</span></> : "—",
      now ? <>{fmt(now.population)}<span className="meta">（2025年）</span></> : "—",
    ],
    ["世帯数", registry ? fmt(registry.households) : "—", fmt(now?.households)],
    ["人口密度", thenDensity ? `${fmt(thenDensity)} 人/km²` : "—", now ? `${fmt(now.population_density)} 人/km²` : "—"],
  ];
  return (
    <>
      <h3>当時と今</h3>
      <table className="compare">
        <thead>
          <tr>
            <th />
            <th className="then"><small>当時</small>{city.full_name}</th>
            <th className="now"><small>現在</small>{nowName}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, then, nowValue]) => (
            <tr key={label}>
              <th>{label}</th>
              <td>{then}</td>
              <td>{nowValue}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        当時の面積の {pct(share)} が今の{nowName}に入り、{nowName}の面積の {pct(currentShare)} にあたります。
        {registry ? "当時の人口は住民基本台帳の最初の年（日本人住民）の値です。" : "1995 年より前に消えた市町村は、当時の人口がありません。"}
      </p>
    </>
  );
};

const Chain = ({ before, steps }: { before: Before[]; steps: Step[] }) => {
  const names = before.map((b) => b.full_name);
  if (steps.length <= 1 && names.length === 0) return null;
  return (
    <>
      <h3>移り変わり</h3>
      {names.length > 0 && (
        <p className="chain-prev">
          {names.slice(0, 8).join("・")}
          {names.length > 8 && ` ほか ${names.length - 8}`} から
        </p>
      )}
      <ol className="chain">
        {steps.map((s) => (
          <li key={`${s.step}-${s.full_name}`} className={s.step === 0 ? "self" : undefined}>
            <b>{s.full_name}</b> <span className="meta">{period(s.valid_from, s.valid_to)}</span>
            {s.with_names?.length ? (
              <>
                <br />
                <span className="meta">{s.with_names.join("・")}と合わさる</span>
              </>
            ) : null}
          </li>
        ))}
      </ol>
    </>
  );
};

