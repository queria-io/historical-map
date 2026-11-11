// ブラウザの DuckDB (WASM) で Queria の公開データセットに SQL を実行する。
// 本体は queria.io と同じく assets.queria.io に置いたものを使い、データは data.queria.io から読む
import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";

const WASM = "https://assets.queria.io/duckdb-wasm/1.33.1-dev57.0";
const DATA = "https://data.queria.io/datasets/queria";

/** 読むデータセット。SQL では <別名>.<スキーマ>.<テーブル> で書く */
const DATASETS = ["codh", "e_stat"] as const;

const boot = async (): Promise<AsyncDuckDB> => {
  const duckdb = await import("@duckdb/duckdb-wasm");
  const bundle = await duckdb.selectBundle({
    mvp: { mainModule: `${WASM}/duckdb-mvp.wasm`, mainWorker: `${WASM}/duckdb-browser-mvp.worker.js` },
    eh: { mainModule: `${WASM}/duckdb-eh.wasm`, mainWorker: `${WASM}/duckdb-browser-eh.worker.js` },
  });
  // ワーカーは別オリジンなので、取ってきた中身から起こす
  const res = await fetch(bundle.mainWorker ?? "");
  if (!res.ok) throw new Error(`${bundle.mainWorker}: ${res.status}`);
  const scriptUrl = URL.createObjectURL(await res.blob());
  const worker = new Worker(scriptUrl);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  try {
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    // 既定の true だと Parquet を丸ごと読むので、Range で必要な所だけ読む
    await db.open({ filesystem: { forceFullHTTPReads: false } });
    await attach(db);
  } catch (e) {
    // 次の getDB で起こし直すので、失敗したワーカーは止める
    await db.terminate();
    throw e;
  } finally {
    URL.revokeObjectURL(scriptUrl);
  }
  return db;
};

const attach = async (db: AsyncDuckDB): Promise<void> => {
  const conn = await db.connect();
  try {
    await conn.query("INSTALL ducklake; LOAD ducklake");
    // カタログは 1 回の GET で丸ごと取って渡す。DuckDB に Range で読ませると 16KiB ずつの往復が
    // 数百本になる (e_stat のカタログは 8MiB ほど)。データの Parquet は Range で読む
    await Promise.all(
      DATASETS.map(async (name) => {
        const url = `${DATA}/${name}/ducklake.duckdb`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        await db.registerFileBuffer(`${name}.duckdb`, new Uint8Array(await res.arrayBuffer()));
      }),
    );
    for (const name of DATASETS) {
      await conn.query(
        `ATTACH 'ducklake:${name}.duckdb' AS ${name} (READ_ONLY, DATA_PATH '${DATA}/${name}/ducklake.duckdb.files/', OVERRIDE_DATA_PATH true)`,
      );
    }
  } finally {
    await conn.close();
  }
};

let dbPromise: Promise<AsyncDuckDB> | null = null;
/** 最初に呼んだときに起こし、以後は同じものを返す。失敗したら次に起こし直す */
export const getDB = (): Promise<AsyncDuckDB> =>
  (dbPromise ??= boot().catch((e: unknown) => {
    dbPromise = null;
    throw e;
  }));

/** Arrow の値を JS の値にする。リストは配列、構造体はオブジェクト、BIGINT は number */
const plain = (v: unknown): unknown => {
  if (typeof v === "bigint") return Number(v);
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(plain);
  // Arrow のリスト (Vector) は配列、構造体と行 (StructRow) はオブジェクトを返す
  if ("toJSON" in v && typeof v.toJSON === "function") return plain(v.toJSON());
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
};

/** SQL を実行して行をオブジェクトの配列で返す */
export async function query<T>(sql: string): Promise<T[]> {
  const conn = await (await getDB()).connect();
  try {
    const started = performance.now();
    const table = await conn.query(sql);
    console.debug(`[sql] ${((performance.now() - started) / 1000).toFixed(2)}s ${sql.trim().split("\n")[0]}`);
    return table.toArray().map((row) => plain(row) as T);
  } finally {
    await conn.close();
  }
}
