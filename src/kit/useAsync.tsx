// Promise を返す処理の結果を描くためのフック。deps が変わったら前の結果は捨てる
import { type DependencyList, useEffect, useState } from "react";

export type Async<T> = { status: "loading" } | { status: "done"; value: T } | { status: "error"; error: unknown };

export const useAsync = <T,>(run: (() => Promise<T>) | null, deps: DependencyList): Async<T> => {
  const [state, setState] = useState<Async<T>>({ status: "loading" });
  useEffect(() => {
    if (!run) return;
    let alive = true;
    setState({ status: "loading" });
    run().then(
      (value) => alive && setState({ status: "done", value }),
      (error: unknown) => alive && setState({ status: "error", error }),
    );
    return () => {
      alive = false;
    };
    // run は deps から作り直されるので、deps だけを見る
  }, deps);
  return state;
};

/** 読み込み中・失敗・空を同じ見た目で出す */
export const AsyncNote = ({ state, empty = false }: { state: Async<unknown>; empty?: boolean }) =>
  state.status === "loading" ? (
    <p className="note">読み込み中…</p>
  ) : state.status === "error" ? (
    <p className="note">読み込みに失敗しました（{String(state.error)}）。</p>
  ) : empty ? (
    <p className="note">データがありません。</p>
  ) : null;
