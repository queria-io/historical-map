// このアプリが読む Queria のデータセット。SQL では codh.city.municipality のように別名で書く
import { connect } from "queria";

const conn = connect({ datasets: ["queria/codh", "queria/e_stat", "queria/reinfolib"] });

export const query = conn.sql;

/** データセットを先に ATTACH しておく。最初の表示を待たせないため、地図を開いたときに呼ぶ */
export const preload = (tables: readonly string[]): Promise<unknown> =>
  Promise.all(tables.map((t) => conn.sql(`SELECT 1 FROM ${t} LIMIT 0`)));
